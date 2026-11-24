/*
 * Shadows of the Citadel - online sessions (no DOM). Built on net.js and engine.js.
 *
 * The host runs the real game and is the only one who ever mutates it. Guests send action requests;
 * the host checks that it is their turn and that the request is well formed, applies it through the
 * engine, then sends every player their own redacted view of the new state. Seats nobody claims are
 * played by bots (the same logic as the Hint button), and a player who drops becomes a bot.
 */
(function (root) {
  'use strict';
  const C = root.Citadel, N = root.CitadelNet;

  const ACTIONS = {
    move: 1, contribute: 1, drawAction: 0, rest: 0, accuse: 1, give: 2, endTurn: 0, sabotageAction: 0
  };
  const BOT_DELAY = 850;

  function emitter() {
    const h = {};
    return {
      on(evt, fn) { (h[evt] = h[evt] || []).push(fn); return this; },
      emit(evt, a, b) { (h[evt] || []).forEach(fn => { try { fn(a, b); } catch (e) { console.error(e); } }); }
    };
  }

  function validArgs(name, args) {
    if (!Array.isArray(args) || args.length !== ACTIONS[name]) return false;
    if (name === 'contribute') return Array.isArray(args[0]) && args[0].length <= C.MAX_CONTRIBUTE && args[0].every(Number.isInteger);
    return args.every(Number.isInteger);
  }

  function cleanName(n, fallback) {
    n = String(n == null ? '' : n).replace(/[^\w .'-]/g, '').trim().slice(0, 16);
    return n || fallback;
  }

  // ---------------------------------------------------------------- host
  class Host {
    constructor(opts) {
      opts = opts || {};
      this.size = Math.max(3, Math.min(7, opts.size || 5));
      this.difficulty = opts.difficulty || 'normal';
      this.seed = opts.seed;
      this.lanOnly = !!opts.lanOnly;
      this.botDelay = opts.botDelay == null ? BOT_DELAY : opts.botDelay;
      this.seats = [];
      for (let i = 0; i < this.size; i++) {
        this.seats.push(i === 0 ? { kind: 'host', name: cleanName(opts.name, 'Host'), peer: null } : { kind: 'bot', name: 'Bot ' + i, peer: null });
      }
      this.game = null;
      this.botTimer = null;
      this.ev = emitter();
      this.role = 'host';
      this.seat = 0;
    }
    on(evt, fn) { this.ev.on(evt, fn); return this; }

    names() { return this.seats.map(s => s.name); }
    lobby() { return this.seats.map(s => ({ kind: s.kind === 'pending' ? 'bot' : s.kind, name: s.name })); }
    openSeat() { return this.seats.findIndex(s => s.kind === 'bot'); }

    // Start a handshake with one friend. Returns the invite code to send them.
    async invite() {
      if (this.game) throw new Error('The game has already started.');
      const seat = this.openSeat();
      if (seat < 0) throw new Error('Every seat is taken.');
      const peer = new N.Peer({ lanOnly: this.lanOnly });
      this.seats[seat] = { kind: 'pending', name: 'Waiting...', peer };
      peer.onopen = () => this._joined(seat, peer);
      peer.onmessage = m => this._message(seat, m);
      peer.onclose = () => this._dropped(seat, peer);
      try {
        const code = await peer.createOffer();
        this.ev.emit('lobby', this.lobby());
        return { seat, code };
      } catch (e) { this.cancelInvite(seat); throw e; }
    }
    async accept(seat, replyCode) {
      const s = this.seats[seat];
      if (!s || s.kind !== 'pending') throw new Error('That invite is no longer open.');
      await s.peer.acceptAnswer(replyCode);
    }
    cancelInvite(seat) {
      const s = this.seats[seat];
      if (s && s.kind === 'pending') {
        s.peer.onclose = null; s.peer.close();
        this.seats[seat] = { kind: 'bot', name: 'Bot ' + seat, peer: null };
        this.ev.emit('lobby', this.lobby());
      }
    }

    _joined(seat, peer) {
      const s = this.seats[seat];
      if (!s || s.peer !== peer) return;
      s.kind = 'human'; s.name = 'Player ' + (seat + 1); s.joined = true;
      this.ev.emit('lobby', this.lobby());
      this._sendLobby();
    }
    _sendLobby() {
      this.seats.forEach((s, i) => {
        if (s.kind === 'human' && s.peer) s.peer.send({ t: 'lobby', seats: this.lobby(), you: i, size: this.size, difficulty: this.difficulty });
      });
    }
    _dropped(seat, peer) {
      const s = this.seats[seat];
      if (!s || s.peer !== peer) return;
      const was = s.kind;
      this.seats[seat] = { kind: 'bot', name: (was === 'human' ? s.name + ' (bot)' : 'Bot ' + seat), peer: null };
      if (was === 'human') {
        this.ev.emit('left', seat, s.name);
        if (this.game) { this.broadcast(); this.runBots(); } else this._sendLobby();
      }
      this.ev.emit('lobby', this.lobby());
    }

    _message(seat, m) {
      if (m.t === 'hello') {
        this.seats[seat].name = cleanName(m.name, 'Player ' + (seat + 1));
        this.ev.emit('lobby', this.lobby());
        if (this.game) this.broadcast(); else this._sendLobby();
      } else if (m.t === 'act') {
        const r = this._apply(seat, m.name, m.args);
        const s = this.seats[seat];
        if (s && s.peer) s.peer.send({ t: 'result', ok: !!r.ok, msg: r.msg || '' });
      }
    }

    humans() { return this.seats.filter(s => s.kind === 'human').length + 1; }

    start() {
      if (this.game) return this.game;
      const g = C.createGame({ seed: this.seed, partySize: this.size, difficulty: this.difficulty });
      g.traitorHuman = this.seats[g.traitor].kind !== 'bot';
      this.game = g;
      this.seats.forEach((s, i) => {
        if (s.kind === 'human' && s.peer) s.peer.send({ t: 'start', you: i, names: this.names(), view: C.redact(g, i) });
      });
      this.ev.emit('start', g);
      this.ev.emit('state', g);
      this.runBots();
      return g;
    }

    // Used by the host's own UI.
    act(name, args) { return this._apply(0, name, args || []); }

    _apply(seat, name, args) {
      const g = this.game;
      if (!g) return { ok: false, msg: 'The game has not started.' };
      if (g.over) return { ok: false, msg: 'The game is over.' };
      if (!Object.prototype.hasOwnProperty.call(ACTIONS, name) || !validArgs(name, args)) return { ok: false, msg: 'Unknown action.' };
      if (g.active !== seat) return { ok: false, msg: 'It is not your turn.' };
      let r;
      try { r = C[name](g, ...args); } catch (e) { r = { ok: false, msg: 'That did not work.' }; }
      if (r && r.ok) this.broadcast();
      return r || { ok: false, msg: 'That did not work.' };
    }

    broadcast() {
      const g = this.game;
      if (!g) return;
      this.seats.forEach((s, i) => {
        if (s.kind === 'human' && s.peer) s.peer.send({ t: 'state', names: this.names(), view: C.redact(g, i) });
      });
      this.ev.emit('state', g);
      this.runBots();
    }

    runBots() {
      clearTimeout(this.botTimer);
      const g = this.game;
      if (!g || g.over) return;
      if (this.seats[g.active].kind !== 'bot') return;
      this.botTimer = setTimeout(() => this._botStep(), this.botDelay);
    }
    _botStep() {
      const g = this.game;
      if (!g || g.over || this.seats[g.active].kind !== 'bot') return;
      const h = C.suggest(g, { smart: true });
      let r = { ok: false };
      if (h) {
        if (h.type === 'play') r = C.contribute(g, h.cards);
        else if (h.type === 'move') r = C.move(g, h.dest);
        else if (h.type === 'draw') r = C.drawAction(g);
        else if (h.type === 'rest') r = C.rest(g);
        else if (h.type === 'accuse') r = C.accuse(g, h.target);
      }
      // Out of actions, nothing useful to do, or the suggestion was refused: pass the turn.
      if (!g.over && (!h || h.type === 'end' || !r.ok || g.actionsLeft <= 0)) C.endTurn(g);
      this.broadcast();
    }

    close() {
      clearTimeout(this.botTimer);
      this.seats.forEach(s => { if (s.peer) { s.peer.onclose = null; try { s.peer.send({ t: 'bye' }); } catch (e) { /* ignore */ } s.peer.close(); } });
    }
  }

  // ---------------------------------------------------------------- guest
  class Guest {
    constructor(opts) {
      opts = opts || {};
      this.name = cleanName(opts.name, 'Player');
      this.lanOnly = !!opts.lanOnly;
      this.role = 'guest';
      this.seat = -1;
      this.names = [];
      this.view = null;
      this.lobby = null;
      this.ev = emitter();
      this.peer = null;
      this.connected = false;
    }
    on(evt, fn) { this.ev.on(evt, fn); return this; }

    // Paste the host's invite code; returns the reply code to send back.
    async join(inviteCode) {
      const peer = new N.Peer({ lanOnly: this.lanOnly });
      this.peer = peer;
      peer.onopen = () => { this.connected = true; peer.send({ t: 'hello', name: this.name }); this.ev.emit('connected'); };
      peer.onmessage = m => this._message(m);
      peer.onclose = () => { this.connected = false; this.ev.emit('closed'); };
      try { return await peer.acceptOffer(inviteCode); } catch (e) { peer.close(); throw e; }
    }
    _message(m) {
      if (m.t === 'lobby') { this.lobby = m; this.seat = m.you; this.ev.emit('lobby', m); }
      else if (m.t === 'start') { this.seat = m.you; this.names = m.names || []; this.view = m.view; this.ev.emit('start', m.view); this.ev.emit('state', m.view); }
      else if (m.t === 'state') { this.names = m.names || this.names; this.view = m.view; this.ev.emit('state', m.view); }
      else if (m.t === 'result') { this.ev.emit('result', m); }
      else if (m.t === 'bye') { this.ev.emit('hostleft'); }
    }
    act(name, args) {
      if (!this.peer || !this.peer.send({ t: 'act', name, args: args || [] })) return { ok: false, msg: 'Not connected to the host.' };
      return { ok: true, pending: true };
    }
    close() { if (this.peer) { this.peer.onclose = null; this.peer.close(); } }
  }

  root.CitadelOnline = { Host, Guest, ACTIONS };
})(typeof window !== 'undefined' ? window : globalThis);
