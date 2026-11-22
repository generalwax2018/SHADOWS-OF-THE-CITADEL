/* Shadows of the Citadel - UI. Renders engine state; never changes rules. */
(function () {
  'use strict';
  const C = window.Citadel;
  const SAVE_KEY = 'citadel-save-v1';
  const $ = id => document.getElementById(id);

  const Snd = window.CitadelSound || { play() {}, unlock() {}, setAmbience() {}, setMuted() {}, isMuted: () => true, supported: () => false };
  const reduced = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  let game = null;
  let online = null;          // { role: 'host'|'guest', seat, session, names } while playing online
  const ui = { selectedSlot: null, picked: [], shownLog: 0, setup: { size: 5, difficulty: 'normal' }, prev: null, endShown: false };

  // ---------- helpers ----------
  function el(tag, cls, html) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }
  function esc(t) { return String(t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  function dname(i) { return C.defenderDef(game.party[i].id).name; }
  function portraitUrl(i) { return `assets/${C.defenderDef(game.party[i].id).img}.jpg`; }

  const ICONS = {
    blade:  '<svg viewBox="0 0 24 24"><path d="M19.5 2.5 21.5 4.5 11 15 9 13z"/><path d="M8 14l2 2-3.5 3.5a1.4 1.4 0 0 1-2-2z"/><path d="M12.5 16.5l1 1-2 2-1-1z"/></svg>',
    shield: '<svg viewBox="0 0 24 24"><path d="M12 2.5 20 5.5V12c0 5-3.6 8.4-8 9.8C7.6 20.400 4 17 4 12V5.500z"/></svg>',
    scroll: '<svg viewBox="0 0 24 24"><path d="M7 3h11a2 2 0 0 1 2 2v1H9v11a3 3 0 0 1-3 3H6a2 2 0 0 1-2-2v-2h3z"/><path d="M9 8h11v10a3 3 0 0 1-3 3H8.800A4 4 0 0 0 9 19.500z"/></svg>',
    boot:   '<svg viewBox="0 0 24 24"><path d="M8 3h6v8l6 3v6H5v-5l3-2z"/></svg>'
  };
  function suitIcon(suit) { return `<span class="suit-ico suit-${suit}">${ICONS[suit]}</span>`; }

  // ---------- save / load ----------
  function save() {
    if (ui.preview || online) return;  // the backdrop game and online games are never autosaved
    try {
      if (game && !game.over) localStorage.setItem(SAVE_KEY, JSON.stringify(game));
      else localStorage.removeItem(SAVE_KEY);
    } catch (e) { /* storage may be blocked; the game still works */ }
  }
  function loadSave() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      const g = JSON.parse(raw);
      return g && g.version === 1 && Array.isArray(g.party) ? g : null;
    } catch (e) { return null; }
  }

  // ---------- board geometry (percent of board image 800x537) ----------
  const BOARD_W = 800, BOARD_H = 537;
  const FRAME_TOP = [65, 125, 185, 245, 305, 365, 425];

  function buildStatic() {
    const row = $('siegeRow');
    row.innerHTML = '';
    for (let i = 0; i < C.SIEGE_MAX; i++) row.appendChild(el('span', 'siege-dot'));

    const wheel = $('wheel');
    wheel.innerHTML = '';
    for (let i = 0; i < C.SEATS; i++) {
      const a = (-90 + i * 30) * Math.PI / 180;
      const seat = el('span', 'seat');
      seat.style.left = (17.5 + Math.cos(a) * (66 / BOARD_W * 100)) + '%';
      seat.style.top = (75.4 + Math.sin(a) * (66 / BOARD_H * 100)) + '%';
      wheel.appendChild(seat);
    }

    const slots = $('slots');
    slots.innerHTML = '';
    FRAME_TOP.forEach((y, i) => {
      const b = el('button', 'slot');
      b.type = 'button';
      b.style.top = (y / BOARD_H * 100) + '%';
      b.dataset.slot = i;
      b.addEventListener('click', () => onSlot(i));
      slots.appendChild(b);
    });
    const cit = $('citadelSpot');
    cit.onclick = () => { ui.selectedSlot = null; render(); };
    cit.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); cit.click(); } };
  }

  // ---------- effects: sound + animation, driven by what changed between two states ----------
  // Because effects come from state diffs, they work the same offline, as host, and as an online guest.
  const SHADOW_INFO = {
    siege1: ['Siege Engine', 'Another engine rolls up to the walls.'], siege2: ['Full Assault', 'Two engines hit the walls at once.'],
    dread: ['Dread', 'Every quest deadline shortens.'], wound: ['Arrow Storm', 'A defender is wounded.'],
    whisper: ['Whisper', 'A card is stolen from the active hand.'], gate: ['The Gate Opens', 'A black sword is seated.'],
    calm: ['Calm', 'Nothing stirs. For now.'], hand: ['Treachery', 'The Traitor strikes from within.']
  };

  function snapshot(s) {
    return {
      white: C.count(s, 'white'), black: C.count(s, 'black'), siege: s.siege, round: s.round, turn: s.turn, active: s.active,
      over: !!s.over, win: !!(s.over && s.over.win), revealed: !!s.traitorRevealed, rumors: s.rumors.length,
      hp: s.party.map(p => p.hp), alive: s.party.map(p => p.alive && !p.exiled),
      seats: s.seats.slice(), quests: s.quests.map(q => q ? { id: q.id, progress: q.progress, needed: q.needed } : null),
      hand: s.party[s.active] ? s.party[s.active].hand.map(c => c.id) : [], handTotal: s.party.reduce((n, p) => n + p.hand.length, 0),
      weather: s.siege >= 8 ? 2 : s.siege >= 4 ? 1 : 0, shadow: s.lastShadow
    };
  }

  function captureTokens() {
    const m = {};
    document.querySelectorAll('.token[data-i]').forEach(t => { m[t.dataset.i] = t.getBoundingClientRect(); });
    return m;
  }
  function flipTokens(before) {
    if (reduced || !before) return;
    document.querySelectorAll('.token[data-i]').forEach(t => {
      const old = before[t.dataset.i];
      if (!old || !t.animate) return;
      const now = t.getBoundingClientRect();
      const dx = old.left - now.left, dy = old.top - now.top;
      if (Math.abs(dx) < 2 && Math.abs(dy) < 2) return;
      t.animate([{ transform: `translate(${dx}px, ${dy}px) scale(1.15)` }, { transform: 'translate(0, 0) scale(1)' }],
        { duration: 650, easing: 'cubic-bezier(.2,.8,.2,1)' });
    });
  }

  function retrigger(node, cls, ms) {
    if (reduced || !node) return;
    node.classList.remove(cls);
    void node.offsetWidth;
    node.classList.add(cls);
    setTimeout(() => node.classList.remove(cls), ms || 700);
  }

  function slotRect(slot) {
    const b = $('slots').children[slot];
    const st = $('stage').getBoundingClientRect();
    if (!b) return null;
    const r = b.getBoundingClientRect();
    return { x: r.left - st.left + r.width / 2, y: r.top - st.top + r.height / 2 };
  }

  function showBanner(text, mine) {
    const b = $('banner');
    b.textContent = text;
    b.className = 'banner show' + (mine ? ' mine' : '');
    clearTimeout(showBanner.t);
    showBanner.t = setTimeout(() => { b.className = 'banner'; }, 1700);
  }

  function showShadow(type) {
    const info = SHADOW_INFO[type];
    if (!info) return;
    const box = $('shadowReveal');
    box.innerHTML = `<div class="sr-card${shadowArt.ok ? ' art' : ''}"><small>Shadow</small><b>${esc(info[0])}</b><span>${esc(info[1])}</span></div>`;
    box.className = 'shadow-reveal show';
    clearTimeout(showShadow.t);
    showShadow.t = setTimeout(() => { box.className = 'shadow-reveal'; }, 2300);
  }

  function runEffects(prev, cur) {
    const s = game;
    let played = false;
    const sfx = n => { played = true; Snd.play(n); };

    if (cur.turn !== prev.turn) {
      const mineNow = !online || cur.active === online.seat;
      const p = s.party[cur.active];
      showBanner(online ? (mineNow ? 'Your turn' : `${playerLabel(cur.active)}'s turn`) : `${C.defenderDef(p.id).name}'s turn`, online && mineNow);
      Snd.play('turn');
      if (cur.shadow) { showShadow(cur.shadow); setTimeout(() => Snd.play('shadow'), 250); }
    }

    // outcomes, most dramatic first
    if (cur.over && !prev.over) { sfx(cur.win ? 'win' : 'lose'); }
    if (cur.black > prev.black) { sfx('black'); retrigger($('stage'), 'shake', 500); }
    if (cur.white > prev.white) { sfx('white'); }
    if (cur.siege > prev.siege) { setTimeout(() => Snd.play('siege'), played ? 220 : 0); played = true; }
    if (cur.alive.some((a, i) => prev.alive[i] && !a)) { setTimeout(() => Snd.play('fall'), 120); played = true; retrigger($('hurt'), 'on', 700); }
    else if (cur.hp.some((h, i) => h < prev.hp[i])) { setTimeout(() => Snd.play('wound'), 60); played = true; retrigger($('hurt'), 'on', 600); }
    if (cur.revealed && !prev.revealed) { setTimeout(() => Snd.play('exile'), 150); played = true; }
    if (cur.weather === 2 && prev.weather < 2) setTimeout(() => Snd.play('thunder'), 300);

    // quests: progress sparkle, completion burst
    cur.quests.forEach((q, slot) => {
      const pq = prev.quests[slot];
      const node = $('slots').children[slot];
      if (!q) return;
      if (pq && pq.id === q.id && q.progress > pq.progress) { retrigger(node, 'gain', 800); if (!played) { Snd.play('progress'); played = true; } }
      if (pq && pq.id !== q.id && cur.white > prev.white) burstAt(slotRect(slot));
    });

    // newly seated swords / ignited siege dots
    [...$('wheel').children].forEach((n, i) => { if (!prev.seats[i] && cur.seats[i]) retrigger(n, 'pop', 900); });
    [...$('siegeRow').children].forEach((n, i) => { if (i >= prev.siege && i < cur.siege) retrigger(n, 'ignite', 900); });

    // little bumps on the counters that changed
    [['white', cur.white, prev.white], ['black', cur.black, prev.black], ['siege', cur.siege, prev.siege], ['round', cur.round, prev.round]]
      .forEach(([id, a, b]) => { if (a !== b) retrigger($(id), 'bump', 500); });

    // cards drawn
    if (!played && cur.handTotal > prev.handTotal && cur.turn === prev.turn) Snd.play('draw');
    Snd.setAmbience(cur.weather);
  }

  function burstAt(pos) {
    if (reduced || !pos) return;
    const b = el('div', 'burst');
    b.style.left = pos.x + 'px'; b.style.top = pos.y + 'px';
    $('stage').appendChild(b);
    setTimeout(() => b.remove(), 1200);
  }

  function playerLabel(i) {
    const nm = online && online.names && online.names[i];
    const d = C.defenderDef(game.party[i].id).name;
    return nm && online.names[i] !== 'Bot ' + i ? `${d} (${nm})` : d;
  }

  // ---------- rendering ----------
  function render() {
    if (!game) return;
    const s = game;
    const before = captureTokens();
    const prevHand = ui.prev ? ui.prev.hand : [];
    const prevHandKey = ui.prev ? ui.prev.active + ':' + ui.prev.turn : null;
    ui.newCards = ui.prev && prevHandKey === (s.active + ':' + s.turn) ? new Set(s.party[s.active].hand.map(c => c.id).filter(id => !prevHand.includes(id))) : new Set();

    $('round').textContent = s.round;
    $('white').textContent = C.count(s, 'white');
    $('black').textContent = C.count(s, 'black');
    $('siege').textContent = s.siege;
    $('black').parentNode.classList.toggle('warn', C.count(s, 'black') >= 4);
    $('siege').parentNode.classList.toggle('warn', s.siege >= 9);

    // wheel + siege (keep animation classes by only touching colour classes)
    [...$('wheel').children].forEach((n, i) => {
      n.classList.toggle('white', s.seats[i] === 'white');
      n.classList.toggle('black', s.seats[i] === 'black');
    });
    [...$('siegeRow').children].forEach((n, i) => n.classList.toggle('on', i < s.siege));
    $('shadowDeck').textContent = `${s.shadowDeck.length} left`;

    const cur = snapshot(s);
    renderSlots();
    renderPanels();
    renderLog();
    setWeather();
    updateNetChip();
    flipTokens(before);
    if (ui.prev) runEffects(ui.prev, cur);
    ui.prev = cur;
    save();
    if (s.over && !ui.endShown) {
      ui.endShown = true;
      // let the final sword / siege animation land before the result dialog covers the board
      if (reduced || ui.fast) showEnd(); else setTimeout(showEnd, 1100);
    }
  }

  function tokenEl(i) {
    const p = game.party[i];
    const t = el('span', 'token' + (i === game.active ? ' active' : '') + (!p.alive ? ' fallen' : ''));
    t.style.backgroundImage = `url('${portraitUrl(i)}')`;
    t.dataset.i = i;
    t.title = playerLabel(i);
    return t;
  }

  function renderSlots() {
    const s = game;
    [...$('slots').children].forEach((b, slot) => {
      const q = s.quests[slot];
      b.innerHTML = '';
      b.className = 'slot' + (!q ? ' empty' : '') + (ui.selectedSlot === slot ? ' selected' : '');
      if (!q) { b.disabled = true; b.setAttribute('aria-label', 'Empty quest frame'); return; }
      b.disabled = false;
      const def = C.questDef(q.id);
      const pct = Math.min(100, Math.round(q.progress / q.needed * 100));
      if (q.timer <= 2) b.classList.add('urgent');
      b.innerHTML = `<span class="qname">${esc(def.name)}</span>` +
        `<span class="qmeta">${suitIcon(def.suit)}<span>${q.progress}/${q.needed}</span>` +
        `<span class="timer" title="rounds left">${q.timer} rd</span></span>` +
        `<span class="bar"><i style="width:${pct}%"></i></span>`;
      b.setAttribute('aria-label', `${def.name}: ${q.progress} of ${q.needed}, ${q.timer} rounds left`);
      const tk = el('div', 'tokens');
      s.party.forEach((p, i) => { if (p.loc === slot && p.alive && !p.exiled) tk.appendChild(tokenEl(i)); });
      b.appendChild(tk);
    });
    const cit = $('tokens-citadel');
    cit.innerHTML = '';
    s.party.forEach((p, i) => { if (p.loc === C.CITADEL && !p.exiled) cit.appendChild(tokenEl(i)); });
    $('citadelSpot').classList.toggle('here', s.party[s.active].loc === C.CITADEL);
  }

  function hpPips(p) {
    let h = '<span class="hp" aria-label="health ' + p.hp + ' of ' + p.maxHp + '">';
    for (let i = 0; i < p.maxHp; i++) h += `<i class="${i < p.hp ? '' : 'off'}"></i>`;
    return h + '</span>';
  }

  function activeQuest() {
    const p = game.party[game.active];
    return p.loc >= 0 ? game.quests[p.loc] : null;
  }

  function renderPanels() {
    const s = game, p = s.party[s.active], d = C.defenderDef(p.id);

    // active defender
    const peek = C.nextShadowPeek(s);
    const peekText = { siege1: 'a siege engine', siege2: 'a full assault', dread: 'dread', wound: 'an arrow', whisper: 'a whisper',
      gate: 'the Gate', calm: 'calm', hand: 'treachery', reshuffle: 'a reshuffle' };
    let who = '';
    if (online) {
      who = mine() ? '<div class="turn-tag mine">Your turn</div>' : `<div class="turn-tag">Waiting for ${esc(online.names[s.active] || 'a player')}</div>`;
      if (isTraitorMe() && !s.traitorRevealed) who += '<div class="role-tag">You are the Traitor</div>';
    }
    $('activePanel').innerHTML =
      `<div class="portrait"><img src="assets/${d.img}.jpg" alt="${esc(d.name)}"></div>` +
      `<div>${who}<h3>${esc(d.name)}</h3>${hpPips(p)}<p>${esc(d.ability)}</p>` +
      (peek ? `<div class="peek">Foresight: next Shadow is ${peekText[peek] || peek}.</div>` : '') + '</div>';

    // hand
    const hand = $('hand');
    hand.innerHTML = '';
    ui.picked = ui.picked.filter(id => p.hand.some(c => c.id === id));
    const q = activeQuest();
    const def = q ? C.questDef(q.id) : null;
    let dealt = 0;
    p.hand.forEach(c => {
      const b = el('button', `card suit-${c.suit}` + (ui.picked.includes(c.id) ? ' selected' : '') + (def && def.suit === c.suit ? ' match' : ''));
      b.type = 'button';
      b.innerHTML = `<span class="ico suit-${c.suit}">${ICONS[c.suit]}</span>${C.SUIT_LABEL[c.suit]}`;
      if (handArt[c.suit]) { b.classList.add('art'); b.style.backgroundImage = `url('assets/cards/${c.suit}.jpg')`; }
      b.setAttribute('aria-pressed', ui.picked.includes(c.id));
      b.disabled = !mine();
      b.addEventListener('click', () => toggleCard(c.id));
      if (!reduced && ui.newCards && ui.newCards.has(c.id)) { b.classList.add('deal'); b.style.animationDelay = (dealt++ * 90) + 'ms'; }
      hand.appendChild(b);
    });
    if (!p.hand.length) hand.appendChild(el('div', 'empty-note', 'No cards. Gather supplies to draw more.'));
    $('handHint').textContent = `${p.hand.length}/${C.HAND_LIMIT}` + (def ? ` - ${def.name} likes ${C.SUIT_LABEL[def.suit]}` : '');

    renderWindows();
    renderMissions();
    renderQuestList();
    renderActions();
    renderParty();
    renderRumors();
    autoExpedition();
  }

  // ---------- live mission windows (the board's two right-hand panels) ----------
  // Each window shows one active mission as a living scene with its own weather. The mission the active defender
  // is standing on comes first, then the one being inspected, then the most urgent. Scenes change as progress is
  // made, and selecting a window pulls it open into the full expedition view.
  const mw = { wins: [], exp: null };
  ui.autoExp = (() => { try { return localStorage.getItem('citadel-auto-exp') !== '0'; } catch (e) { return true; } })();

  function buildWindows() {
    const ov = $('overlay');
    ['top', 'bottom'].forEach(pos => {
      const w = el('button', 'mwin ' + pos + ' empty');
      w.type = 'button';
      w.innerHTML = '<div class="mwin-stage"></div><div class="mwin-tokens"></div><div class="mwin-label"></div><span class="mwin-hint">Enter mission</span>';
      ov.appendChild(w);
      const rec = { el: w, stage: w.querySelector('.mwin-stage'), tokens: w.querySelector('.mwin-tokens'), label: w.querySelector('.mwin-label'), slot: null, qid: null, live: null };
      w.addEventListener('click', () => { if (rec.slot !== null) { ui.selectedSlot = rec.slot; render(); openExpedition(rec.slot, w); } });
      mw.wins.push(rec);
    });
  }

  function focusSlots(s) {
    const out = [];
    const add = slot => { if (slot != null && slot >= 0 && s.quests[slot] && !out.includes(slot)) out.push(slot); };
    add(s.party[s.active].loc);
    add(ui.selectedSlot);
    s.quests.map((q, i) => [q ? q.timer : 99, i]).sort((a, b) => a[0] - b[0]).forEach(x => add(x[1]));
    return out.slice(0, 2);
  }
  const stormLevel = s => (s.siege >= 8 ? 2 : s.siege >= 4 ? 1 : 0);

  function renderWindows() {
    if (!Missions || !mw.wins.length) return;
    const s = game, focus = focusSlots(s), fresh = !ui.prev;
    const newLines = s.log.slice(Math.min(ui.shownLog, s.log.length));
    mw.wins.forEach((w, i) => {
      const slot = focus[i] == null ? null : focus[i], q = slot === null ? null : s.quests[slot];
      w.el.classList.toggle('empty', !q);
      if (!q) { if (w.live) { w.live.destroy(); w.live.el.remove(); w.live = null; w.qid = null; w.slot = null; } return; }
      if (w.qid !== q.id) {
        const old = w.live;
        if (old) {
          const oldName = C.questDef(w.qid).name;
          if (newLines.some(l => l.text.indexOf(oldName + ' is complete') === 0)) old.flare();
          old.el.classList.add('leaving');
          setTimeout(() => { old.destroy(); old.el.remove(); }, 1050);
        }
        const lv = Missions.live(C.questDef(q.id));
        if (!fresh && !reduced) lv.el.classList.add('entering');
        w.stage.appendChild(lv.el);
        if (!fresh && !reduced) setTimeout(() => lv.el.classList.remove('entering'), 1100);
        w.live = lv; w.qid = q.id;
      }
      w.slot = slot;
      w.live.update(q, { storm: stormLevel(s) });
      const def = C.questDef(q.id), pct = Math.min(100, Math.round(q.progress / q.needed * 100));
      w.label.innerHTML = `<b>${esc(def.name)}</b><span>${q.progress}/${q.needed} &middot; ${q.timer} rd</span><div class="mwin-bar"><i style="width:${pct}%"></i></div>`;
      w.tokens.innerHTML = '';
      s.party.forEach((p, k) => { if (p.loc === slot && p.alive && !p.exiled) { const t = el('span', 'mc-token' + (k === s.active ? ' active' : '')); t.style.backgroundImage = `url('${portraitUrl(k)}')`; t.title = playerLabel(k); w.tokens.appendChild(t); } });
      w.el.setAttribute('aria-label', `${def.name}: ${q.progress} of ${q.needed}. Open mission view.`);
    });
  }

  // ---------- expedition view ----------
  // The mission window "pulls open" into a large, cinematic view of the mission. It opens by itself when the
  // active defender goes on a mission (unless switched off) and closes when they come home.
  function openExpedition(slot, fromEl) {
    const s = game, q = s.quests[slot];
    if (!q || !Missions) return;
    if (mw.exp && mw.exp.slot === slot && mw.exp.qid === q.id) return;
    closeExpedition(true);
    const def = C.questDef(q.id), root = $('expedition');
    root.innerHTML = '';
    root.className = 'exp open';
    const frame = el('div', 'exp-frame');
    const lv = Missions.live(def);
    frame.appendChild(lv.el);
    frame.insertAdjacentHTML('beforeend',
      `<div class="exp-top"><h3>${esc(def.name)}</h3><span class="mc-chip suit-${def.suit}">${ICONS[def.suit]} ${C.SUIT_LABEL[def.suit]} counts double</span><span class="mc-chip mc-timer" data-r="timer">${HOURGLASS}<b></b></span></div>` +
      '<button type="button" class="exp-close ghost" aria-label="Return to the map">Return to the map (Esc)</button>' +
      '<label class="exp-opt"><input type="checkbox" id="autoExp"> Go to a mission automatically</label>' +
      `<div class="exp-bottom"><div class="obj">${esc(def.text)}</div><div class="who"></div>` +
      '<div class="meter"><span data-r="prog"></span><div class="bar"><i></i></div><span data-r="left"></span></div></div>');
    root.appendChild(frame);
    const opt = frame.querySelector('#autoExp');
    opt.checked = ui.autoExp;
    opt.addEventListener('change', () => { ui.autoExp = opt.checked; try { localStorage.setItem('citadel-auto-exp', ui.autoExp ? '1' : '0'); } catch (e) { /* ignore */ } });
    frame.querySelector('.exp-close').addEventListener('click', () => closeExpedition());
    root.onclick = e => { if (e.target === root) closeExpedition(); };
    mw.exp = { slot, qid: q.id, live: lv, frame, root };
    updateExpedition();
    Snd.play('expedition');
    if (!reduced && fromEl && frame.animate) {
      const a = fromEl.getBoundingClientRect(), b = frame.getBoundingClientRect();
      if (b.width && a.width) frame.animate([
        { transform: `translate(${a.left - b.left}px, ${a.top - b.top}px) scale(${a.width / b.width}, ${a.height / b.height})`, opacity: .55 },
        { transform: 'none', opacity: 1 }], { duration: 650, easing: 'cubic-bezier(.2,.8,.2,1)' });
    }
    const first = frame.querySelector('.exp-close'); if (first) first.focus({ preventScroll: true });
  }

  function closeExpedition(instant) {
    const e = mw.exp;
    if (!e) return;
    mw.exp = null;
    const root = e.root;
    const done = () => { e.live.destroy(); if (!mw.exp) { root.className = 'exp'; root.innerHTML = ''; } };
    if (instant || reduced) { e.live.destroy(); if (!mw.exp) { root.className = 'exp'; root.innerHTML = ''; } return; }
    root.classList.remove('open');
    if (e.frame.animate) e.frame.animate([{ transform: 'none', opacity: 1 }, { transform: 'scale(.94)', opacity: 0 }], { duration: 300, easing: 'ease-in' });
    setTimeout(done, 320);
  }

  function updateExpedition() {
    const e = mw.exp;
    if (!e) return;
    const s = game, q = s.quests[e.slot];
    if (!q || q.id !== e.qid) {
      // the mission ended while it was open: show the outcome, then return to the map
      if (!e.ending) {
        e.ending = true;
        const def = C.questDef(e.qid), newLines = s.log.slice(-8);
        const won = newLines.some(l => l.text.indexOf(def.name + ' is complete') === 0);
        e.live.flare();
        e.frame.insertAdjacentHTML('beforeend', `<div class="exp-result ${won ? 'success' : 'fail'}"><b>${won ? 'COMPLETE' : 'FAILED'}</b></div>`);
        Snd.play(won ? 'white' : 'black');
        setTimeout(() => { if (mw.exp === e) closeExpedition(); }, 1700);
      }
      return;
    }
    e.live.update(q, { storm: stormLevel(s) });
    const f = e.frame, pct = Math.min(100, Math.round(q.progress / q.needed * 100));
    f.querySelector('.bar i').style.width = pct + '%';
    f.querySelector('[data-r="prog"]').textContent = `${q.progress} / ${q.needed}`;
    f.querySelector('[data-r="left"]').textContent = `${Math.max(0, q.needed - q.progress)} to go`;
    f.querySelector('[data-r="timer"] b').textContent = `${q.timer} round${q.timer === 1 ? '' : 's'} left`;
    const who = f.querySelector('.who'); who.innerHTML = '';
    s.party.forEach((p, i) => { if (p.loc === e.slot && p.alive && !p.exiled) { const t = el('span', 'mc-token' + (i === s.active ? ' active' : '')); t.style.backgroundImage = `url('${portraitUrl(i)}')`; t.title = playerLabel(i); who.appendChild(t); } });
  }

  function autoExpedition() {
    const s = game;
    if (!s || ui.preview) return;
    updateExpedition();
    const loc = s.party[s.active].loc, key = s.active + ':' + loc + ':' + s.turn;
    if (key === ui.expKey) return;
    const firstOfGame = ui.expKey == null;
    ui.expKey = key;
    if (firstOfGame || s.over) return;
    if (loc >= 0 && s.quests[loc] && ui.autoExp) openExpedition(loc, mw.wins.find(w => w.slot === loc) ? mw.wins.find(w => w.slot === loc).el : null);
    else if (loc < 0 && mw.exp) closeExpedition();
  }
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && mw.exp && $('modal').hidden) closeExpedition(); });

  // ---------- mission cards ----------
  const HOURGLASS = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 2h12v4l-5 6 5 6v4H6v-4l5-6-5-6z"/></svg>';
  const Missions = window.CitadelMissions;

  // Cards persist between renders so their animations keep running; only changes are applied.
  function renderMissions() {
    const s = game, box = $('missions');
    if (!Missions) return;
    if (box.children.length !== C.SLOTS) {
      box.innerHTML = '';
      for (let i = 0; i < C.SLOTS; i++) { const d = el('div', 'mslot'); d.setAttribute('role', 'listitem'); box.appendChild(d); }
    }
    const fresh = !ui.prev;                         // first render or a new game: no transitions
    const newLines = s.log.slice(Math.min(ui.shownLog, s.log.length));
    s.quests.forEach((q, slot) => {
      const cell = box.children[slot];
      const card = [...cell.children].find(c => c.classList.contains('mc') && !c.classList.contains('leaving'));
      const key = q ? q.id : '';
      if (card && card.dataset.qid === key) { updateCard(card, q, slot); return; }
      let delay = 0;
      if (card) {
        const old = C.questDef(card.dataset.qid).name;
        const won = newLines.some(l => l.text.indexOf(old + ' is complete') === 0);
        const lost = newLines.some(l => l.text.indexOf(old + ' has failed') === 0);
        if (fresh || reduced || (!won && !lost)) card.remove();
        else { leaveCard(card, won ? 'success' : 'fail'); delay = 750; }
      }
      cell.classList.toggle('empty', !q);
      if (q) {
        const nc = buildCard(q, slot);
        if (!fresh && !reduced) { nc.classList.add('entering'); nc.style.animationDelay = delay + 'ms'; setTimeout(() => nc.classList.remove('entering'), delay + 900); }
        cell.appendChild(nc);
        updateCard(nc, q, slot, true);
      }
    });
  }

  function buildCard(q, slot) {
    const def = C.questDef(q.id);
    const b = el('button', 'mc');
    b.type = 'button';
    b.dataset.qid = q.id;
    b.dataset.slot = slot;
    b.innerHTML = `<div class="mc-art">${Missions.art(def)}</div><div class="mc-shine"></div>` +
      `<div class="mc-top"><span class="mc-chip mc-suit suit-${def.suit}" title="Favoured suit: ${C.SUIT_LABEL[def.suit]}">${ICONS[def.suit]}</span>` +
      `<span class="mc-chip mc-timer" title="Rounds left">${HOURGLASS}<b></b></span></div>` +
      '<div class="mc-bottom"><div class="mc-meta"><span class="mc-prog"></span><span class="mc-tokens"></span></div><div class="mc-bar"><i></i></div></div>';
    b.addEventListener('click', () => onSlot(slot));
    Missions.attach(b, def);
    if (!reduced) {
      b.addEventListener('pointermove', e => {
        if (e.pointerType === 'touch') return;
        const r = b.getBoundingClientRect();
        b.style.setProperty('--ry', ((e.clientX - r.left) / r.width - 0.5) * 12 + 'deg');
        b.style.setProperty('--rx', (0.5 - (e.clientY - r.top) / r.height) * 10 + 'deg');
        b.style.setProperty('--sx', ((e.clientX - r.left) / r.width * 100) + '%');
      });
      b.addEventListener('pointerleave', () => { b.style.removeProperty('--ry'); b.style.removeProperty('--rx'); });
    }
    return b;
  }

  function updateCard(card, q, slot, isNew) {
    const s = game, def = C.questDef(q.id);
    const pct = Math.min(100, Math.round(q.progress / q.needed * 100));
    const bar = card.querySelector('.mc-bar i');
    const was = card._prog == null ? q.progress : card._prog;
    if (!isNew && q.progress > was && !reduced) {
      card.querySelector('.mc-art').classList.remove('gain'); void card.offsetWidth;
      card.classList.remove('gain'); void card.offsetWidth; card.classList.add('gain');
      setTimeout(() => card.classList.remove('gain'), 900);
      const f = el('span', 'mc-float', '+' + (q.progress - was));
      card.appendChild(f); setTimeout(() => f.remove(), 1300);
      if (bar.animate) bar.animate([{ width: (card._pct || 0) + '%' }, { width: pct + '%' }], { duration: 650, easing: 'cubic-bezier(.2,.8,.2,1)' });
    } else if (!isNew && q.progress < was && !reduced) {
      // sabotage undid progress
      card.classList.remove('hit'); void card.offsetWidth; card.classList.add('hit'); setTimeout(() => card.classList.remove('hit'), 700);
    }
    bar.style.width = pct + '%';
    card._prog = q.progress; card._pct = pct;
    Missions.applyProgress(card.querySelector('.mc-svg'), q.progress / q.needed);
    card.querySelector('.mc-prog').textContent = `${q.progress} / ${q.needed}`;
    card.querySelector('.mc-timer b').textContent = q.timer;
    card.classList.toggle('urgent', q.timer <= 2);
    card.classList.toggle('selected', ui.selectedSlot === slot);
    const here = s.party.map((p, i) => i).filter(i => s.party[i].loc === slot && s.party[i].alive && !s.party[i].exiled);
    card.classList.toggle('here', here.length > 0);
    const tk = card.querySelector('.mc-tokens');
    tk.innerHTML = '';
    here.forEach(i => {
      const t = el('span', 'mc-token' + (i === s.active ? ' active' : ''));
      t.style.backgroundImage = `url('${portraitUrl(i)}')`;
      t.title = playerLabel(i);
      tk.appendChild(t);
    });
    card.setAttribute('aria-label', `${def.name}. Favoured suit ${C.SUIT_LABEL[def.suit]}. Progress ${q.progress} of ${q.needed}. ${q.timer} rounds left.`);
  }

  function leaveCard(card, outcome) {
    card.classList.add('leaving', outcome);
    card.disabled = true;
    const st = el('div', 'mc-stamp ' + outcome, outcome === 'success' ? 'COMPLETE' : 'FAILED');
    card.appendChild(st);
    setTimeout(() => card.remove(), 1500);
  }

  function renderQuestList() {
    const box = $('questList');
    box.innerHTML = '';
    game.quests.forEach((q, slot) => {
      if (!q) return;
      const def = C.questDef(q.id);
      const b = el('button', 'qrow' + (ui.selectedSlot === slot ? ' selected' : ''));
      b.type = 'button';
      b.innerHTML = `<span>${suitIcon(def.suit)} ${esc(def.name)}</span><span>${q.progress}/${q.needed}</span>` +
        `<small>${q.timer} round${q.timer === 1 ? '' : 's'} left` +
        (game.party.some((p, i) => p.loc === slot && p.alive && !p.exiled) ? ' - ' + game.party.map((p, i) => (p.loc === slot && p.alive && !p.exiled) ? dname(i) : '').filter(Boolean).join(', ') : '') +
        `</small><span class="qbar"><i style="width:${Math.min(100, Math.round(q.progress / q.needed * 100))}%"></i></span>`;
      b.addEventListener('click', () => onSlot(slot));
      box.appendChild(b);
    });
  }

  function toggleCard(id) {
    const i = ui.picked.indexOf(id);
    if (i >= 0) ui.picked.splice(i, 1);
    else if (ui.picked.length < C.MAX_CONTRIBUTE) ui.picked.push(id);
    else flash(`You can play at most ${C.MAX_CONTRIBUTE} cards at once.`);
    render();
  }

  function renderActions() {
    const s = game, p = s.party[s.active], box = $('actions');
    box.innerHTML = '';
    const q = activeQuest();
    const over = !!s.over;
    $('actionsLeft').textContent = over ? '' : `${s.actionsLeft} of ${s.maxActions} left`;

    function btn(label, fn, opts) {
      opts = opts || {};
      const b = el('button', opts.cls || '', label);
      b.type = 'button';
      b.disabled = over || !mine() || (opts.needAction !== false && s.actionsLeft <= 0) || opts.disabled === true;
      if (opts.title) b.title = opts.title;
      b.addEventListener('click', fn);
      box.appendChild(b);
      return b;
    }

    // movement
    if (p.loc !== C.CITADEL) btn('Return to Citadel', () => act(() => perform('move', C.CITADEL)));
    if (ui.selectedSlot !== null && s.quests[ui.selectedSlot] && p.loc !== ui.selectedSlot) {
      btn('Move to ' + C.questDef(s.quests[ui.selectedSlot].id).name, () => act(() => perform('move', ui.selectedSlot)), { cls: 'primary' });
    }

    // contribute
    const gain = q ? C.contributeValue(s, s.active, ui.picked) : 0;
    btn(q ? `Play ${ui.picked.length} card${ui.picked.length === 1 ? '' : 's'} (+${gain})` : 'Play cards (go to a quest)',
      () => act(() => { const r = perform('contribute', ui.picked.slice()); ui.picked = []; return r; }),
      { cls: 'primary', disabled: !q || ui.picked.length === 0, title: 'Matching suit counts double' });

    btn('Gather supplies', () => act(() => perform('drawAction')), { title: 'Draw 2 cards (3 for Lord Harren) [G]' });
    btn('Rest', () => act(() => perform('rest')), { disabled: p.loc !== C.CITADEL, title: 'At the Citadel: everyone there heals 1 [R]' });
    const mates = giveTargets();
    btn('Give card...', openGive, { disabled: ui.picked.length !== 1 || mates.length === 0,
      title: 'Select exactly one card, then pass it to a defender standing in the same place' });
    btn('Accuse...', openAccuse, { disabled: s.rumors.length === 0 || s.traitorRevealed, title: 'Needs at least one sabotage rumor' });
    if (online && isTraitorMe() && !s.traitorRevealed) {
      btn('Sabotage', () => act(() => perform('sabotageAction')), { cls: 'danger', title: 'Secretly strike. Witnesses will name you and a few others.' });
    }
    btn('Hint', hint, { cls: 'ghost', needAction: false, title: 'Suggest a sensible next step [H]' });
    btn('End turn', endTurn, { cls: 'danger', needAction: false, title: 'Finish this defender\'s turn [E]' });
  }

  function giveTargets() {
    const s = game, p = s.party[s.active];
    return s.party.map((q, i) => i).filter(i => i !== s.active && s.party[i].alive && !s.party[i].exiled &&
      s.party[i].loc === p.loc && s.party[i].hand.length < C.HAND_LIMIT);
  }

  function hint() {
    if (!game || game.over || !mine()) return;
    const h = C.suggest(game);
    if (!h) return;
    if (h.type === 'play') ui.picked = h.cards.slice();
    if (h.type === 'move') ui.selectedSlot = h.dest;
    render();
    flash('Hint: ' + h.text, true);
  }

  function openGive() {
    const s = game;
    if (ui.picked.length !== 1) return;
    const cardId = ui.picked[0];
    const card = s.party[s.active].hand.find(c => c.id === cardId);
    let h = `<h2 id="modalTitle">Give a ${C.SUIT_LABEL[card.suit]} card</h2><p>Pass it to a defender standing with you. This costs 1 action.</p><div class="pick">`;
    giveTargets().forEach(i => {
      h += `<button type="button" data-i="${i}"><div class="portrait"><img src="${portraitUrl(i)}" alt=""></div>${esc(dname(i))}<br><small>${s.party[i].hand.length}/${C.HAND_LIMIT} cards</small></button>`;
    });
    h += '</div><div class="modal-actions"><button type="button" data-a="cancel">Cancel</button></div>';
    openModal(h);
    const box = $('modalCard');
    box.querySelectorAll('.pick button').forEach(b => b.onclick = () => { closeModal(); ui.picked = []; act(() => perform('give', cardId, +b.dataset.i)); });
    box.querySelector('[data-a="cancel"]').onclick = closeModal;
  }

  function renderParty() {
    const s = game, box = $('party');
    box.innerHTML = '';
    const sus = C.suspicion(s);
    s.party.forEach((p, i) => {
      const d = C.defenderDef(p.id);
      const down = !p.alive || p.exiled;
      const m = el('div', 'pm' + (i === s.active ? ' active' : '') + (down ? ' down' : ''));
      const badge = p.exiled ? ['Exiled', 'bad'] : !p.alive ? ['Fallen', 'bad'] : p.stunned ? ['Stunned', 'bad'] : i === s.active ? ['Active', ''] : null;
      const owner = online && online.names[i] ? online.names[i] : '';
      const youTag = online && i === online.seat ? ' (you)' : '';
      m.innerHTML = (badge ? `<span class="badge ${badge[1]}">${badge[0]}</span>` : '') +
        `<div class="portrait"><img src="assets/${d.img}.jpg" alt=""></div>` +
        `<div class="nm">${esc(d.name)}</div>` + (owner ? `<div class="owner">${esc(owner)}${youTag}</div>` : '') +
        `<div class="where">${down ? '-' : esc(C.locName(s, p.loc))}</div>` + hpPips(p);
      m.title = d.ability + (s.rumors.length ? `\nNamed in ${sus[i]} of ${s.rumors.length} rumors.` : '');
      box.appendChild(m);
    });
  }

  function renderRumors() {
    const s = game, box = $('rumors');
    if (!s.rumors.length) { box.innerHTML = '<div class="empty-note">No sabotage yet. When one strikes, witnesses name who was nearby; the Traitor is always among them.</div>'; return; }
    const sus = C.suspicion(s);
    let h = '';
    s.rumors.forEach((r, k) => { h += `<div class="rumor">#${k + 1}: ${r.map(i => `<b>${esc(dname(i))}</b>`).join(' &middot; ')}</div>`; });
    const order = s.party.map((p, i) => i).filter(i => sus[i] > 0).sort((a, b) => sus[b] - sus[a]);
    h += '<div class="tally">' + order.map(i => `<span class="${sus[i] === s.rumors.length ? 'hot' : ''}">${esc(dname(i))} ${sus[i]}/${s.rumors.length}</span>`).join('') + '</div>';
    if (s.traitorRevealed) h += `<div class="rumor"><b>Unmasked:</b> ${esc(dname(s.traitor))}</div>`;
    box.innerHTML = h;
  }

  function renderLog() {
    const box = $('log');
    if (ui.shownLog > game.log.length) { box.innerHTML = ''; ui.shownLog = 0; }
    for (let i = ui.shownLog; i < game.log.length; i++) {
      const e = game.log[i];
      box.appendChild(el('div', e.cls, esc(e.text)));
      if (e.cls === 'win' || e.cls === 'lose') toast(e.text, e.cls);
    }
    ui.shownLog = game.log.length;
    box.scrollTop = box.scrollHeight;
  }

  function toast(text, cls) {
    const t = el('div', 'toast ' + (cls || ''), esc(text));
    const box = $('toasts');
    box.appendChild(t);
    while (box.children.length > 3) box.removeChild(box.firstChild);
    setTimeout(() => t.remove(), 3900);
  }

  function flash(text, good) {
    const m = $('msg');
    m.textContent = text || '';
    m.className = 'msg' + (good ? ' ok' : '');
  }

  // ---------- interactions ----------
  // Every rules action goes through here: offline it runs the engine, as host it runs the engine and
  // broadcasts, as a guest it asks the host and waits for the new state.
  function perform(name, ...args) {
    if (online) {
      if (!mine()) return { ok: false, msg: 'It is not your turn.' };
      return online.session.act(name, args);
    }
    return window.Citadel[name](game, ...args);
  }
  function mine() { return !online || (game && game.active === online.seat); }
  function isTraitorMe() { return !!online && !!game && game.traitor === online.seat && game.traitor >= 0; }

  function act(fn) {
    if (!game || game.over) return;
    Snd.unlock();
    const r = fn();
    if (r && !r.ok) { flash(r.msg); Snd.play('deny'); } else flash('');
    render();
  }

  function endTurn() {
    if (!mine()) return;
    act(() => { ui.picked = []; return perform('endTurn'); });
  }

  function onSlot(slot) {
    if (!game.quests[slot]) return;
    ui.selectedSlot = slot;
    render();
    openQuest(slot);
  }

  // ---------- modals ----------
  function openModal(html, onClose) {
    const m = $('modal');
    $('modalCard').innerHTML = html;
    m.hidden = false;
    m._onClose = onClose || null;
    const first = $('modalCard').querySelector('button');
    if (first) first.focus();
  }
  function closeModal() {
    const m = $('modal');
    m.hidden = true;
    if (m._onClose) { const f = m._onClose; m._onClose = null; f(); }
  }
  $('modal').addEventListener('click', e => { if (e.target === $('modal') && !$('modal').dataset.lock) closeModal(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('modal').hidden && !$('modal').dataset.lock) closeModal(); });

  function openQuest(slot) {
    const q = game.quests[slot], def = C.questDef(q.id), s = game;
    const art = def.img ? `<img class="quest-art" src="assets/${def.img}.jpg" alt="${esc(def.name)}">`
      : (window.CitadelMissions ? `<div class="mc-modal">${window.CitadelMissions.art(def)}</div>` : `<div class="quest-plate">${esc(def.name)}</div>`);
    const canMove = !s.over && mine() && s.actionsLeft > 0 && s.party[s.active].loc !== slot;
    openModal(
      `<h2 id="modalTitle" class="visually-hidden" style="display:none">${esc(def.name)}</h2>${art}` +
      `<p>${esc(def.text)}</p>` +
      `<div class="kv"><span>Favoured suit</span><b>${suitIcon(def.suit)} ${C.SUIT_LABEL[def.suit]} (counts double)</b>` +
      `<span>Progress</span><b>${q.progress} / ${q.needed}</b><span>Deadline</span><b>${q.timer} round${q.timer === 1 ? '' : 's'}</b></div>` +
      '<div class="modal-actions"><button type="button" data-a="close">Close</button><button type="button" class="ghost" data-a="view">Mission view</button>' +
      (canMove ? '<button type="button" class="primary" data-a="go">Move here</button>' : '') + '</div>');
    $('modalCard').querySelector('[data-a="close"]').onclick = closeModal;
    $('modalCard').querySelector('[data-a="view"]').onclick = () => { closeModal(); openExpedition(slot, null); };
    if (window.CitadelMissions) window.CitadelMissions.attach($('modalCard').querySelector('.mc-modal'), def);
    const go = $('modalCard').querySelector('[data-a="go"]');
    if (go) go.onclick = () => { closeModal(); act(() => perform('move', slot)); };
  }

  function openAccuse() {
    const s = game;
    let pick = null;
    const sus = C.suspicion(s);
    let h = '<h2 id="modalTitle">Accuse a defender</h2><p>If you are right, the Traitor is cast out and a white sword is seated. ' +
      'If you are wrong, the accused loses their next turn and a black sword is seated.</p><div class="pick">';
    s.party.forEach((p, i) => {
      if (!p.alive || p.exiled || i === s.active) return;
      h += `<button type="button" data-i="${i}"><div class="portrait"><img src="${portraitUrl(i)}" alt=""></div>${esc(dname(i))}<br><small>named ${sus[i]}/${s.rumors.length}</small></button>`;
    });
    h += '</div><div class="modal-actions"><button type="button" data-a="cancel">Cancel</button><button type="button" class="danger" data-a="ok" disabled>Accuse</button></div>';
    openModal(h);
    const card = $('modalCard');
    card.querySelectorAll('.pick button').forEach(b => b.onclick = () => {
      pick = +b.dataset.i;
      card.querySelectorAll('.pick button').forEach(x => x.classList.toggle('sel', x === b));
      card.querySelector('[data-a="ok"]').disabled = false;
    });
    card.querySelector('[data-a="cancel"]').onclick = closeModal;
    card.querySelector('[data-a="ok"]').onclick = () => { closeModal(); if (pick != null) act(() => perform('accuse', pick)); };
  }

  // ---------- record ----------
  const STATS_KEY = 'citadel-stats-v1';
  function readStats() {
    try { return JSON.parse(localStorage.getItem(STATS_KEY)) || { played: 0, won: 0, streak: 0, best: 0, byDiff: {} }; }
    catch (e) { return { played: 0, won: 0, streak: 0, best: 0, byDiff: {} }; }
  }
  function recordResult(s) {
    if (s.recorded) return;
    s.recorded = true;
    const st = readStats();
    const d = st.byDiff[s.difficulty] || { played: 0, won: 0 };
    st.played++; d.played++;
    if (s.over.win) { st.won++; d.won++; st.streak++; st.best = Math.max(st.best, st.streak); } else st.streak = 0;
    st.byDiff[s.difficulty] = d;
    try { localStorage.setItem(STATS_KEY, JSON.stringify(st)); } catch (e) { /* storage may be blocked */ }
  }
  function statsLine() {
    const st = readStats();
    if (!st.played) return '';
    const parts = ['easy', 'normal', 'hard'].filter(k => st.byDiff[k]).map(k => `${k} ${st.byDiff[k].won}/${st.byDiff[k].played}`);
    return `<p class="record">Record: <b>${st.won}</b> won of ${st.played} (${parts.join(', ')}). Best streak ${st.best}.</p>`;
  }

  function shareUrl(s) {
    return location.href.split('#')[0] + `#seed=${s.seed}&size=${s.party.length}&diff=${s.difficulty}`;
  }

  function showEnd() {
    const s = game, o = s.over;
    recordResult(s);
    const stats = `<div class="kv"><span>Rounds</span><b>${s.round}</b><span>White swords</span><b>${C.count(s, 'white')}</b>` +
      `<span>Black swords</span><b>${C.count(s, 'black')}</b><span>Siege engines</span><b>${s.siege}</b>` +
      `<span>The Traitor was</span><b>${esc(dname(s.traitor))}${s.traitorRevealed ? ' (unmasked)' : ' (never found)'}</b>` +
      `<span>Seed</span><b>${s.seed}</b></div>` + statsLine();
    $('modal').dataset.lock = '1';
    openModal(`<h2 id="modalTitle">${o.win ? 'Victory' : 'Defeat'}</h2><p>${esc(o.reason)}</p>${stats}` +
      '<div class="modal-actions">' + (online ? '' : '<button type="button" class="ghost" data-a="share">Copy challenge link</button>') +
      '<button type="button" class="ghost" data-a="view">View board</button><button type="button" class="primary" data-a="again">' +
      (online ? 'Leave game' : 'Play again') + '</button></div>');
    const box = $('modalCard');
    box.querySelector('[data-a="view"]').onclick = () => { delete $('modal').dataset.lock; closeModal(); };
    box.querySelector('[data-a="again"]').onclick = () => { delete $('modal').dataset.lock; leaveOnline(); ui.preview = false; openSetup(); };
    const share = box.querySelector('[data-a="share"]');
    if (share) share.onclick = e => {
      const url = shareUrl(s), b = e.currentTarget;
      (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject()).then(
        () => { b.textContent = 'Link copied'; }, () => { b.textContent = 'Copy failed'; window.prompt('Copy this link:', url); });
    };
  }

  function openSetup() {
    const saved = ui.preview ? ui.existingSave : loadSave();
    const sz = ui.setup.size, df = ui.setup.difficulty;
    const sizes = [3, 4, 5, 6, 7].map(n => `<button type="button" data-size="${n}" class="${n === sz ? 'sel' : ''}">${n}</button>`).join('');
    const diffs = [['easy', 'Easy'], ['normal', 'Normal'], ['hard', 'Hard']].map(([k, l]) => `<button type="button" data-diff="${k}" class="${k === df ? 'sel' : ''}">${l}</button>`).join('');
    $('modal').dataset.lock = '1';
    openModal('<h2 id="modalTitle">Shadows of the Citadel</h2>' +
      '<p>The enemy is at the gates, and one of your own is feeding them. Finish quests to seat <b>7 white swords</b>. ' +
      'Six black swords or twelve siege engines and the Citadel falls.</p>' +
      '<h3>Defenders</h3><div class="choice-row" id="sizeRow">' + sizes + '</div>' +
      '<h3>Difficulty</h3><div class="choice-row" id="diffRow">' + diffs + '</div>' +
      '<h3>Seed <small style="text-transform:none;letter-spacing:0;color:var(--muted)">(optional: same seed = same game)</small></h3>' +
      '<input id="seedInput" class="seed-input" inputmode="numeric" maxlength="10" placeholder="random" aria-label="Game seed">' +
      statsLine() +
      '<div class="modal-actions">' +
      '<button type="button" class="ghost" data-a="rules">How to play</button>' +
      '<button type="button" class="ghost" data-a="online" title="Play with friends over the internet">Play online</button>' +
      (saved ? '<button type="button" data-a="cont">Continue game</button>' : '') +
      '<button type="button" class="primary" data-a="start">Begin</button></div>');
    const card = $('modalCard');
    card.querySelectorAll('[data-size]').forEach(b => b.onclick = () => { ui.setup.size = +b.dataset.size; card.querySelectorAll('[data-size]').forEach(x => x.classList.toggle('sel', x === b)); });
    card.querySelectorAll('[data-diff]').forEach(b => b.onclick = () => { ui.setup.difficulty = b.dataset.diff; card.querySelectorAll('[data-diff]').forEach(x => x.classList.toggle('sel', x === b)); });
    card.querySelector('[data-a="rules"]').onclick = () => { delete $('modal').dataset.lock; openRules(openSetup); };
    card.querySelector('[data-a="online"]').onclick = () => { delete $('modal').dataset.lock; openOnlineMenu(); };
    const cont = card.querySelector('[data-a="cont"]');
    if (cont) cont.onclick = () => { delete $('modal').dataset.lock; closeModal(); leaveOnline(); ui.preview = false; startFrom(saved); };
    card.querySelector('[data-a="start"]').onclick = () => {
      delete $('modal').dataset.lock; closeModal();
      leaveOnline();
      ui.preview = false;
      const raw = card.querySelector('#seedInput').value.trim();
      const opts = { partySize: ui.setup.size, difficulty: ui.setup.difficulty };
      if (/^\d+$/.test(raw)) opts.seed = Number(raw);
      startFrom(C.createGame(opts));
    };
  }

  function openRules(back) {
    openModal('<h2 id="modalTitle">How to play</h2>' +
      '<h3>Goal</h3><ul><li>Seat <b>7 white swords</b> on the wheel by completing quests.</li>' +
      '<li>You lose at <b>6 black swords</b>, <b>12 siege engines</b>, or if every defender falls.</li></ul>' +
      '<h3>Each turn</h3><ul><li><b>Shadow:</b> a Shadow card is drawn first (siege, wounds, treachery...).</li>' +
      '<li><b>Heroic:</b> the active defender takes 2 actions: move, play cards on a quest, gather supplies, rest, or accuse.</li>' +
      '<li>Playing cards: up to 3. A card matching the quest\'s favoured suit is worth 2, others 1.</li>' +
      '<li><b>Give card:</b> pass one card to a defender standing in the same place (1 action).</li>' +
      '<li><b>Hint</b> suggests a sensible next step.</li>' +
      '<li>Quests have a deadline in rounds. Miss it and a black sword is seated.</li>' +
      '<li>Finishing a quest seats a white sword, pushes the siege back one, and everyone draws a card.</li></ul>' +
      '<h3>The Traitor</h3><ul><li>One defender secretly serves the enemy and sabotages quests and gates.</li>' +
      '<li>Each sabotage produces a rumor: a short list of who was near. The Traitor is <b>always</b> on it, so compare rumors.</li>' +
      '<li>Accuse a defender: right seats a white sword and ends the sabotage; wrong stuns them and seats a black sword.</li></ul>' +
      '<h3>Online</h3><ul><li>Each friend controls one defender; empty seats are played by bots.</li>' +
      '<li>If the Traitor is a person, they choose when to <b>Sabotage</b> (1 action). Their role is shown only to them.</li></ul>' +
      '<h3>Keys</h3><p><b>1-7</b> select a card, <b>P</b>/<b>Enter</b> play, <b>G</b> gather, <b>R</b> rest, <b>H</b> hint, <b>E</b> end turn.</p>' +
      '<div class="modal-actions"><button type="button" class="primary" data-a="back">Got it</button></div>');
    $('modalCard').querySelector('[data-a="back"]').onclick = () => { closeModal(); if (back) back(); };
  }

  // ---------- weather ----------
  const weather = { kind: 'clear', drops: [], raf: 0 };

  function setWeather() {
    const s = game;
    const kind = s.siege >= 8 ? 'storm' : s.siege >= 4 ? 'rain' : 'clear';
    $('weatherLabel').textContent = kind === 'storm' ? 'Storm' : kind === 'rain' ? 'Rain' : 'Clear';
    $('dim').style.opacity = Math.min(0.55, C.count(s, 'black') * 0.09 + (kind === 'storm' ? 0.15 : 0)).toFixed(2);
    if (kind === weather.kind) return;
    weather.kind = kind;
    startRain();
  }

  function startRain() {
    cancelAnimationFrame(weather.raf);
    const cv = $('weatherCanvas'), ctx = cv.getContext('2d');
    const w = cv.width = cv.clientWidth, h = cv.height = cv.clientHeight;
    ctx.clearRect(0, 0, w, h);
    if (weather.kind === 'clear' || reduced) return;
    const n = weather.kind === 'storm' ? 140 : 60;
    weather.drops = Array.from({ length: n }, () => ({ x: Math.random() * w, y: Math.random() * h, v: 6 + Math.random() * 6, l: 8 + Math.random() * 10 }));
    (function frame() {
      ctx.clearRect(0, 0, w, h);
      ctx.strokeStyle = 'rgba(190,210,235,.35)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      weather.drops.forEach(d => {
        d.y += d.v; d.x -= d.v * 0.25;
        if (d.y > h) { d.y = -10; d.x = Math.random() * (w + 40); }
        ctx.moveTo(d.x, d.y); ctx.lineTo(d.x + d.l * 0.25, d.y - d.l);
      });
      ctx.stroke();
      weather.raf = requestAnimationFrame(frame);
    })();
  }
  window.addEventListener('resize', () => { if (weather.kind !== 'clear') startRain(); });

  // ---------- online play ----------
  const NetOK = !!(window.CitadelNet && window.CitadelNet.supported() && window.CitadelOnline);

  function updateNetChip() {
    const chip = $('netChip');
    if (!online) { chip.hidden = true; return; }
    chip.hidden = false;
    chip.innerHTML = `Online <strong>${online.role === 'host' ? 'host' : 'guest'}</strong>`;
    chip.title = `You are defender ${online.seat + 1}: ${online.names[online.seat] || ''}`;
  }

  function leaveOnline() {
    if (online && online.session) { try { online.session.close(); } catch (e) { /* ignore */ } }
    online = null;
    ui.lobbySession = null;
    updateNetChip();
  }

  function copyText(text, btn) {
    const done = ok => { if (btn) btn.textContent = ok ? 'Copied' : 'Select the text and copy it'; };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(() => done(true), () => done(false));
    else done(false);
  }

  function openOnlineMenu() {
    $('modal').dataset.lock = '1';
    openModal('<h2 id="modalTitle">Play online</h2>' +
      '<p>Up to 7 people, no account and no server. You swap two short codes with each friend (any chat app works), ' +
      'then the game runs directly between your browsers. Empty seats are played by bots.</p>' +
      (NetOK ? '' : '<p class="msg">This browser does not support WebRTC, so online play is unavailable.</p>') +
      '<div class="modal-actions"><button type="button" class="ghost" data-a="back">Back</button>' +
      '<button type="button" data-a="join"' + (NetOK ? '' : ' disabled') + '>Join a friend\'s game</button>' +
      '<button type="button" class="primary" data-a="host"' + (NetOK ? '' : ' disabled') + '>Host a game</button></div>');
    const box = $('modalCard');
    box.querySelector('[data-a="back"]').onclick = openSetup;
    box.querySelector('[data-a="host"]').onclick = openHostLobby;
    box.querySelector('[data-a="join"]').onclick = openJoin;
  }

  function seatRows(seats) {
    return seats.map((s, i) => `<li class="seat-row ${s.kind}"><span>${i + 1}.</span><b>${esc(s.name)}</b><em>${s.kind === 'host' ? 'host' : s.kind === 'human' ? 'friend' : 'bot'}</em></li>`).join('');
  }

  function openHostLobby() {
    const O = window.CitadelOnline;
    const nameSaved = (() => { try { return localStorage.getItem('citadel-name') || ''; } catch (e) { return ''; } })();
    $('modal').dataset.lock = '1';
    openModal('<h2 id="modalTitle">Host a game</h2>' +
      '<h3>Your name</h3><input id="hostName" class="seed-input" maxlength="16" placeholder="Host" value="' + esc(nameSaved) + '">' +
      '<label class="check"><input type="checkbox" id="lanOnly"> Same network only (does not contact a STUN server)</label>' +
      '<div class="modal-actions"><button type="button" class="ghost" data-a="back">Back</button>' +
      '<button type="button" class="primary" data-a="create">Create lobby</button></div>');
    const box = $('modalCard');
    box.querySelector('[data-a="back"]').onclick = openOnlineMenu;
    box.querySelector('[data-a="create"]').onclick = () => {
      const name = box.querySelector('#hostName').value.trim();
      try { localStorage.setItem('citadel-name', name); } catch (e) { /* ignore */ }
      const delayM = /botdelay=(\d+)/.exec(location.hash);   // test hook: #botdelay=20
      const seedM = /hostseed=(\d+)/.exec(location.hash);    // test hook: #hostseed=7 makes the lobby game reproducible
      const host = new O.Host({ size: ui.setup.size, difficulty: ui.setup.difficulty, name, lanOnly: box.querySelector('#lanOnly').checked,
        botDelay: delayM ? +delayM[1] : undefined, seed: seedM ? +seedM[1] : undefined });
      ui.lobbySession = host;
      host.on('lobby', renderHostLobby);
      host.on('start', () => { /* host UI starts itself in startOnline */ });
      host.on('state', () => { if (online && online.session === host) render(); });
      host.on('left', (seat, nm) => { toast(`${nm || 'A friend'} left; a bot takes over.`, 'lose'); });
      renderHostLobby();
    };
  }

  function renderHostLobby() {
    const host = ui.lobbySession;
    if (!host || host.game) return;
    const open = host.openSeat() >= 0;
    const box = $('modalCard');
    // Keep any invite already shown in the DOM; only rebuild when the structure is missing.
    if (!box.querySelector('#lobbyRoot')) {
      box.innerHTML = '<h2 id="modalTitle">Lobby</h2><div id="lobbyRoot">' +
        '<p>' + host.size + ' defenders, <b>' + esc(host.difficulty) + '</b>. Invite friends, then start. Unfilled seats become bots.</p>' +
        '<ul class="seat-list" id="seatList"></ul>' +
        '<div id="invitePane"></div>' +
        '<div class="modal-actions"><button type="button" class="ghost" data-a="cancel">Cancel</button>' +
        '<button type="button" data-a="invite">Invite a friend</button>' +
        '<button type="button" class="primary" data-a="start">Start game</button></div></div>';
      box.querySelector('[data-a="cancel"]').onclick = () => { host.close(); ui.lobbySession = null; openOnlineMenu(); };
      box.querySelector('[data-a="invite"]').onclick = () => inviteFriend(host);
      box.querySelector('[data-a="start"]').onclick = () => startOnlineHost(host);
    }
    box.querySelector('#seatList').innerHTML = seatRows(host.lobby());
    const inv = box.querySelector('[data-a="invite"]');
    inv.disabled = !open || !!ui.inviting;
  }

  async function inviteFriend(host) {
    const box = $('modalCard'), pane = box.querySelector('#invitePane');
    ui.inviting = true; renderHostLobby();
    pane.innerHTML = '<p class="msg ok">Preparing invite...</p>';
    try {
      const { seat, code } = await host.invite();
      pane.innerHTML = '<h3>1. Send this invite code to your friend</h3>' +
        '<textarea class="code" readonly rows="3" id="inviteCode">' + esc(code) + '</textarea>' +
        '<div class="row"><button type="button" data-a="copy">Copy invite</button></div>' +
        '<h3>2. Paste the reply code they send back</h3>' +
        '<textarea class="code" rows="3" id="replyCode" placeholder="SOC1...."></textarea>' +
        '<div class="row"><button type="button" class="primary" data-a="connect">Connect</button>' +
        '<button type="button" class="ghost" data-a="drop">Cancel invite</button></div><p class="msg" id="inviteMsg"></p>';
      pane.querySelector('[data-a="copy"]').onclick = e => copyText(code, e.currentTarget);
      pane.querySelector('[data-a="drop"]').onclick = () => { host.cancelInvite(seat); pane.innerHTML = ''; ui.inviting = false; renderHostLobby(); };
      pane.querySelector('[data-a="connect"]').onclick = async e => {
        const msg = pane.querySelector('#inviteMsg'), reply = pane.querySelector('#replyCode').value;
        msg.className = 'msg ok'; msg.textContent = 'Connecting...';
        e.currentTarget.disabled = true;
        try {
          await host.accept(seat, reply);
          const t0 = Date.now();
          const wait = setInterval(() => {
            if (host.seats[seat].kind === 'human') { clearInterval(wait); pane.innerHTML = '<p class="msg ok">Connected! You can invite another friend or start.</p>'; ui.inviting = false; renderHostLobby(); }
            else if (Date.now() - t0 > 25000) { clearInterval(wait); msg.className = 'msg'; msg.textContent = 'Could not connect. Check both codes were copied in full, or try "Same network only" on a local network.'; e.currentTarget.disabled = false; }
          }, 300);
        } catch (err) { msg.className = 'msg'; msg.textContent = err.message; e.currentTarget.disabled = false; }
      };
    } catch (err) {
      pane.innerHTML = '<p class="msg">' + esc(err.message) + '</p>'; ui.inviting = false; renderHostLobby();
    }
  }

  function startOnlineHost(host) {
    closeModal(); delete $('modal').dataset.lock;
    ui.preview = false;
    ui.inviting = false;
    const g = host.start();
    beginOnline(host, host.seat, host.names(), g);
  }

  function beginOnline(session, seat, names, g) {
    online = { role: session.role, seat, names, session };
    startFrom(g);
    showRole();
  }

  function showRole() {
    const traitor = isTraitorMe();
    $('modal').dataset.lock = '1';
    openModal('<h2 id="modalTitle">' + (traitor ? 'You are the Traitor' : 'You are a loyal defender') + '</h2>' +
      '<p>You control <b>' + esc(C.defenderDef(game.party[online.seat].id).name) + '</b>.</p>' +
      (traitor ? '<p>Win by letting the Citadel fall. On your turn you may <b>Sabotage</b>; witnesses will name you and a few others, so strike when the rumor will not point only at you. Do not reveal your role.</p>'
               : '<p>One defender is secretly a Traitor and could be another person. Watch the rumors after each sabotage, then accuse.</p>') +
      '<div class="modal-actions"><button type="button" class="primary" data-a="go">Begin</button></div>');
    $('modalCard').querySelector('[data-a="go"]').onclick = () => { delete $('modal').dataset.lock; closeModal(); };
  }

  function openJoin() {
    const O = window.CitadelOnline;
    const nameSaved = (() => { try { return localStorage.getItem('citadel-name') || ''; } catch (e) { return ''; } })();
    $('modal').dataset.lock = '1';
    openModal('<h2 id="modalTitle">Join a game</h2>' +
      '<h3>Your name</h3><input id="joinName" class="seed-input" maxlength="16" placeholder="Player" value="' + esc(nameSaved) + '">' +
      '<label class="check"><input type="checkbox" id="joinLan"> Same network only (does not contact a STUN server)</label>' +
      '<h3>1. Paste the host\'s invite code</h3><textarea class="code" rows="3" id="invite" placeholder="SOC1...."></textarea>' +
      '<div class="row"><button type="button" class="primary" data-a="make">Create reply code</button></div>' +
      '<div id="replyPane"></div><p class="msg" id="joinMsg"></p>' +
      '<div class="modal-actions"><button type="button" class="ghost" data-a="back">Back</button></div>');
    const box = $('modalCard');
    let guest = null;
    box.querySelector('[data-a="back"]').onclick = () => { if (guest) guest.close(); openOnlineMenu(); };
    box.querySelector('[data-a="make"]').onclick = async e => {
      const msg = box.querySelector('#joinMsg'), btn = e.currentTarget;
      const name = box.querySelector('#joinName').value.trim();
      try { localStorage.setItem('citadel-name', name); } catch (err) { /* ignore */ }
      msg.className = 'msg ok'; msg.textContent = 'Working...';
      btn.disabled = true;
      if (guest) guest.close();
      guest = new O.Guest({ name, lanOnly: box.querySelector('#joinLan').checked });
      guest.on('lobby', l => { msg.className = 'msg ok'; msg.innerHTML = 'Connected to the host. Waiting for the game to start...<ul class="seat-list">' + seatRows(l.seats) + '</ul>'; });
      guest.on('start', view => {
        delete $('modal').dataset.lock; closeModal();
        ui.preview = false;
        beginOnline(guest, guest.seat, guest.names, view);
      });
      guest.on('state', view => {
        if (!online || online.session !== guest) return;
        online.names = guest.names; game = view; render();
      });
      guest.on('result', m => { if (!m.ok) { flash(m.msg); Snd.play('deny'); } });
      guest.on('closed', () => { if (online && online.session === guest && !game.over) connectionLost('The connection to the host was lost.'); });
      guest.on('hostleft', () => { if (online && online.session === guest && !game.over) connectionLost('The host ended the game.'); });
      try {
        const reply = await guest.join(box.querySelector('#invite').value);
        box.querySelector('#replyPane').innerHTML = '<h3>2. Send this reply code back to the host</h3>' +
          '<textarea class="code" readonly rows="3">' + esc(reply) + '</textarea><div class="row"><button type="button" data-a="copy">Copy reply</button></div>';
        box.querySelector('#replyPane [data-a="copy"]').onclick = ev => copyText(reply, ev.currentTarget);
        msg.className = 'msg ok'; msg.textContent = 'Waiting for the host to connect...';
      } catch (err) { msg.className = 'msg'; msg.textContent = err.message; btn.disabled = false; }
    };
  }

  function connectionLost(text) {
    $('modal').dataset.lock = '1';
    openModal('<h2 id="modalTitle">Disconnected</h2><p>' + esc(text) + '</p><div class="modal-actions">' +
      '<button type="button" class="ghost" data-a="view">View board</button><button type="button" class="primary" data-a="menu">Main menu</button></div>');
    $('modalCard').querySelector('[data-a="view"]').onclick = () => { delete $('modal').dataset.lock; closeModal(); };
    $('modalCard').querySelector('[data-a="menu"]').onclick = () => { delete $('modal').dataset.lock; leaveOnline(); ui.preview = false; openSetup(); };
    Snd.play('deny');
  }

  // ---------- painted card faces (assets/cards/<suit>.jpg and shadow.jpg) ----------
  // Each is used only once its file is known to load, so a suit without a painting keeps the plain card design.
  const handArt = {};
  const shadowArt = { ok: false };
  ['blade', 'shield', 'scroll', 'boot'].forEach(suit => {
    const i = new Image();
    i.onload = () => { handArt[suit] = true; if (game) render(); };
    i.src = 'assets/cards/' + suit + '.jpg';
  });
  { const i = new Image(); i.onload = () => { shadowArt.ok = true; }; i.src = 'assets/cards/shadow.jpg'; }

  // ---------- boot ----------
  function startFrom(g) {
    game = g;
    ui.selectedSlot = null; ui.picked = []; ui.shownLog = 0; ui.prev = null; ui.endShown = false; ui.expKey = null;
    closeExpedition(true);
    $('log').innerHTML = '';
    weather.kind = 'clear';
    flash('');
    render();
  }

  // sound toggle + audio unlock on the first interaction
  function syncSoundButton() {
    const b = $('btnSound');
    if (!Snd.supported()) { b.hidden = true; return; }
    b.textContent = Snd.isMuted() ? 'Sound: off' : 'Sound: on';
    b.setAttribute('aria-pressed', String(!Snd.isMuted()));
  }
  $('btnSound').onclick = () => { Snd.setMuted(!Snd.isMuted()); syncSoundButton(); Snd.play('click'); };
  ['pointerdown', 'keydown'].forEach(ev => window.addEventListener(ev, () => Snd.unlock(), { once: true, capture: true }));
  syncSoundButton();

  // keyboard shortcuts (only when no dialog is open and focus is not on a button/field)
  document.addEventListener('keydown', e => {
    if (!game || game.over || !mine() || !$('modal').hidden || e.ctrlKey || e.metaKey || e.altKey) return;
    const tag = e.target && e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'BUTTON') return;
    const k = e.key.toLowerCase();
    if (k === 'e') endTurn();
    else if (k === 'g') act(() => perform('drawAction'));
    else if (k === 'r') act(() => perform('rest'));
    else if (k === 'h') hint();
    else if (k === 'p' || k === 'enter') {
      const q = activeQuest();
      if (q && ui.picked.length) act(() => { const r = perform('contribute', ui.picked.slice()); ui.picked = []; return r; });
    } else if (/^[1-7]$/.test(k)) {
      const c = game.party[game.active].hand[Number(k) - 1];
      if (c) toggleCard(c.id);
    } else return;
    e.preventDefault();
  });

  $('btnNew').onclick = openSetup;
  $('btnRules').onclick = () => openRules();

  if (Missions) Missions.installDefs();
  buildStatic();
  buildWindows();
  ui.fast = /selftest/.test(location.hash);
  const seedMatch = /seed=(\d+)/.exec(location.hash);
  if (seedMatch) {
    // #seed=42&size=4&diff=hard starts that exact game immediately (challenge links, bug reports).
    const sizeM = /size=([3-7])/.exec(location.hash), diffM = /diff=(easy|normal|hard)/.exec(location.hash);
    startFrom(C.createGame({ seed: +seedMatch[1], partySize: sizeM ? +sizeM[1] : 5, difficulty: diffM ? diffM[1] : 'normal' }));
  } else {
    // Show a backdrop game behind the setup dialog; keep any real autosave untouched.
    ui.existingSave = loadSave();
    ui.preview = true;
    startFrom(C.createGame({ partySize: 5, difficulty: 'normal' }));
    openSetup();
  }

  // test hook
  window.__citadel = { get game() { return game; }, render, startFrom, mw, openExpedition, closeExpedition };
  if (/selftest/.test(location.hash)) {
    const t = document.createElement('script');
    t.src = 'js/selftest.js';
    document.body.appendChild(t);
  }
})();
