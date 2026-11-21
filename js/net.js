/*
 * Shadows of the Citadel - peer-to-peer transport (WebRTC data channel).
 *
 * There is no game server. To connect, the host sends each friend an invite code and the friend sends
 * back a reply code (copy and paste, any chat app works). The codes carry the WebRTC handshake.
 * After that, game traffic flows directly between the browsers.
 *
 * Privacy: unless "same network only" is chosen, the handshake asks a public STUN server
 * (stun.l.google.com) which address the browser has on the internet. Peers always see each other's address.
 */
(function (root) {
  'use strict';

  const STUN = [{ urls: 'stun:stun.l.google.com:19302' }];
  const PREFIX = 'SOC1.';

  // ---------- compact, paste-safe codes ----------
  function toB64u(bytes) {
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function fromB64u(str) {
    const b = atob(str.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((str.length + 3) % 4));
    const out = new Uint8Array(b.length);
    for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i);
    return out;
  }
  async function pipe(bytes, stream) {
    const out = new Blob([bytes]).stream().pipeThrough(stream);
    return new Uint8Array(await new Response(out).arrayBuffer());
  }
  async function pack(obj) {
    let bytes = new TextEncoder().encode(JSON.stringify(obj));
    let tag = '0';
    if (typeof CompressionStream !== 'undefined') { bytes = await pipe(bytes, new CompressionStream('deflate-raw')); tag = '1'; }
    return PREFIX + tag + toB64u(bytes);
  }
  async function unpack(code) {
    const c = String(code || '').replace(/\s+/g, '');
    if (!c.startsWith(PREFIX)) throw new Error('That does not look like a game code.');
    const tag = c[PREFIX.length], body = c.slice(PREFIX.length + 1);
    let bytes;
    try { bytes = fromB64u(body); } catch (e) { throw new Error('The code was damaged when copied. Copy it again in full.'); }
    if (tag === '1') {
      if (typeof DecompressionStream === 'undefined') throw new Error('This browser cannot read compressed codes.');
      try { bytes = await pipe(bytes, new DecompressionStream('deflate-raw')); } catch (e) { throw new Error('The code was damaged when copied. Copy it again in full.'); }
    }
    try { return JSON.parse(new TextDecoder().decode(bytes)); } catch (e) { throw new Error('The code could not be read.'); }
  }

  class Peer {
    constructor(opts) {
      this.lanOnly = !!(opts && opts.lanOnly);
      this.pc = new RTCPeerConnection({ iceServers: this.lanOnly ? [] : STUN });
      this.dc = null;
      this.open = false;
      this.dead = false;
      this.onopen = null; this.onclose = null; this.onmessage = null;
      this.pc.onconnectionstatechange = () => {
        const st = this.pc.connectionState;
        if (st === 'failed' || st === 'closed' || st === 'disconnected') this._closed();
      };
    }
    _wire(dc) {
      this.dc = dc;
      dc.onopen = () => { this.open = true; if (this.onopen) this.onopen(); };
      dc.onclose = () => this._closed();
      dc.onmessage = e => {
        let m; try { m = JSON.parse(e.data); } catch (err) { return; }
        if (m && typeof m === 'object' && this.onmessage) this.onmessage(m);
      };
    }
    _closed() {
      if (this.dead) return;
      this.dead = true; this.open = false;
      if (this.onclose) this.onclose();
    }
    _gathered() {
      const pc = this.pc;
      return new Promise(resolve => {
        if (pc.iceGatheringState === 'complete') return resolve();
        const t = setTimeout(resolve, 6000);
        pc.addEventListener('icegatheringstatechange', () => {
          if (pc.iceGatheringState === 'complete') { clearTimeout(t); resolve(); }
        });
      });
    }
    async createOffer() {
      this._wire(this.pc.createDataChannel('citadel', { ordered: true }));
      await this.pc.setLocalDescription(await this.pc.createOffer());
      await this._gathered();
      return pack({ t: 'o', s: this.pc.localDescription.sdp });
    }
    async acceptOffer(code) {
      const o = await unpack(code);
      if (o.t !== 'o') throw new Error('That is a reply code. Paste the host\'s invite code here.');
      this.pc.ondatachannel = e => this._wire(e.channel);
      await this.pc.setRemoteDescription({ type: 'offer', sdp: o.s });
      await this.pc.setLocalDescription(await this.pc.createAnswer());
      await this._gathered();
      return pack({ t: 'a', s: this.pc.localDescription.sdp });
    }
    async acceptAnswer(code) {
      const o = await unpack(code);
      if (o.t !== 'a') throw new Error('That is an invite code. Paste your friend\'s reply code here.');
      await this.pc.setRemoteDescription({ type: 'answer', sdp: o.s });
    }
    send(msg) {
      if (this.dc && this.dc.readyState === 'open') { this.dc.send(JSON.stringify(msg)); return true; }
      return false;
    }
    close() {
      this.dead = true; this.open = false;
      try { if (this.dc) this.dc.close(); } catch (e) { /* ignore */ }
      try { this.pc.close(); } catch (e) { /* ignore */ }
    }
  }

  root.CitadelNet = { Peer, pack, unpack, supported: () => typeof RTCPeerConnection !== 'undefined' };
})(typeof window !== 'undefined' ? window : globalThis);
