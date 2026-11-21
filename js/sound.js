/*
 * Shadows of the Citadel - synthesized sound. No audio files: every effect is built from
 * oscillators and filtered noise with the Web Audio API, so there is nothing to license or download.
 * Browsers block audio until the first click or key press; unlock() handles that.
 */
(function (root) {
  'use strict';

  const KEY = 'citadel-muted';
  let ctx = null, master = null, muted = false, volume = 0.7;
  let ambience = null, noiseBuf = null;

  try { muted = localStorage.getItem(KEY) === '1'; } catch (e) { /* storage blocked */ }

  function ensure() {
    if (ctx) return ctx;
    const AC = root.AudioContext || root.webkitAudioContext;
    if (!AC) return null;
    try {
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : volume;
      master.connect(ctx.destination);
    } catch (e) { ctx = null; }
    return ctx;
  }

  function unlock() {
    const c = ensure();
    if (c && c.state === 'suspended') c.resume();
    return !!c;
  }

  function live() {
    if (muted) return null;
    const c = ensure();
    if (!c || c.state !== 'running') return null;
    return c;
  }

  function noiseBuffer(c) {
    if (noiseBuf) return noiseBuf;
    const len = c.sampleRate * 2;
    noiseBuf = c.createBuffer(1, len, c.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return noiseBuf;
  }

  // One oscillator with an attack/decay envelope. f2 glides the pitch.
  function tone(o) {
    const c = live(); if (!c) return;
    const t0 = c.currentTime + (o.delay || 0);
    const osc = c.createOscillator(), g = c.createGain();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(o.f, t0);
    if (o.f2) osc.frequency.exponentialRampToValueAtTime(o.f2, t0 + o.dur);
    const peak = (o.vol == null ? 0.25 : o.vol);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(peak, t0 + (o.attack || 0.006));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
    let node = osc;
    if (o.lp) { const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = o.lp; osc.connect(f); node = f; }
    node.connect(g); g.connect(master);
    osc.start(t0); osc.stop(t0 + o.dur + 0.05);
  }

  // Filtered noise burst.
  function noise(o) {
    const c = live(); if (!c) return;
    const t0 = c.currentTime + (o.delay || 0);
    const src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    src.buffer = noiseBuffer(c);
    f.type = o.filter || 'lowpass';
    f.frequency.setValueAtTime(o.freq || 1000, t0);
    if (o.freq2) f.frequency.exponentialRampToValueAtTime(o.freq2, t0 + o.dur);
    f.Q.value = o.q || 0.7;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(o.vol == null ? 0.2 : o.vol, t0 + (o.attack || 0.01));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t0, Math.random()); src.stop(t0 + o.dur + 0.05);
  }

  // A struck-bell timbre: a fundamental plus inharmonic partials with a long decay.
  function bell(f, vol, dur, delay) {
    [[1, 1], [2.01, 0.5], [2.76, 0.32], [5.4, 0.14]].forEach(p => {
      tone({ f: f * p[0], dur: dur * (1.1 - p[0] * 0.1), vol: vol * p[1], delay: delay || 0, attack: 0.003 });
    });
  }

  const sfx = {
    click()   { tone({ f: 700, f2: 520, dur: 0.05, vol: 0.12, type: 'triangle' }); },
    pick()    { tone({ f: 880, f2: 660, dur: 0.06, vol: 0.14, type: 'triangle' }); },
    unpick()  { tone({ f: 520, f2: 400, dur: 0.06, vol: 0.1, type: 'triangle' }); },
    deny()    { tone({ f: 160, f2: 120, dur: 0.14, vol: 0.18, type: 'square', lp: 500 }); },
    draw()    { noise({ filter: 'bandpass', freq: 2500, freq2: 900, q: 1.2, dur: 0.13, vol: 0.16 }); tone({ f: 600, dur: 0.05, vol: 0.06, delay: 0.07 }); },
    move()    { tone({ f: 190, f2: 110, dur: 0.14, vol: 0.22, type: 'triangle' }); noise({ freq: 700, dur: 0.1, vol: 0.08 }); },
    progress(){ tone({ f: 523, dur: 0.1, vol: 0.18, type: 'triangle' }); tone({ f: 659, dur: 0.14, vol: 0.18, type: 'triangle', delay: 0.08 }); },
    white()   { bell(784, 0.22, 1.1); bell(1175, 0.12, 0.9, 0.12); },
    black()   { tone({ f: 98, f2: 70, dur: 1.0, vol: 0.3, type: 'sawtooth', lp: 380 }); tone({ f: 104, dur: 0.9, vol: 0.2, type: 'sawtooth', lp: 320 }); noise({ freq: 160, dur: 0.5, vol: 0.2 }); },
    siege()   { noise({ freq: 220, freq2: 90, dur: 0.6, vol: 0.28 }); tone({ f: 70, f2: 48, dur: 0.6, vol: 0.28, type: 'sawtooth', lp: 220 }); noise({ filter: 'highpass', freq: 3000, dur: 0.08, vol: 0.08, delay: 0.1 }); },
    wound()   { noise({ filter: 'highpass', freq: 1800, dur: 0.12, vol: 0.2 }); tone({ f: 220, f2: 60, dur: 0.28, vol: 0.28, type: 'triangle' }); },
    fall()    { tone({ f: 330, f2: 82, dur: 0.9, vol: 0.28, type: 'sawtooth', lp: 600 }); noise({ freq: 200, dur: 0.6, vol: 0.2, delay: 0.1 }); },
    shadow()  { tone({ f: 196, f2: 174, dur: 0.9, vol: 0.12, type: 'sine', attack: 0.25 }); tone({ f: 207, f2: 185, dur: 0.9, vol: 0.1, type: 'sine', attack: 0.25 }); noise({ filter: 'bandpass', freq: 400, freq2: 900, q: 2, dur: 0.8, vol: 0.08, attack: 0.3 }); },
    turn()    { bell(523, 0.14, 0.9); },
    thunder() { noise({ freq: 260, freq2: 70, dur: 2.2, vol: 0.45, attack: 0.08 }); tone({ f: 55, f2: 40, dur: 1.8, vol: 0.2, type: 'sine', attack: 0.15 }); },
    exile()   { bell(660, 0.2, 1.2); tone({ f: 330, f2: 220, dur: 0.6, vol: 0.12, type: 'triangle', delay: 0.15 }); },
    win()     { [523, 659, 784, 1047, 1319].forEach((f, i) => bell(f, 0.18, 1.2, i * 0.16)); },
    lose()    { [392, 349, 311, 262, 196].forEach((f, i) => tone({ f, dur: 0.7, vol: 0.2, type: 'sawtooth', lp: 700, delay: i * 0.22 })); noise({ freq: 150, dur: 1.4, vol: 0.2, delay: 0.5 }); }
  };

  function play(name) {
    try { if (sfx[name]) sfx[name](); } catch (e) { /* never let audio break the game */ }
  }

  // Looping wind/rain bed. level: 0 clear, 1 rain, 2 storm. Fades smoothly.
  function setAmbience(level) {
    const c = live();
    if (!c) return;
    if (!ambience) {
      const src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain(), lfo = c.createOscillator(), lg = c.createGain();
      src.buffer = noiseBuffer(c); src.loop = true;
      f.type = 'bandpass'; f.frequency.value = 500; f.Q.value = 0.5;
      g.gain.value = 0;
      lfo.frequency.value = 0.12; lg.gain.value = 180;
      lfo.connect(lg); lg.connect(f.frequency);
      src.connect(f); f.connect(g); g.connect(master);
      src.start(); lfo.start();
      ambience = { g, f };
    }
    const target = [0.012, 0.03, 0.06][level] || 0;
    ambience.g.gain.linearRampToValueAtTime(target, c.currentTime + 1.5);
    ambience.f.frequency.linearRampToValueAtTime([420, 900, 1400][level] || 420, c.currentTime + 1.5);
  }

  function setMuted(m) {
    muted = !!m;
    try { localStorage.setItem(KEY, muted ? '1' : '0'); } catch (e) { /* storage blocked */ }
    if (ctx && master) master.gain.setTargetAtTime(muted ? 0 : volume, ctx.currentTime, 0.05);
    if (!muted) unlock();
  }

  root.CitadelSound = { play, unlock, setAmbience, setMuted, isMuted: () => muted, supported: () => !!(root.AudioContext || root.webkitAudioContext) };
})(typeof window !== 'undefined' ? window : globalThis);
