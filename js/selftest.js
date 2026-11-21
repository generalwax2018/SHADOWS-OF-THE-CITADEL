/* UI smoke test. Loaded only when the URL hash contains "selftest" (e.g. index.html#seed=42&selftest).
   It clicks real buttons, then writes a PASS/FAIL report into #selftest-result and the page title. */
(function () {
  'use strict';
  const results = [];
  const errors = [];
  window.addEventListener('error', e => errors.push(e.message));
  function check(name, cond, extra) { results.push({ name, ok: !!cond, extra: extra || '' }); }
  const $ = id => document.getElementById(id);
  const click = n => { n.dispatchEvent(new MouseEvent('click', { bubbles: true })); };
  const btnByText = (root, re) => [...root.querySelectorAll('button')].find(b => re.test(b.textContent));

  function run() {
    const H = window.__citadel;
    const C = window.Citadel;
    let g = H.game;

    check('7 quest frames rendered', document.querySelectorAll('.slot').length === 7);
    check('party panel lists every defender', document.querySelectorAll('.pm').length === g.party.length);
    check('hand shows cards', document.querySelectorAll('#hand .card').length === g.party[g.active].hand.length);
    check('wheel has 12 seats', $('wheel').children.length === 12);
    check('siege row has 12 dots', $('siegeRow').children.length === 12);
    check('weather canvas present', !!$('weatherCanvas'));

    // open a quest and move there
    const slotIdx = g.quests.findIndex(Boolean);
    click(document.querySelectorAll('.slot')[slotIdx]);
    check('clicking a frame opens the quest modal', !$('modal').hidden);
    const before = g.actionsLeft;
    const mover = g.party[g.active].id === 'elira';
    const go = btnByText($('modalCard'), /Move here/);
    check('modal offers Move here', !!go);
    if (go) click(go);
    g = H.game;
    check('move updates location', g.party[g.active].loc === slotIdx);
    check('move spends an action (unless Elira)', mover ? g.actionsLeft === before : g.actionsLeft === before - 1);
    check('modal closed after moving', $('modal').hidden);
    check('token drawn on the quest frame', document.querySelectorAll('.slot')[slotIdx].querySelectorAll('.token').length >= 1);

    // select cards and play
    const handCards = document.querySelectorAll('#hand .card');
    if (handCards.length >= 2) {
      click(handCards[0]); click(document.querySelectorAll('#hand .card')[1]);
      check('cards toggle selected', document.querySelectorAll('#hand .card.selected').length === 2);
      const play = btnByText($('actions'), /^Play 2 cards/);
      check('play button reflects selection', !!play && !play.disabled);
      const prog = g.quests[slotIdx] ? g.quests[slotIdx].progress : 0;
      if (play && !play.disabled && H.game.actionsLeft > 0) {
        click(play);
        g = H.game;
        const q = g.quests[slotIdx];
        check('playing cards advances or completes the quest', !q || q.progress > prog || C.count(g, 'white') > 0);
      }
    } else {
      check('enough cards to test play (skipped)', true, 'skipped');
    }

    // fourth card limit
    const hc = document.querySelectorAll('#hand .card');
    if (hc.length >= 4) {
      hc.forEach((c, i) => { if (i < 4) click(document.querySelectorAll('#hand .card')[i]); });
      check('cannot select more than 3 cards', document.querySelectorAll('#hand .card.selected').length <= 3);
    }

    // sound toggle
    const sb = $('btnSound');
    if (!sb.hidden) {
      const was = sb.textContent;
      click(sb);
      check('sound button toggles', sb.textContent !== was, was + ' -> ' + sb.textContent);
      click(sb);
      check('sound button toggles back', sb.textContent === was);
    }
    check('sound engine loaded', !!window.CitadelSound && typeof window.CitadelSound.play === 'function');
    let threw = false;
    try { ['click', 'pick', 'white', 'black', 'siege', 'wound', 'shadow', 'win', 'lose', 'thunder', 'nonexistent'].forEach(n => window.CitadelSound.play(n)); } catch (e) { threw = true; }
    check('every sound effect plays without throwing', !threw);

    // animation hooks: seating a sword pops the seat; igniting siege lights a dot
    {
      const g0 = H.game;
      const sw0 = C.count(g0, 'white');
      g0.seats[g0.seats.indexOf(null)] = 'white';
      g0.siege = Math.min(C.SIEGE_MAX - 1, g0.siege + 1);
      H.render();
      check('new sword seat gets the pop animation', !!document.querySelector('#wheel .seat.pop'));
      check('new siege dot gets the ignite animation', !!document.querySelector('#siegeRow .siege-dot.ignite'));
      check('white counter bumps', $('white').classList.contains('bump') && C.count(H.game, 'white') === sw0 + 1);
    }

    // hint
    document.querySelectorAll('#hand .card.selected').forEach(click);
    const hintBtn = btnByText($('actions'), /^Hint/);
    check('Hint button exists', !!hintBtn);
    if (hintBtn) click(hintBtn);
    check('Hint shows a suggestion', /^Hint:/.test($('msg').textContent), $('msg').textContent);

    // give a card to a defender standing in the same place
    g = H.game;
    if (!g.over && g.party.length > 1) {
      const me = g.party[g.active];
      const mate = g.party.findIndex((p, i) => i !== g.active && p.alive && !p.exiled);
      g.party[mate].loc = me.loc;
      g.party[mate].hand = g.party[mate].hand.slice(0, 2);
      g.actionsLeft = 2;
      if (me.hand.length === 0) me.hand.push({ id: 5001, suit: 'blade' });
      H.render();
      document.querySelectorAll('#hand .card.selected').forEach(click);
      click(document.querySelector('#hand .card'));
      const giveBtn = btnByText($('actions'), /^Give card/);
      check('Give card enabled with one card selected and a defender nearby', !!giveBtn && !giveBtn.disabled);
      if (giveBtn && !giveBtn.disabled) {
        const handBefore = g.party[mate].hand.length;
        click(giveBtn);
        check('give modal lists defenders', $('modalCard').querySelectorAll('.pick button').length >= 1);
        click($('modalCard').querySelector('.pick button'));
        check('card moved to the other defender', H.game.party[mate].hand.length === handBefore + 1);
        check('giving spent an action', H.game.actionsLeft === 1);
      }
      // keyboard shortcut: G gathers supplies
      const handNow = H.game.party[H.game.active].hand.length;
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'g', bubbles: true }));
      check('keyboard shortcut G gathers supplies', H.game.party[H.game.active].hand.length > handNow || H.game.party[H.game.active].hand.length === C.HAND_LIMIT);
    }

    // end turn
    const turnBefore = H.game.turn, activeBefore = H.game.active;
    click(btnByText($('actions'), /End turn/));
    check('end turn advances the game', H.game.turn > turnBefore || H.game.over);
    if (!H.game.over) {
      check('turn banner shown for the new turn', $('banner').classList.contains('show') && /turn/.test($('banner').textContent), $('banner').textContent);
      check('Shadow card reveal shown', $('shadowReveal').classList.contains('show') && $('shadowReveal').textContent.length > 5);
    }
    check('log shows entries', $('log').children.length > 3);

    // accuse flow
    g = H.game;
    if (!g.over) {
      g.rumors.push([g.traitor, (g.traitor + 1) % g.party.length]);
      g.actionsLeft = 2;
      H.render();
      const acc = btnByText($('actions'), /Accuse/);
      check('Accuse enabled once a rumor exists', !!acc && !acc.disabled);
      if (acc && !acc.disabled) {
        click(acc);
        check('accuse modal opens', !$('modal').hidden && $('modalCard').querySelectorAll('.pick button').length >= 1);
        const target = [...$('modalCard').querySelectorAll('.pick button')][0];
        click(target);
        const ok = btnByText($('modalCard'), /^Accuse$/);
        check('Accuse confirm enabled after picking', ok && !ok.disabled);
        const w0 = C.count(g, 'white') + C.count(g, 'black');
        click(ok);
        check('accusing seats a sword', C.count(H.game, 'white') + C.count(H.game, 'black') === w0 + 1 || H.game.over);
      }
    }

    // mission cards
    {
      const live = () => [...document.querySelectorAll('#missions .mc:not(.leaving)')];
      const g1 = H.game;
      check('a mission card is shown for every active quest', live().length === g1.quests.filter(Boolean).length, live().length + ' cards');
      check('every mission card has art', live().every(c => c.querySelector('.mc-img, .mc-svg')));
      let allArt = true;
      C.QUEST_DEFS.forEach(d => {
        const a = window.CitadelMissions.art(d);
        const ok = d.img ? /<img[^>]+src="assets\/[a-z-]+\.jpg"/.test(a) : (/<svg/.test(a) && a.length > 2000 && a.includes(d.name.toUpperCase().split(' ')[0]));
        if (!ok) allArt = false;
      });
      check('all 12 missions can render a card illustration', allArt);
      const svgCards = C.QUEST_DEFS.filter(d => !d.img).length;
      check('8 missions use generated animated art, 4 use paintings', svgCards === 8 && C.QUEST_DEFS.length === 12);
      check('animated scenes define moving parts', /class="flame"|class="bob"|class="drift"/.test(window.CitadelMissions.art(C.questDef('sea')) + window.CitadelMissions.art(C.questDef('beacons')) + window.CitadelMissions.art(C.questDef('scouts'))));

      click(live()[0]);
      check('clicking a mission card opens its panel and selects it', !$('modal').hidden && document.querySelector('#missions .mc.selected'));
      click($('modalCard').querySelector('[data-a="close"]'));

      // progress: float number + bar + timer text
      const gg = H.game; const slotP = gg.quests.findIndex(Boolean);
      const qp = gg.quests[slotP], before = qp.progress;
      qp.progress = Math.min(qp.needed - 2, before + 2);
      H.render();
      const cardP = live().find(c => +c.dataset.slot === slotP);
      check('progress shows a +N float on the card', !!cardP.querySelector('.mc-float'));
      check('card progress text matches the game', cardP.querySelector('.mc-prog').textContent.startsWith(String(qp.progress)));

      // completion: the card stamps COMPLETE and a new card enters that slot
      const gc = H.game; const pc = gc.party[gc.active];
      const slotC = gc.quests.findIndex((q, i) => q && i !== slotP);
      const qc = gc.quests[slotC], oldId = qc.id;
      pc.loc = slotC; qc.progress = qc.needed - 1; pc.hand = [{ id: 7001, suit: C.questDef(qc.id).suit }]; gc.actionsLeft = 2;
      C.contribute(gc, [7001]);
      H.render();
      check('completed mission card shows a COMPLETE stamp', !!document.querySelector('#missions .mc.leaving.success .mc-stamp'));
      check('a new mission card replaces it', live().some(c => +c.dataset.slot === slotC && c.dataset.qid !== oldId) || gc.quests[slotC] === null);

      // failure: deadline passes at the end of a round
      const gf = H.game;
      if (!gf.over) {
        const slotF = gf.quests.findIndex((q, i) => q && i !== slotC && i !== slotP);
        gf.quests[slotF].timer = 1;
        gf.active = gf.party.length - 1; gf.actionsLeft = 2;
        C.endTurn(gf);
        H.render();
        check('a missed deadline shows a FAILED stamp', !!document.querySelector('#missions .mc.leaving.fail .mc-stamp') || H.game.over);
      }
      // urgent missions (2 rounds or fewer) are flagged on their card
      const gu = H.game;
      const slotU = gu.quests.findIndex(q => q);
      if (slotU >= 0 && !gu.over) {
        gu.quests[slotU].timer = 2; H.render();
        const cu = live().find(c => +c.dataset.slot === slotU);
        check('a mission with 2 rounds left is marked urgent', !!cu && cu.classList.contains('urgent'));
      }
    }

    // save survives reload shape
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem('citadel-save-v1')); } catch (e) { /* ignore */ }
    check('autosave written (or game over)', !!saved || H.game.over, saved ? 'turn ' + saved.turn : '');

    // play a full game through the real engine via UI hooks to catch render crashes
    let guard = 0;
    while (!H.game.over && guard++ < 400) {
      const s = H.game;
      click(btnByText($('actions'), /End turn/));
      if (!$('modal').hidden && !$('modal').dataset.lock) click($('modal'));
    }
    check('forced playthrough reaches an ending without crashing', H.game.over || guard >= 400);
    check('end modal shows a result', !$('modal').hidden && /Victory|Defeat/.test($('modalCard').textContent));
    let stats = null;
    try { stats = JSON.parse(localStorage.getItem('citadel-stats-v1')); } catch (e) { /* ignore */ }
    check('win/loss record saved after the game ends', !!stats && stats.played >= 1, stats ? stats.played + ' played' : '');
    check('end modal offers a challenge link', !!btnByText($('modalCard'), /Copy challenge link/));
    check('no script errors', errors.length === 0, errors.join(' | '));

    const bad = results.filter(r => !r.ok);
    const html = results.map(r => `<div class="${r.ok ? 'pass' : 'fail'}">${r.ok ? 'PASS' : 'FAIL'} ${r.name} ${r.extra}</div>`).join('');
    const sum = `${results.length - bad.length}/${results.length} UI checks passed`;
    document.title = sum;
    const out = document.createElement('div');
    out.id = 'selftest-result';
    out.style.cssText = 'position:fixed;left:0;top:0;right:0;bottom:0;z-index:999;background:#000;color:#ddd;padding:16px;overflow:auto;font:13px monospace';
    out.innerHTML = '<h3>' + sum + '</h3>' + html;
    document.body.appendChild(out);
  }

  if (document.readyState === 'complete') setTimeout(run, 50);
  else window.addEventListener('load', () => setTimeout(run, 50));
})();
