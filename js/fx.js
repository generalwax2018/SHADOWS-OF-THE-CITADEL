/*
 * Shadows of the Citadel - weather and atmosphere particles for the live mission scenes.
 * One canvas per scene. Layers are described by a small profile (rain, snow, embers, sparks, fog, motes, dust),
 * all drawn by a single shared animation loop that pauses when the page is hidden.
 * No DOM beyond the canvas it is given; respects reduced motion by not animating at all.
 */
(function (root) {
  'use strict';

  let reduced = !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const active = new Set();
  let raf = 0, last = 0;

  function loop(t) {
    raf = root.requestAnimationFrame(loop);
    const dt = Math.min(0.05, (t - last) / 1000 || 0.016);
    last = t;
    active.forEach(f => f.frame(dt));
  }
  function start() { if (!raf && !reduced) { last = performance.now(); raf = root.requestAnimationFrame(loop); } }
  function stop() { if (raf) { root.cancelAnimationFrame(raf); raf = 0; } }
  if (root.document) root.document.addEventListener('visibilitychange', () => { if (root.document.hidden) stop(); else if (active.size) start(); });

  const rnd = (a, b) => a + Math.random() * (b - a);

  // One soft blob sprite, reused by fog and glow particles.
  let blob = null;
  function blobSprite() {
    if (blob) return blob;
    blob = root.document.createElement('canvas'); blob.width = blob.height = 64;
    const c = blob.getContext('2d'), g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,.9)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g; c.fillRect(0, 0, 64, 64);
    return blob;
  }

  // ---------- layer factories: each returns { n, init(p, w, h), step(p, dt, w, h, k), draw(c, p, w, h, k) } ----------
  const LAYERS = {
    rain: o => ({
      n: o.n || 70,
      init(p, w, h, first) { p.x = rnd(0, w * 1.2); p.y = first ? rnd(0, h) : -20; p.v = rnd(520, 820) * (o.speed || 1); p.l = rnd(10, 22); p.a = rnd(.18, .5); },
      step(p, dt, w, h) { p.y += p.v * dt; p.x -= p.v * dt * (o.wind == null ? 0.22 : o.wind); if (p.y > h) this.init(p, w, h, false); },
      draw(c, p, k) { c.strokeStyle = `rgba(${o.color || '188,210,235'},${p.a * k})`; c.lineWidth = 1; c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(p.x + p.l * (o.wind == null ? 0.22 : o.wind), p.y - p.l); c.stroke(); }
    }),
    snow: o => ({
      n: o.n || 60,
      init(p, w, h, first) { p.x = rnd(0, w); p.y = first ? rnd(0, h) : -6; p.v = rnd(18, 48) * (o.speed || 1); p.r = rnd(.8, 2.4); p.ph = rnd(0, 6.28); p.a = rnd(.3, .85); },
      step(p, dt, w, h) { p.y += p.v * dt; p.ph += dt * 1.4; p.x += Math.sin(p.ph) * 14 * dt + (o.wind || 8) * dt; if (p.y > h + 6 || p.x > w + 8) this.init(p, w, h, false); },
      draw(c, p, k) { c.fillStyle = `rgba(${o.color || '235,240,250'},${p.a * k})`; c.beginPath(); c.arc(p.x, p.y, p.r, 0, 6.28); c.fill(); }
    }),
    ember: o => ({
      n: o.n || 30, add: true,
      init(p, w, h, first) {
        const sx = (o.x == null ? 0.5 : o.x) * w, sy = (o.y == null ? 0.85 : o.y) * h, sp = (o.spread == null ? 0.3 : o.spread) * w;
        p.x = sx + rnd(-sp, sp); p.y = first ? rnd(0, h) : sy + rnd(-6, 6); p.v = rnd(26, 70) * (o.speed || 1); p.r = rnd(.8, 2.2); p.life = rnd(.4, 1); p.ph = rnd(0, 6.28);
      },
      step(p, dt, w, h) { p.y -= p.v * dt; p.ph += dt * 3; p.x += Math.sin(p.ph) * 12 * dt; p.life -= dt * .22; if (p.life <= 0 || p.y < -8) this.init(p, w, h, false); },
      draw(c, p, k) { const a = Math.max(0, p.life) * k; c.fillStyle = `rgba(${o.color || '255,170,70'},${a})`; c.beginPath(); c.arc(p.x, p.y, p.r, 0, 6.28); c.fill(); }
    }),
    spark: o => ({
      n: o.n || 24, add: true,
      init(p, w, h) {
        const sx = (o.x == null ? 0.5 : o.x) * w, sy = (o.y == null ? 0.75 : o.y) * h;
        p.x = sx; p.y = sy; const a = rnd(-2.6, -0.5); const v = rnd(60, 190); p.vx = Math.cos(a) * v; p.vy = Math.sin(a) * v; p.life = rnd(.35, 1); p.r = rnd(.7, 1.7);
        p.wait = rnd(0, 1.4);
      },
      step(p, dt, w, h) { if (p.wait > 0) { p.wait -= dt; return; } p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 260 * dt; p.life -= dt * 1.1; if (p.life <= 0) this.init(p, w, h); },
      draw(c, p, k) { if (p.wait > 0) return; c.fillStyle = `rgba(255,${190 + Math.floor(p.life * 50)},90,${Math.max(0, p.life) * k})`; c.beginPath(); c.arc(p.x, p.y, p.r, 0, 6.28); c.fill(); }
    }),
    fog: o => ({
      n: o.n || 6,
      init(p, w, h, first) { p.x = first ? rnd(-w * .2, w) : -w * .4; p.y = (o.y == null ? 0.7 : o.y) * h + rnd(-h * .18, h * .18); p.s = rnd(.5, 1.0) * w * .8; p.v = rnd(6, 16) * (o.speed || 1); p.a = rnd(.08, .2); },
      step(p, dt, w) { p.x += p.v * dt; if (p.x > w + p.s * .4) this.init(p, w, 0, false); },
      draw(c, p, k) { c.globalAlpha = p.a * k * (o.alpha || 1); c.drawImage(blobSprite(), p.x - p.s / 2, p.y - p.s * .22, p.s, p.s * .44); c.globalAlpha = 1; }
    }),
    mote: o => ({
      n: o.n || 40, add: true,
      init(p, w, h, first) { p.x = rnd(0, w); p.y = first ? rnd(0, h) : h + 4; p.v = rnd(6, 22) * (o.speed || 1); p.r = rnd(.7, 1.9); p.ph = rnd(0, 6.28); p.a = rnd(.3, .9); },
      step(p, dt, w, h) { p.y -= p.v * dt; p.ph += dt; p.x += Math.sin(p.ph) * 8 * dt; if (p.y < -6) this.init(p, w, h, false); },
      draw(c, p, k) { c.fillStyle = `rgba(${o.color || '255,226,150'},${p.a * (0.6 + 0.4 * Math.sin(p.ph * 2)) * k})`; c.beginPath(); c.arc(p.x, p.y, p.r, 0, 6.28); c.fill(); }
    }),
    dust: o => ({
      n: o.n || 20,
      init(p, w, h, first) { p.x = first ? rnd(0, w) : -30; p.y = rnd(0, h); p.v = rnd(90, 220) * (o.speed || 1); p.l = rnd(14, 40); p.a = rnd(.05, .18); },
      step(p, dt, w) { p.x += p.v * dt; if (p.x > w + 40) this.init(p, w, 0, false); },
      draw(c, p, k) { c.strokeStyle = `rgba(${o.color || '220,200,170'},${p.a * k})`; c.lineWidth = 1.2; c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(p.x - p.l, p.y + 2); c.stroke(); }
    })
  };

  // Per-mission atmosphere. x/y are where fires and forges sit, as fractions of the window.
  const PROFILES = {
    sea:       { layers: [['rain', { n: 90, speed: 1.1, wind: .3 }], ['fog', { n: 4, y: .5, alpha: .7 }]], storm: true },
    mountains: { layers: [['snow', { n: 70, wind: 14 }], ['dust', { n: 12, color: '240,240,255' }], ['ember', { n: 16, x: .5, y: .52, spread: .06 }]] },
    beacons:   { layers: [['ember', { n: 26, x: .5, y: .66, spread: .35, speed: .8 }], ['mote', { n: 16, color: '200,220,255' }]] },
    archives:  { layers: [['ember', { n: 46, x: .5, y: .95, spread: .5 }], ['snow', { n: 26, color: '170,160,150', speed: .6, wind: 4 }], ['fog', { n: 3, y: .8, alpha: .5 }]] },
    gates:     { layers: [['rain', { n: 70, wind: .12 }], ['spark', { n: 22, x: .43, y: .84 }]] },
    scouts:    { layers: [['fog', { n: 8, y: .72, alpha: 1.1, speed: 1.2 }], ['mote', { n: 14, color: '210,255,150', speed: .5 }]] },
    forge:     { layers: [['ember', { n: 40, x: .66, y: .8, spread: .1, speed: 1.2 }], ['spark', { n: 26, x: .64, y: .76 }]] },
    oath:      { layers: [['mote', { n: 46 }], ['dust', { n: 8, color: '255,230,180', speed: .4 }]] },
    pass:      { layers: [['snow', { n: 80, color: '200,205,215', wind: 18 }], ['ember', { n: 12, color: '255,90,60', x: .5, y: .7, spread: .4 }]] },
    banner:    { layers: [['dust', { n: 30, speed: 1.6 }], ['ember', { n: 18, x: .5, y: .75, spread: .4 }]] },
    blade:     { layers: [['mote', { n: 50, speed: 1.2, color: '255,215,120' }], ['fog', { n: 4, y: .85, alpha: .6 }]] },
    walls:     { layers: [['ember', { n: 34, x: .5, y: .8, spread: .45 }], ['rain', { n: 36, wind: .1, speed: .8 }], ['fog', { n: 3, y: .8, alpha: .6 }]] },
    default:   { layers: [['mote', { n: 24 }]] }
  };

  class Fx {
    constructor(canvas, id) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.profile = PROFILES[id] || PROFILES.default;
      this.k = 1;               // intensity, set by the game (progress, weather)
      this.rainBoost = 0;       // extra rain when the siege weather is stormy
      this.flashA = 0;
      this.w = 0; this.h = 0;
      this.layers = this.profile.layers.map(([type, o]) => {
        const L = LAYERS[type](o), parts = [];
        for (let i = 0; i < L.n; i++) parts.push({});
        return { L, parts, type, o, ready: false };
      });
      this.storm = null;
      this.t = 0;
      active.add(this); start();
    }
    resize() {
      const c = this.canvas, dpr = Math.min(root.devicePixelRatio || 1, 1.5);
      const w = Math.max(1, Math.round(c.clientWidth)), h = Math.max(1, Math.round(c.clientHeight));
      if (w === this.w && h === this.h) return;
      this.w = w; this.h = h; c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.layers.forEach(l => { l.ready = false; });
    }
    setStorm(level) {            // 0 clear, 1 rain, 2 storm: adds rain and lightning to scenes that are not already wet
      this.stormLevel = level;
      if (level > 0 && !this.profile.layers.some(l => l[0] === 'rain') && !this.storm) {
        const L = LAYERS.rain({ n: 60, wind: .25 }), parts = []; for (let i = 0; i < 60; i++) parts.push({});
        this.storm = { L, parts, type: 'rain', o: {}, ready: false };
      }
      if (level === 0) this.storm = null;
    }
    lightning() { this.flashA = 0.55; }
    frame(dt) {
      if (!this.canvas.isConnected) return;
      if (reduced) { if (this.w) this.ctx.clearRect(0, 0, this.w, this.h); return; }
      this.resize();
      const c = this.ctx, w = this.w, h = this.h;
      c.clearRect(0, 0, w, h);
      this.t += dt;
      const all = this.storm ? this.layers.concat([this.storm]) : this.layers;
      all.forEach(l => {
        if (!l.ready) { l.parts.forEach(p => l.L.init(p, w, h, true)); l.ready = true; }
        const boost = l.type === 'rain' ? 1 + (this.stormLevel || 0) * .25 : 1;
        c.globalCompositeOperation = l.L.add ? 'lighter' : 'source-over';
        const visible = Math.max(1, Math.round(l.parts.length * Math.min(1, this.k)));
        for (let i = 0; i < l.parts.length; i++) {
          const p = l.parts[i];
          l.L.step(p, dt, w, h, this.k);
          if (i < visible) l.L.draw(c, p, Math.min(1.2, this.k * boost));
        }
      });
      c.globalCompositeOperation = 'source-over';
      if ((this.profile.storm || this.stormLevel === 2) && this.flashA <= 0 && Math.random() < dt * (this.stormLevel === 2 ? .35 : .12)) this.lightning();
      if (this.flashA > 0) { c.fillStyle = `rgba(220,235,255,${this.flashA})`; c.fillRect(0, 0, w, h); this.flashA -= dt * 1.6; }
    }
    destroy() { active.delete(this); if (!active.size) stop(); }
  }

  // The game's motion setting can override the system preference at any time.
  function setReduced(on) { reduced = !!on; if (reduced) stop(); else if (active.size) start(); }

  root.CitadelFx = { create: (canvas, id) => new Fx(canvas, id), PROFILES, setReduced, isReduced: () => reduced };
})(typeof window !== 'undefined' ? window : globalThis);
