/* Board ambience: torch light, drifting fog, a vignette, gold glints, a lantern that follows the cursor, embers that
 * rise from the siege engines, and a red glow when the Citadel is in danger. It is all decoration: every layer ignores
 * the pointer, sits behind or above the interactive parts without moving them, and the whole thing is switched off by
 * reduced motion (the static lighting stays). It reads the game only through update(), so it has no effect on rules. */
(function () {
  'use strict';

  const A = { stage: null, cv: null, ctx: null, reduced: false, siege: 0, black: 0, storm: 0, parts: [], raf: 0, last: 0, acc: 0, dots: [], dotsAt: 0, w: 0, h: 0 };

  function mk(cls, parent, before) {
    const d = document.createElement('div');
    d.className = cls;
    d.setAttribute('aria-hidden', 'true');
    if (before) parent.insertBefore(d, before); else parent.appendChild(d);
    return d;
  }

  function init(stage) {
    if (A.stage || !stage) return;
    A.stage = stage;
    const overlay = stage.querySelector('.overlay');

    // under the interactive overlay: light that sits on the painted board
    const under = mk('amb amb-under', stage, overlay);
    [['torch t1', 'castle window'], ['torch t2', 'castle window'], ['torch t3', 'castle window'], ['torch t4', 'wheel candle'], ['torch t5', 'wheel candle']]
      .forEach(([c]) => mk(c, under));
    mk('fog f1', under); mk('fog f2', under);
    mk('glint g-col', under); mk('glint g-wheel', under);
    mk('siege-glow', under);

    // above everything on the board, but click-through: vignette, lantern, embers
    const over = mk('amb amb-over', stage, stage.querySelector('#expedition'));
    mk('lantern', over);
    mk('vignette', over);
    mk('amb-danger', over);
    A.cv = document.createElement('canvas');
    A.cv.className = 'embers';
    over.appendChild(A.cv);
    A.ctx = A.cv.getContext('2d');

    // The cursor lantern is disabled (it looked like a bright spot). Re-enable by restoring these listeners.
    if (false) stage.addEventListener('pointermove', e => {
      if (e.pointerType === 'touch') return;
      const r = stage.getBoundingClientRect();
      stage.style.setProperty('--lx', ((e.clientX - r.left) / r.width * 100).toFixed(1) + '%');
      stage.style.setProperty('--ly', ((e.clientY - r.top) / r.height * 100).toFixed(1) + '%');
      stage.classList.add('lit');
    });
    stage.addEventListener('pointerleave', () => stage.classList.remove('lit'));

    if (window.ResizeObserver) new ResizeObserver(resize).observe(stage); else window.addEventListener('resize', resize);
    document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); else start(); });
    resize();
    start();
  }

  function resize() {
    if (!A.cv) return;
    const r = A.stage.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    A.w = Math.max(1, Math.round(r.width)); A.h = Math.max(1, Math.round(r.height));
    A.cv.width = A.w * dpr; A.cv.height = A.h * dpr;
    A.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // where the lit siege dots are, in stage pixels (cached for a moment, they only move on resize)
  function litDots() {
    const now = performance.now();
    if (now - A.dotsAt < 400) return A.dots;
    A.dotsAt = now;
    const sr = A.stage.getBoundingClientRect();
    A.dots = [...A.stage.querySelectorAll('#siegeRow .siege-dot.on')].map(n => {
      const r = n.getBoundingClientRect();
      return { x: r.left - sr.left + r.width / 2, y: r.top - sr.top + r.height / 2 };
    });
    return A.dots;
  }

  function spawn(x, y, big) {
    if (A.parts.length > 140) return;
    A.parts.push({
      x: x + (Math.random() - .5) * 8, y,
      vx: (Math.random() - .5) * 10, vy: -(14 + Math.random() * 26),
      life: 0, max: 1.6 + Math.random() * 1.8, r: (big ? 1.6 : 1) * (.8 + Math.random() * 1.4), ph: Math.random() * 6.28
    });
  }

  function frame(t) {
    A.raf = requestAnimationFrame(frame);
    const dt = Math.min(.05, (t - (A.last || t)) / 1000);
    A.last = t;
    const ctx = A.ctx;
    ctx.clearRect(0, 0, A.w, A.h);

    // emit: more engines and a storm mean more sparks
    const dots = litDots();
    const rate = dots.length * (A.storm ? 1.6 : 1) * .55;       // sparks per second overall
    A.acc += rate * dt;
    while (A.acc >= 1 && dots.length) {
      A.acc -= 1;
      const d = dots[(Math.random() * dots.length) | 0];
      spawn(d.x, d.y, A.storm === 2);
    }
    if (!dots.length) A.acc = 0;

    ctx.globalCompositeOperation = 'lighter';
    for (let i = A.parts.length - 1; i >= 0; i--) {
      const p = A.parts[i];
      p.life += dt;
      if (p.life >= p.max) { A.parts.splice(i, 1); continue; }
      p.x += (p.vx + Math.sin(p.life * 3 + p.ph) * 9) * dt;
      p.y += p.vy * dt;
      const k = 1 - p.life / p.max;
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 4);
      g.addColorStop(0, `rgba(255,${150 + (k * 80) | 0},60,${(.9 * k).toFixed(2)})`);
      g.addColorStop(1, 'rgba(255,90,20,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 4, 0, 6.2832); ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  function start() {
    if (A.raf || A.reduced || document.hidden || !A.stage) return;
    A.last = 0;
    A.raf = requestAnimationFrame(frame);
  }
  function stop() {
    cancelAnimationFrame(A.raf); A.raf = 0;
  }

  function setReduced(r) {
    A.reduced = !!r;
    if (A.stage) A.stage.classList.toggle('amb-still', A.reduced);
    if (A.reduced) { stop(); A.parts.length = 0; if (A.ctx) A.ctx.clearRect(0, 0, A.w, A.h); } else start();
  }

  // siege 0..12, black swords 0..6, storm 0..2
  function update(o) {
    if (!A.stage) return;
    A.siege = o.siege | 0; A.black = o.black | 0; A.storm = o.storm | 0;
    const st = A.stage.style;
    st.setProperty('--siege', (A.siege / 12).toFixed(2));
    st.setProperty('--ruin', Math.min(1, (A.black / 6) * .7 + (A.siege / 12) * .6).toFixed(2));
    A.stage.dataset.storm = String(A.storm);
    A.stage.classList.toggle('in-danger', A.black >= 4 || A.siege >= 9);
    A.dotsAt = 0;
  }

  window.CitadelAmbience = { init, update, setReduced, _state: A };
})();
