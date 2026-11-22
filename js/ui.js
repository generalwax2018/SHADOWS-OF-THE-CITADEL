/* Shadows of the Citadel - UI. Renders engine state; never changes rules. */
(function () {
  'use strict';
  const C = window.Citadel;
  const SAVE_KEY = 'citadel-save-v1';
  const $ = id => document.getElementById(id);

  const Snd = window.CitadelSound || { play() {}, unlock() {}, setAmbience() {}, setMuted() {}, isMuted: () => true, supported: () => false };
  let reduced = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);   // the Motion setting can change this

  let game = null;
  let online = null;          // { role: 'host'|'guest', seat, session, names } while playing online
  const ui = { selectedSlot: null, picked: [], shownLog: 0, setup: { size: 5, difficulty: 'normal' }, prev: null, endShown: false };

  // ---------- settings (remembered in this browser) ----------
  const SETTINGS_KEY = 'citadel-settings-v1';
  const SET_DEFAULTS = { volume: 0.7, ambience: true, motion: 'system', text: 'normal', autoView: false };
  const SET = Object.assign({}, SET_DEFAULTS);
  try { Object.assign(SET, JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}); } catch (e) { /* storage blocked or damaged: use defaults */ }
  function saveSettings() { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(SET)); } catch (e) { /* ignore */ } }
  function applySettings() {
    Snd.setVolume(SET.volume);
    Snd.setAmbienceOn(SET.ambience);
    const system = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    reduced = SET.motion === 'reduce' ? true : SET.motion === 'full' ? false : system;
    const html = document.documentElement;
    html.classList.toggle('reduce-motion', reduced);
    html.classList.toggle('full-motion', SET.motion === 'full');
    html.classList.toggle('large-text', SET.text === 'large');
    if (window.CitadelFx && window.CitadelFx.setReduced) window.CitadelFx.setReduced(reduced);
    if (window.CitadelAmbience) window.CitadelAmbience.setReduced(reduced);
    ui.autoExp = !!SET.autoView;
  }
  // ---------- crash guard ----------
  // An unexpected error must never leave the player with a frozen board and no explanation. The game state is autosaved
  // after every action, so a reload resumes where they were. Errors are also collected in window.__citadelErrors for tests.
  window.__citadelErrors = [];
  let crashShown = false;
  function reportError(err) {
    window.__citadelErrors.push(String(err && err.message || err));
    try { console.error(err); } catch (e) { /* ignore */ }
    if (crashShown) return;
    crashShown = true;
    const bar = el('div', 'crash', '<span>Something went wrong. Your game is saved. If the board looks wrong, reload to continue.</span>' +
      '<button type="button" data-a="reload">Reload</button><button type="button" class="ghost" data-a="dismiss">Dismiss</button>');
    bar.setAttribute('role', 'alert');
    bar.querySelector('[data-a="reload"]').onclick = () => location.reload();
    bar.querySelector('[data-a="dismiss"]').onclick = () => { bar.remove(); crashShown = false; };
    document.body.appendChild(bar);
  }
  window.addEventListener('error', e => { if (e instanceof ErrorEvent) reportError(e.error || e.message); });
  window.addEventListener('unhandledrejection', e => reportError(e.reason));
  // ---------- helpers ----------
  function el(tag, cls, html) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }
  function esc(t) { return String(t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  function dname(i) { return C.defenderDef(game.party[i].id).name; }
  function portraitUrl(i) { return `assets/${C.defenderDef(game.party[i].id).img}.webp`; }

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
  // The painted board is a tilted view, so positions are measured in percent of the image (1168 x 784).
  const SLOT_CENTERS = [28.1, 34.7, 42.7, 51.7, 61.0, 72.1, 84.8];   // vertical centre of each of the seven quest frames used
  const WHEEL = { x: 14.7, y: 62.5, rx: 12.0, ry: 13.4 };            // the sword wheel's seat ring

  function buildStatic() {
    const row = $('siegeRow');
    row.innerHTML = '';
    for (let i = 0; i < C.SIEGE_MAX; i++) row.appendChild(el('span', 'siege-dot'));

    const wheel = $('wheel');
    wheel.innerHTML = '';
    for (let i = 0; i < C.SEATS; i++) {
      const a = (-90 + i * 30) * Math.PI / 180;
      const seat = el('span', 'seat');
      seat.style.left = (WHEEL.x + Math.cos(a) * WHEEL.rx) + '%';
      seat.style.top = (WHEEL.y + Math.sin(a) * WHEEL.ry) + '%';
      wheel.appendChild(seat);
    }

    const slots = $('slots');
    slots.innerHTML = '';
    SLOT_CENTERS.forEach((y, i) => {
      const b = el('button', 'slot');
      b.type = 'button';
      b.style.top = (y - 3.4) + '%';
      b.dataset.slot = i;
      b.addEventListener('click', () => onSlot(i));
      slots.appendChild(b);
    });
    const cit = $('citadelSpot');
    cit.onclick = () => { ui.selectedSlot = null; render(); };
    cit.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); cit.click(); } };
  }

  // ---------- path of destruction + card flights ----------
  // The trail lists every Shadow card drawn this game, so the whole table can see how the ruin is spreading.
  const TRAIL_TONE = { calm: 'calm', dread: 'warn', whisper: 'warn', wound: 'warn', hand: 'warn', siege1: 'ruin', siege2: 'ruin', gate: 'ruin', failed: 'ruin' };
  const trailName = t => t === 'failed' ? ['Quest Lost', 'A quest ran out of time.'] : SHADOW_INFO[t];
  function renderTrail(s) {
    const box = $('trail');
    if (!box) return;
    const list = s.trail || [];
    const known = ui.trailLen == null || list.length < ui.trailLen ? list.length : ui.trailLen;
    box.innerHTML = '';
    const show = list.slice(-24);
    const offset = list.length - show.length;
    if (!list.length) box.appendChild(el('span', 'trail-empty', 'Nothing yet. The first Shadow card is drawn at the start of a turn.'));
    show.forEach((t, k) => {
      const info = trailName(t.type) || [t.type, ''];
      const fresh = offset + k >= known;
      const chip = el('span', `tchip ${TRAIL_TONE[t.type] || 'warn'}${fresh ? ' fresh' : ''}${offset + k === list.length - 1 ? ' last' : ''}`,
        `<i>${t.r}</i><b>${esc(info[0])}</b>`);
      chip.setAttribute('role', 'listitem');
      chip.title = `Round ${t.r}: ${info[0]}${info[1] ? ' - ' + info[1] : ''}`;
      box.appendChild(chip);
    });
    box.appendChild(el('span', 'tchip citadel', '<b>The Citadel</b>'));
    ui.trailLen = list.length;
    box.scrollLeft = box.scrollWidth;
  }

  // A card-back ghost flies between two screen rects, then is removed. Returns the animation (or null).
  function fly(from, to, ms, delay, cls, then) {
    if (reduced || ui.fast || !from || !to || !document.body.animate) { if (then) then(); return null; }
    const g = el('div', 'fly-ghost ' + (cls || ''));
    g.style.cssText = `left:${to.left}px;top:${to.top}px;width:${to.width}px;height:${to.height}px`;
    document.body.appendChild(g);
    const dx = from.left + from.width / 2 - (to.left + to.width / 2), dy = from.top + from.height / 2 - (to.top + to.height / 2);
    const k = from.width / Math.max(1, to.width);
    const a = g.animate([
      { transform: `translate(${dx}px, ${dy}px) rotate(-18deg) scale(${k})`, opacity: 0 },
      { opacity: 1, offset: .15 },
      { transform: `translate(${dx * .35}px, ${dy * .35 - 40}px) rotate(8deg) scale(${(1 + k) / 2 + .08})`, opacity: 1, offset: .6 },
      { transform: 'translate(0, 0) rotate(0) scale(1)', opacity: 1 }
    ], { duration: ms, delay: delay || 0, easing: 'cubic-bezier(.25,.8,.3,1)', fill: 'backwards' });
    const done = () => { g.remove(); if (then) then(); };
    a.onfinish = done; a.oncancel = done;
    return a;
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
    const artStyle = shadowArt.url
      ? ` style="background-image:linear-gradient(rgba(8,4,14,.12),rgba(8,4,14,.55) 62%,rgba(8,4,14,.8)),url('${shadowArt.url}')"` : '';
    box.innerHTML = `<div class="sr-card${shadowArt.url ? ' art' : ''}"${artStyle}><small>Shadow</small><b>${esc(info[0])}</b><span>${esc(info[1])}</span></div>`;
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
      if (cur.shadow) {
        const deckR = $('shadowDeck').getBoundingClientRect(), stR = $('stage').getBoundingClientRect();
        const w = stR.width * .16, h = w * 1.4;
        const dest = { left: stR.right - stR.width * .025 - w, top: stR.top + stR.height * .14, width: w, height: h };
        const flown = !reduced && !ui.fast;
        if (flown) { Snd.play('draw'); fly(deckR, dest, 520, 120, 'shadow-back', () => { showShadow(cur.shadow); Snd.play('shadow'); }); }
        else { showShadow(cur.shadow); setTimeout(() => Snd.play('shadow'), 250); }
      }
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
    try { renderNow(); } catch (e) { reportError(e); }
  }
  function renderNow() {
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
      `<div class="portrait"><img src="assets/${d.img}.webp" alt="${esc(d.name)}"></div>` +
      `<div>${who}<h3>${esc(d.name)}</h3>${hpPips(p)}<p>${esc(d.ability)}</p>` +
      (peek ? `<div class="peek">Foresight: next Shadow is ${peekText[peek] || peek}.</div>` : '') + '</div>';

    // hand
    const hand = $('hand');
    hand.innerHTML = '';
    ui.picked = ui.picked.filter(id => p.hand.some(c => c.id === id));
    const q = activeQuest();
    const def = q ? C.questDef(q.id) : null;
    let dealt = 0;
    const gatherBtn = [...document.querySelectorAll('#actions button')].find(x => /^Gather/.test(x.textContent));
    const handBox = hand.getBoundingClientRect();
    const source = gatherBtn ? gatherBtn.getBoundingClientRect() : { left: handBox.left + handBox.width / 2 - 20, top: handBox.top - 60, width: 40, height: 56 };
    p.hand.forEach(c => {
      const b = el('button', `card suit-${c.suit}` + (ui.picked.includes(c.id) ? ' selected' : '') + (def && def.suit === c.suit ? ' match' : ''));
      b.type = 'button';
      b.innerHTML = `<span class="ico suit-${c.suit}">${ICONS[c.suit]}</span>${C.SUIT_LABEL[c.suit]}`;
      const face = cardFace(c);
      if (face) { b.classList.add('art'); b.style.backgroundImage = `url('${face}')`; }
      b.setAttribute('aria-pressed', ui.picked.includes(c.id));
      b.disabled = !mine();
      b.addEventListener('click', () => toggleCard(c.id));
      hand.appendChild(b);
      if (!reduced && !ui.fast && ui.newCards && ui.newCards.has(c.id)) {
        const delay = dealt++ * 130, dest = b.getBoundingClientRect();
        b.style.visibility = 'hidden';
        fly(source, dest, 560, delay, 'suit-' + c.suit, () => { b.style.visibility = ''; b.classList.add('landed'); setTimeout(() => b.classList.remove('landed'), 400); });
        Snd.play('draw');
      }
    });
    if (!p.hand.length) hand.appendChild(el('div', 'empty-note', 'No cards. Gather supplies to draw more.'));
    $('handHint').textContent = `${p.hand.length}/${C.HAND_LIMIT}` + (def ? ` - ${def.name} likes ${C.SUIT_LABEL[def.suit]}` : '');

    // suit powers: a rail that lights up for the pairs you hold, and brighter for the pairs you have selected
    const rail = $('powers');
    if (rail) {
      const held = {}, picked = C.suitPowers(s, s.active, ui.picked);
      p.hand.forEach(c => { held[c.suit] = (held[c.suit] || 0) + 1; });
      rail.innerHTML = '';
      C.SUITS.forEach(su => {
        const pw = C.POWERS[su];
        const n = el('span', `pw suit-${su}${held[su] >= 2 ? ' ready' : ''}${picked.includes(su) ? ' armed' : ''}`,
          `<span class="ico suit-${su}">${ICONS[su]}</span><b>${pw.name}</b>`);
        n.title = `${C.SUIT_LABEL[su]} pair: ${pw.text}` + (held[su] >= 2 ? ' (you hold a pair)' : '');
        rail.appendChild(n);
      });
      const ward = s.ward || 0;
      rail.appendChild(el('span', 'pw ward' + (ward ? ' on' : ''), `Ward <b>${ward}</b>`));
      rail.lastChild.title = 'A ward absorbs the next wound anyone takes. Shield pairs raise it (up to ' + C.WARD_MAX + ').';
    }

    renderTrail(s);
    if (online) updateNetChip();
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
      '<label class="exp-opt"><input type="checkbox" id="autoExp"> Open the mission view automatically</label>' +
      `<div class="exp-bottom"><div class="obj">${esc(def.text)}</div><div class="who"></div>` +
      '<div class="meter"><span data-r="prog"></span><div class="bar"><i></i></div><span data-r="left"></span></div></div>');
    root.appendChild(frame);
    const opt = frame.querySelector('#autoExp');
    opt.checked = ui.autoExp;
    opt.addEventListener('change', () => { SET.autoView = opt.checked; saveSettings(); applySettings(); });
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
    const pw = q ? C.suitPowers(s, s.active, ui.picked).map(su => C.POWERS[su].name) : [];
    btn(q ? `Play ${ui.picked.length} card${ui.picked.length === 1 ? '' : 's'} (+${gain})${pw.length ? ' + ' + pw.join(' + ') : ''}` : 'Play cards (go to a quest)',
      () => act(() => { const r = perform('contribute', ui.picked.slice()); ui.picked = []; return r; }),
      { cls: 'primary', disabled: !q || ui.picked.length === 0, title: 'Matching suit counts double. Two cards of one suit also trigger that suit\'s power.' });

    btn('Gather supplies', () => act(() => perform('drawAction')), { title: 'Draw 2 cards (3 for Lord Harren) [G]' });
    btn('Rest', () => act(() => perform('rest')), { disabled: p.loc !== C.CITADEL, title: 'At the Citadel: everyone there heals 1 [R]' });
    const mates = giveTargets();
    btn('Give card...', openGive, { disabled: ui.picked.length !== 1 || mates.length === 0,
      title: 'Select exactly one card, then pass it to a defender standing in the same place' });
    btn('Accuse...', openAccuse, { disabled: s.rumors.length === 0 || s.traitorRevealed, title: 'Needs at least one sabotage rumor' });
    if (online && isTraitorMe() && !s.traitorRevealed) {
      const sab = btn('Sabotage (Traitor)', () => act(() => perform('sabotageAction')), { cls: 'danger traitor-act', title: 'Costs 1 action. Secretly strike the quest you stand at (or the Citadel). Witnesses will name you and a few others.' });
      sab.dataset.traitor = '1';
    }
    btn('Hint', hint, { cls: 'ghost', needAction: false, title: 'Suggest a sensible next step [H]' });
    btn('End turn', endTurn, { cls: 'danger', needAction: false, title: 'Finish this defender\'s turn [E]' });
    if (online && isTraitorMe() && !s.traitorRevealed) {
      box.appendChild(el('p', 'traitor-note', '<b>Traitor:</b> Sabotage costs 1 action and strikes where you stand. Witnesses will name you and a few others, so pick your moment.'));
    }
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
        `<div class="portrait"><img src="assets/${d.img}.webp" alt=""></div>` +
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
      // major events get the big centered card (not on the first render of a game, so a loaded game does not replay its history)
      if ((e.cls === 'win' || e.cls === 'lose') && ui.prev && !ui.preview) { const d = describeEvent(e); if (d) chronicle(d); }
    }
    ui.shownLog = game.log.length;
    box.scrollTop = box.scrollHeight;
  }

  // ---------- the chronicle: a large centered card for major events ----------
  // The log panel still records everything for later review; this card makes sure everyone sees what just happened.
  const CI = {
    siege:    '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M4 21V8h2.500V5H9v3h2V5h2v3h2V5h2.500v3H20v13zM10 21v-5a2 2 0 014 0v5z" fill-rule="evenodd"/></svg>',
    sword:    '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M19.500 2.500 21.500 4.500 11 15 9 13z"/><path d="M8 14l2 2-3.500 3.500a1.400 1.400 0 0 1-2-2z"/><path d="M12.500 16.500l1 1-2 2-1-1z"/></svg>',
    progress: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 3l8 9h-5v9H9v-9H4z"/></svg>',
    complete: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3 6.500 7 .8-5.200 4.800 1.500 7L12 17.500 5.700 21l1.500-7L2 9.300l7-.8z"/></svg>',
    failed:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.200" stroke-linecap="round"><path d="M5 5l14 14M19 5L5 19"/></svg>',
    wound:    '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C8 8 5.500 11.500 5.500 15a6.500 6.500 0 0013 0c0-3.500-2.500-7-6.500-13z"/></svg>',
    skull:    '<svg viewBox="0 0 24 24" fill="currentColor" fill-rule="evenodd"><path d="M12 2a8 8 0 00-8 8c0 3 1.500 5 3 6v4h3v-2h4v2h3v-4c1.500-1 3-3 3-6a8 8 0 00-8-8zM9 11a2 2 0 100 4 2 2 0 000-4zm6 0a2 2 0 100 4 2 2 0 000-4z"/></svg>',
    eye:      '<svg viewBox="0 0 24 24" fill="currentColor" fill-rule="evenodd"><path d="M12 5C6 5 2 12 2 12s4 7 10 7 10-7 10-7-4-7-10-7zm0 11a4 4 0 110-8 4 4 0 010 8z"/><circle cx="12" cy="12" r="2"/></svg>',
    heart:    '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 21s-8-5-8-11a4.500 4.500 0 018-2.500A4.500 4.500 0 0120 10c0 6-8 11-8 11z"/></svg>',
    hourglass: HOURGLASS.replace('<svg ', '<svg fill="currentColor" ')
  };
  const CHRON_PRIORITY = { complete: 3, failed: 3, fallen: 3, traitor: 3, wrong: 2, black: 2, siege: 2, sabotage: 2, power: 2, wound: 1, progress: 1, rest: 1, dread: 1, whisper: 1, other: 1 };

  // Turns one engine log entry into a card, or null for lines that are not worth a card.
  function describeEvent(e) {
    const t = String(e.text || ''), tone = e.cls === 'win' ? 'win' : 'lose';
    const clean = t.replace(/^Shadow:\s*/, '').replace(/^./, c => c.toUpperCase());
    const card = (type, icon, title, text, tn) => ({ type, icon: CI[icon], title, text: text || clean, tone: tn || tone });
    let m;
    if (/ pair, (Charge|Ward|Lore|Swift):/.test(t)) {
      const pm = t.match(/^(\w+) pair, (\w+):/);
      return card('power', 'complete', `${pm[1]} pair: ${pm[2]}`, t.replace(/^\w+ pair, \w+:\s*/, '').replace(/^./, c => c.toUpperCase()), 'win');
    }
    if (/A ward shatters/.test(t)) return card('power', 'complete', 'Ward Shatters', clean, 'win');
    if (/ is complete!/.test(t)) return card('complete', 'complete', 'Mission Complete', clean, 'win');
    if (/ has failed!/.test(t)) return card('failed', 'failed', 'Mission Failed', clean, 'lose');
    if (/ is the Traitor!/.test(t)) return card('traitor', 'eye', 'The Traitor Is Unmasked', clean, 'win');
    if (/ is innocent!/.test(t)) return card('wrong', 'failed', 'Wrong Accusation', clean, 'lose');
    if (/ has fallen!/.test(t)) return card('fallen', 'skull', 'A Defender Has Fallen', clean, 'lose');
    if (/^Sabotage/.test(t)) return card('sabotage', 'eye', 'Sabotage!', clean, 'lose');
    if (/Gate opens/.test(t)) return card('black', 'sword', 'The Gate Opens', clean, 'lose');
    if (/siege engine|full assault/i.test(t)) return card('siege', 'siege', /assault/i.test(t) ? 'Full Assault' : 'Siege Engine', clean, 'lose');
    if ((m = /advances (.+?): \+(\d+)/.exec(t))) return card('progress', 'progress', 'Mission Progress +' + m[2], clean, 'win');
    if (/^Rest at the Citadel/.test(t)) return card('rest', 'heart', 'Rest at the Citadel', clean, 'win');
    if (/is wounded/.test(t)) return card('wound', 'wound', 'Wounded', clean, 'lose');
    if (/dread falls/i.test(t)) return card('dread', 'hourglass', 'Dread', clean, 'lose');
    if (/whisper/i.test(t)) return card('whisper', 'eye', 'A Whisper in the Dark', clean, 'lose');
    if (/an arrow finds|Traitor strikes from within/.test(t)) return null;      // the next line says what it did
    return card('other', e.cls === 'win' ? 'complete' : 'wound', e.cls === 'win' ? 'Well Done' : 'Misfortune', clean);
  }

  ui.chron = { q: [], busy: false, timer: 0 };
  function chronicle(d) {
    const c = ui.chron;
    c.q.push(d);
    while (c.q.length > 3) {                      // keep the queue short: drop the least important, oldest first
      let k = 0;
      c.q.forEach((x, i) => { if ((CHRON_PRIORITY[x.type] || 1) < (CHRON_PRIORITY[c.q[k].type] || 1)) k = i; });
      c.q.splice(k, 1);
    }
    pumpChronicle();
  }
  function pumpChronicle() {
    const c = ui.chron, box = $('chronicle');
    if (c.busy || !c.q.length || !box) return;
    c.busy = true;
    const d = c.q.shift();
    box.innerHTML = `<div class="chron ${d.tone} t-${d.type}" role="status"><div class="chron-icon">${d.icon}</div>` +
      `<div class="chron-body"><b>${esc(d.title)}</b><p>${esc(d.text)}</p></div></div>`;
    const card = box.firstChild, hold = c.q.length >= 2 ? 1300 : 2000;
    c.timer = setTimeout(() => {
      card.classList.add('leave');
      c.timer = setTimeout(() => { box.innerHTML = ''; c.busy = false; pumpChronicle(); }, 280);
    }, hold);
  }
  function clearChronicle() {
    const c = ui.chron;
    clearTimeout(c.timer); c.q = []; c.busy = false;
    const box = $('chronicle'); if (box) box.innerHTML = '';
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
    const art = def.img ? `<img class="quest-art" src="assets/${def.img}.webp" alt="${esc(def.name)}">`
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

  // ---------- daily challenge: the same game for everyone, once a day ----------
  // The seed comes from the date, so every player gets the identical deal and Shadow deck; only the choices differ.
  const DAILY_KEY = 'citadel-daily-v1';
  const dayKey = d => { d = d || new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  const dailySeed = key => Number((key || dayKey()).replace(/-/g, ''));
  function readDaily() { try { return JSON.parse(localStorage.getItem(DAILY_KEY)) || {}; } catch (e) { return {}; } }
  function dailyStreak(results) {
    const d = new Date();
    let key = dayKey(d);
    if (!(results[key] && results[key].win)) { d.setDate(d.getDate() - 1); key = dayKey(d); }   // today may not be played yet
    let n = 0;
    while (results[key] && results[key].win) { n++; d.setDate(d.getDate() - 1); key = dayKey(d); }
    return n;
  }
  function recordDaily(s) {
    if (!s.daily || s.dailyRecorded || !s.over) return;
    s.dailyRecorded = true;
    const all = readDaily(), prev = all[s.daily];
    const res = { win: !!s.over.win, rounds: s.round, white: C.count(s, 'white'), black: C.count(s, 'black'), siege: s.siege };
    // keep the best attempt of the day: a win beats a loss, a quicker win beats a slower one, more white swords beats fewer
    const better = !prev || (res.win && !prev.win) || (res.win && prev.win && res.rounds < prev.rounds) || (!res.win && !prev.win && res.white > prev.white);
    if (better) all[s.daily] = res;
    Object.keys(all).sort().slice(0, Math.max(0, Object.keys(all).length - 60)).forEach(k => delete all[k]);   // keep 60 days
    try { localStorage.setItem(DAILY_KEY, JSON.stringify(all)); } catch (e) { /* storage may be blocked */ }
  }
  function dailyRow() {
    const all = readDaily(), t = all[dayKey()], streak = dailyStreak(all);
    const status = t ? (t.win ? `Won in ${t.rounds} rounds` : `Not beaten yet (best: ${t.white} white swords)`) : 'Not played yet today';
    return '<h3>Daily challenge</h3><div class="daily"><div><b>Today: ' + esc(dayKey()) + '</b><small>' + esc(status) +
      (streak ? ` &middot; ${streak}-day streak` : '') + '</small></div>' +
      '<button type="button" data-a="daily">' + (t ? 'Play again' : 'Play today\'s game') + '</button></div>' +
      '<p class="hint-line">Everyone gets the same game today: 5 defenders, Normal.</p>';
  }
  function startDaily() {
    delete $('modal').dataset.lock; closeModal();
    leaveOnline(); ui.preview = false;
    const key = dayKey();
    const g = C.createGame({ seed: dailySeed(key), partySize: 5, difficulty: 'normal' });
    g.daily = key;
    startFrom(g);
    maybeStartTour();
  }

  // What happened this game, for the end screen.
  function highlights(s) {
    const st = s.stats;
    if (!st) return '';
    const best = st.progress.map((v, i) => [v, i]).sort((a, b) => b[0] - a[0])[0];
    let h = '<h3>Highlights</h3><div class="kv">';
    if (best && best[0] > 0) h += `<span>Most progress</span><b>${esc(dname(best[1]))} (${best[0]})</b>`;
    h += `<span>Missions completed</span><b>${st.done}</b><span>Missions failed</span><b>${st.failed}</b>` +
      `<span>Wounds taken</span><b>${st.wounds}</b><span>Sabotages</span><b>${s.sabotages || 0}</b></div>`;
    return h;
  }
  function dailyResultText(s) {
    const o = s.over;
    return `Shadows of the Citadel, daily ${s.daily}\n${o.win ? 'Victory' : 'Defeat'} in ${s.round} rounds: ${C.count(s, 'white')} white swords, ` +
      `${C.count(s, 'black')} black, ${s.siege} siege engines\n` + location.href.split('#')[0] + `#seed=${s.seed}&size=5&diff=normal`;
  }

  function showEnd() {
    const s = game, o = s.over;
    endTour();
    recordResult(s);
    recordDaily(s);
    const stats = `<div class="kv"><span>Rounds</span><b>${s.round}</b><span>White swords</span><b>${C.count(s, 'white')}</b>` +
      `<span>Black swords</span><b>${C.count(s, 'black')}</b><span>Siege engines</span><b>${s.siege}</b>` +
      `<span>The Traitor was</span><b>${esc(dname(s.traitor))}${s.traitorRevealed ? ' (unmasked)' : ' (never found)'}</b>` +
      `<span>Seed</span><b>${s.seed}</b></div>` + highlights(s) + statsLine();
    const dailyNote = s.daily ? `<p class="record">Daily challenge ${esc(s.daily)}: streak <b>${dailyStreak(readDaily())}</b> day${dailyStreak(readDaily()) === 1 ? '' : 's'}.</p>` : '';
    $('modal').dataset.lock = '1';
    openModal(`<h2 id="modalTitle">${o.win ? 'Victory' : 'Defeat'}</h2><p>${esc(o.reason)}</p>${stats}${dailyNote}` +
      '<div class="modal-actions">' + (online ? '' : `<button type="button" class="ghost" data-a="share">${s.daily ? 'Copy result' : 'Copy challenge link'}</button>`) +
      '<button type="button" class="ghost" data-a="view">View board</button><button type="button" class="primary" data-a="again">' +
      (online ? 'Leave game' : 'Play again') + '</button></div>');
    const box = $('modalCard');
    box.querySelector('[data-a="view"]').onclick = () => { delete $('modal').dataset.lock; closeModal(); };
    box.querySelector('[data-a="again"]').onclick = () => { delete $('modal').dataset.lock; leaveOnline(); ui.preview = false; openSetup(); };
    const share = box.querySelector('[data-a="share"]');
    if (share) share.onclick = e => {
      const text = s.daily ? dailyResultText(s) : shareUrl(s), b = e.currentTarget;
      (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(
        () => { b.textContent = s.daily ? 'Result copied' : 'Link copied'; }, () => { b.textContent = 'Copy failed'; window.prompt('Copy this:', text); });
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
      statsLine() + dailyRow() +
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
    card.querySelector('[data-a="daily"]').onclick = startDaily;
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
      maybeStartTour();
    };
  }

  function openRules(back) {
    openModal('<h2 id="modalTitle">How to play</h2>' +
      '<h3>Goal</h3><ul><li>Seat <b>7 white swords</b> on the wheel by completing quests.</li>' +
      '<li>You lose at <b>6 black swords</b>, <b>12 siege engines</b>, or if every defender falls.</li></ul>' +
      '<h3>Each turn</h3><ul><li><b>Shadow:</b> a Shadow card is drawn first (siege, wounds, treachery...).</li>' +
      '<li><b>Heroic:</b> the active defender takes 2 actions: move, play cards on a quest, gather supplies, rest, or accuse.</li>' +
      '<li>Playing cards: up to 3. A card matching the quest\'s favoured suit is worth 2, others 1.</li>' +
      '<li><b>Suit powers:</b> play <b>two cards of the same suit</b> in one play and that suit\'s power triggers as well. ' +
        '<b>Blade</b> Charge pushes the siege back one. <b>Shield</b> Ward absorbs the next wound anyone takes (hold up to two). ' +
        '<b>Scroll</b> Lore gives the quest one more round. <b>Boot</b> Swift makes the play cost no action. Choose your pairs.</li>' +
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
      '<div class="modal-actions"><button type="button" class="ghost" data-a="tour">Guided tour</button><button type="button" class="primary" data-a="back">Got it</button></div>');
    $('modalCard').querySelector('[data-a="back"]').onclick = () => { closeModal(); if (back) back(); };
    $('modalCard').querySelector('[data-a="tour"]').onclick = () => { closeModal(); startTour(); };
  }

  function openSettings() {
    const pct = Math.round(SET.volume * 100);
    openModal('<h2 id="modalTitle">Settings</h2>' +
      '<h3>Sound</h3>' +
      '<label class="check"><input type="checkbox" id="setSfx"> Sound effects</label>' +
      '<label class="check"><input type="checkbox" id="setAmb"> Ambient wind and rain</label>' +
      '<div class="set-row"><label for="setVol">Volume</label><input type="range" id="setVol" min="0" max="100" step="5"><output id="setVolOut"></output></div>' +
      '<h3>Motion</h3>' +
      '<div class="set-row"><label for="setMotion">Animation</label><select id="setMotion" class="seed-input"><option value="system">Follow my device</option><option value="reduce">Reduce motion</option><option value="full">Full motion</option></select></div>' +
      '<label class="check"><input type="checkbox" id="setAuto"> Open the mission view automatically (expedition view)</label>' +
      '<h3>Text</h3>' +
      '<div class="set-row"><label for="setText">Side panel text</label><select id="setText" class="seed-input"><option value="normal">Normal</option><option value="large">Large</option></select></div>' +
      '<div class="modal-actions"><button type="button" class="ghost" data-a="tour">Guided tour</button><button type="button" class="ghost" data-a="reset">Reset to defaults</button><button type="button" class="primary" data-a="done">Done</button></div>');
    const box = $('modalCard');
    const q = s => box.querySelector(s);
    const sync = () => {
      q('#setSfx').checked = !Snd.isMuted(); q('#setAmb').checked = SET.ambience;
      q('#setVol').value = Math.round(SET.volume * 100); q('#setVolOut').textContent = Math.round(SET.volume * 100) + '%';
      q('#setMotion').value = SET.motion; q('#setAuto').checked = SET.autoView; q('#setText').value = SET.text;
    };
    sync();
    const change = () => { saveSettings(); applySettings(); };
    q('#setSfx').onchange = e => { Snd.setMuted(!e.target.checked); syncSoundButton(); };
    q('#setAmb').onchange = e => { SET.ambience = e.target.checked; change(); };
    q('#setVol').oninput = e => { SET.volume = e.target.value / 100; q('#setVolOut').textContent = e.target.value + '%'; change(); };
    q('#setVol').onchange = () => Snd.play('white');          // a sample so you can hear the level
    q('#setMotion').onchange = e => { SET.motion = e.target.value; change(); };
    q('#setAuto').onchange = e => { SET.autoView = e.target.checked; change(); };
    q('#setText').onchange = e => { SET.text = e.target.value; change(); };
    q('[data-a="reset"]').onclick = () => { Object.assign(SET, SET_DEFAULTS); Snd.setMuted(false); syncSoundButton(); change(); sync(); };
    q('[data-a="done"]').onclick = closeModal;
    q('[data-a="tour"]').onclick = () => { closeModal(); if (window.__startTour) window.__startTour(); };
  }
  // ---------- guided tour: a short spotlight walkthrough for new players ----------
  const TOUR_KEY = 'citadel-tour-done';
  const TOUR_STEPS = [
    { target: () => $('stage'), title: 'The siege', text: 'Shadows are closing on the Citadel. Seat <b>7 white swords</b> on the wheel (bottom left) by finishing missions. Six black swords, or twelve siege engines along the top, and the Citadel falls.' },
    { target: () => $('missions'), title: 'Missions', text: 'Each card is a mission. It has a <b>favoured suit</b> (the icon at top left: a card of that suit counts double), a progress bar and an hourglass: the rounds left before it fails.' },
    { target: () => $('hand').closest('.panel'), title: 'Your hand', text: 'Four suits: Blade, Shield, Scroll and Boot. Click up to three cards to select them, then play them on the mission you are standing at.' },
    { target: () => $('actions').closest('.panel'), title: 'Your turn', text: 'Each defender gets <b>two actions</b>: move to a mission, play cards, gather supplies, rest, give a card or accuse. When you are done, press <b>End turn</b>. <b>Hint</b> suggests a sensible move.' },
    { target: () => $('shadowDeck'), title: 'The Shadow', text: 'Every turn starts with a Shadow card: siege engines, arrows, a whisper that steals a card, or treachery. You cannot stop it, only keep ahead of it.' },
    { target: () => $('rumors').closest('.panel'), title: 'The Traitor', text: 'One defender secretly serves the enemy. After each sabotage, witnesses name a few suspects. <b>The Traitor is always among them</b>, so compare the lists, then press <b>Accuse</b>.' },
    { target: null, title: 'Good luck', text: 'Open <b>Rules</b> any time for the full summary, and <b>Settings</b> for sound, motion and text size. You can replay this tour from either place.' }
  ];
  const tour = { i: 0, el: null, on: false };

  function tourPlace() {
    if (!tour.on) return;
    const step = TOUR_STEPS[tour.i], card = tour.el.querySelector('.tour-card'), spot = tour.el.querySelector('.tour-spot');
    const t = step.target ? step.target() : null;
    const vw = window.innerWidth, vh = window.innerHeight;
    if (t && t.getBoundingClientRect().width > 0) {
      const r = t.getBoundingClientRect(), pad = 6;
      spot.style.display = 'block';
      Object.assign(spot.style, { left: (r.left - pad) + 'px', top: (r.top - pad) + 'px', width: (r.width + pad * 2) + 'px', height: (r.height + pad * 2) + 'px' });
      const cw = Math.min(340, vw - 24), ch = card.offsetHeight || 180;
      card.style.width = cw + 'px';
      let x, y;
      if (r.bottom + ch + 16 < vh) { y = r.bottom + 14; x = r.left; }                       // below
      else if (r.top - ch - 16 > 0) { y = r.top - ch - 14; x = r.left; }                       // above
      else if (r.left - cw - 16 > 0) { y = Math.max(12, r.top); x = r.left - cw - 14; }      // left
      else { y = Math.max(12, vh - ch - 16); x = 12; }
      card.style.left = Math.max(12, Math.min(x, vw - cw - 12)) + 'px';
      card.style.top = Math.max(12, Math.min(y, vh - ch - 12)) + 'px';
    } else {
      spot.style.display = 'none';
      const cw = Math.min(380, vw - 24);
      card.style.width = cw + 'px';
      card.style.left = ((vw - cw) / 2) + 'px';
      card.style.top = Math.max(12, (vh - (card.offsetHeight || 200)) / 2) + 'px';
    }
  }

  function tourShow() {
    const step = TOUR_STEPS[tour.i], last = tour.i === TOUR_STEPS.length - 1;
    const t = step.target ? step.target() : null;
    if (t && t.scrollIntoView) t.scrollIntoView({ block: 'center', behavior: 'auto' });
    tour.el.querySelector('.tour-card').innerHTML =
      `<small>${tour.i + 1} of ${TOUR_STEPS.length}</small><h3>${esc(step.title)}</h3><p>${step.text}</p>` +
      '<div class="tour-actions">' + (last ? '' : '<button type="button" class="ghost" data-t="skip">Skip tour</button>') +
      (tour.i > 0 ? '<button type="button" class="ghost" data-t="back">Back</button>' : '') +
      `<button type="button" class="primary" data-t="next">${last ? 'Start playing' : 'Next'}</button></div>`;
    const c = tour.el.querySelector('.tour-card');
    c.querySelector('[data-t="next"]').onclick = () => { if (last) endTour(); else { tour.i++; tourShow(); } };
    const b = c.querySelector('[data-t="back"]'); if (b) b.onclick = () => { tour.i--; tourShow(); };
    const s = c.querySelector('[data-t="skip"]'); if (s) s.onclick = endTour;
    tourPlace();
    c.querySelector('[data-t="next"]').focus({ preventScroll: true });
  }

  function startTour() {
    if (tour.on) return;
    closeExpedition(true);
    if (!$('modal').hidden) closeModal();
    tour.on = true; tour.i = 0;
    tour.el = el('div', 'tour', '<div class="tour-spot"></div><div class="tour-card" role="dialog" aria-modal="true" aria-label="Guided tour"></div>');
    document.body.appendChild(tour.el);
    tourShow();
  }
  function endTour() {
    if (!tour.on) return;
    tour.on = false;
    tour.el.remove(); tour.el = null;
    try { localStorage.setItem(TOUR_KEY, '1'); } catch (e) { /* ignore */ }
  }
  window.addEventListener('resize', tourPlace);
  document.addEventListener('keydown', e => { if (tour.on && e.key === 'Escape') { e.stopPropagation(); endTour(); } }, true);
  window.__startTour = startTour;

  // Offered automatically once, on the first game started from the setup dialog.
  function maybeStartTour() {
    if (ui.fast || online) return;
    let done = false; try { done = localStorage.getItem(TOUR_KEY) === '1'; } catch (e) { /* ignore */ }
    if (!done) setTimeout(() => { if (!tour.on && $('modal').hidden) startTour(); }, 700);
  }
  // ---------- weather ----------
  const weather = { kind: 'clear', drops: [], raf: 0 };

  function setWeather() {
    const s = game;
    const kind = s.siege >= 8 ? 'storm' : s.siege >= 4 ? 'rain' : 'clear';
    $('weatherLabel').textContent = kind === 'storm' ? 'Storm' : kind === 'rain' ? 'Rain' : 'Clear';
    $('dim').style.opacity = Math.min(0.55, C.count(s, 'black') * 0.09 + (kind === 'storm' ? 0.15 : 0)).toFixed(2);
    if (window.CitadelAmbience) window.CitadelAmbience.update({ siege: s.siege, black: C.count(s, 'black'), storm: kind === 'storm' ? 2 : kind === 'rain' ? 1 : 0 });
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
    const role = game ? (isTraitorMe() && !game.traitorRevealed ? ' <span class="role-chip traitor">Traitor</span>' : isTraitorMe() ? ' <span class="role-chip">Unmasked</span>' : ' <span class="role-chip loyal">Loyal</span>') : '';
    chip.innerHTML = `Online <strong>${online.role === 'host' ? 'host' : 'guest'}</strong>${role}`;
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
    openModal('<div class="role-banner ' + (traitor ? 'traitor' : 'loyal') + '"><small>Your secret role</small><b>' + (traitor ? 'You are the Traitor' : 'You are a loyal defender') + '</b></div>' +
      '<h2 id="modalTitle" class="sr-only">' + (traitor ? 'You are the Traitor' : 'You are a loyal defender') + '</h2>' +
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

  // ---------- painted card faces (assets/cards/<suit>.webp or .jpg, and shadow) ----------
  // Each is used only once its file is known to load, so a suit without a painting keeps the plain card design.
  // handArt[suit] and shadowArt.url hold the resolved image URL (versioned, WebP preferred, JPG accepted).
  const handArt = {};
  const handVariants = {};          // suit -> [url, url, ...] (holes are skipped)
  function cardFace(card) {
    const v = (handVariants[card.suit] || []).filter(Boolean);
    return v.length ? v[card.id % v.length] : handArt[card.suit];
  }
  const shadowArt = { url: '' };
  if (Missions && Missions.resolveImage) {
    ['blade', 'shield', 'scroll', 'boot'].forEach(suit => {
      Missions.resolveImage('assets/cards/' + suit).then(f => { if (f) { handArt[suit] = f.url; if (game) render(); } });
      // extra designs: assets/cards/<suit>-1 ... -4. Each card shows one of them (chosen by its id), so a hand looks varied.
      [1, 2, 3, 4].forEach(n => Missions.resolveImage(`assets/cards/${suit}-${n}`).then(f => {
        if (!f) return;
        (handVariants[suit] = handVariants[suit] || [])[n - 1] = f.url;
        if (game) render();
      }));
    });
    Missions.resolveImage('assets/cards/shadow').then(f => { if (f) shadowArt.url = f.url; });
  }

  // ---------- boot ----------
  function startFrom(g) {
    game = g;
    ui.selectedSlot = null; ui.picked = []; ui.shownLog = 0; ui.prev = null; ui.endShown = false; ui.expKey = null;
    closeExpedition(true);
    clearChronicle();
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
  $('btnSettings').onclick = openSettings;

  if (Missions) Missions.installDefs();
  if (window.CitadelAmbience) window.CitadelAmbience.init($('stage'));
  applySettings();
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
  window.__citadel = { get game() { return game; }, render, startFrom, mw, openExpedition, closeExpedition, renderTrail, startTour, endTour, tour, startDaily, reportError, daily: { dayKey, dailySeed, readDaily, dailyStreak }, handArt, describeEvent, chronicle, clearChronicle, chron: ui.chron, settings: SET, handVariants, cardFace };
  if (/selftest/.test(location.hash)) {
    const t = document.createElement('script');
    t.src = 'js/selftest.js';
    document.body.appendChild(t);
  }
})();
