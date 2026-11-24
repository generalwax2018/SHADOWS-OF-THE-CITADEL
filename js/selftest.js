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

  async function run() {
    const H = window.__citadel;
    const C = window.Citadel;
    await new Promise(r => setTimeout(r, 350));          // let the painted card faces finish loading
    H.render();
    let g = H.game;

    // painted card faces: blade, shield and scroll have paintings, boot does not yet
    {
      const p0 = g.party[g.active];
      const saved = p0.hand.slice();
      p0.hand = ['blade', 'shield', 'scroll', 'boot'].map((s, i) => ({ id: 8800 + i, suit: s }));
      H.render();
      const cs = [...document.querySelectorAll('#hand .card')];
      // the painting's real URL, as the browser resolved it, must load (catches wrong relative paths)
      const urls = cs.slice(0, 4).map(c => (/url\("?([^")]+)"?\)/.exec(getComputedStyle(c).backgroundImage) || [])[1]);
      const loaded = await Promise.all(urls.map(u => new Promise(r => { if (!u) return r(false); const i = new Image(); i.onload = () => r(true); i.onerror = () => r(false); i.src = u; })));
      check('blade, shield, scroll and boot cards show their paintings', cs.slice(0, 4).every(c => c.classList.contains('art')) && loaded.every(Boolean), urls.join(' | '));
      check('all four suits (blade, shield, scroll, boot) show paintings', cs.slice(0, 4).every(c => c.classList.contains('art')));
      // a suit whose painting is missing must fall back to the plain card design
      const bootUrl = H.handArt.boot, bootVar = H.handVariants.boot; H.handArt.boot = ''; delete H.handVariants.boot; H.render();
      const csFallback = [...document.querySelectorAll('#hand .card')];
      check('a suit without a painting keeps the plain card design', !csFallback[3].classList.contains('art') && csFallback[3].querySelector('.ico'));
      H.handArt.boot = bootUrl; H.handVariants.boot = bootVar;
      p0.hand = saved; H.render();
    }

    check('7 quest frames rendered', document.querySelectorAll('.slot').length === 7);
    check('party panel lists every defender', document.querySelectorAll('.pm').length === g.party.length);
    { const H2 = window.__citadel;
      check('every suit has four extra card designs', ['blade', 'shield', 'scroll', 'boot'].every(su => (H2.handVariants[su] || []).filter(Boolean).length === 4), JSON.stringify(Object.fromEntries(Object.entries(H2.handVariants).map(([k, v]) => [k, v.filter(Boolean).length]))));
      const faces = new Set([0, 1, 2, 3].map(i => H2.cardFace({ suit: 'blade', id: i })));
      check('cards of one suit use different designs', faces.size === 4);
      const urls = [...faces]; const okAll = await Promise.all(urls.map(u => new Promise(r => { const i = new Image(); i.onload = () => r(true); i.onerror = () => r(false); i.src = u; })));
      check('the extra card designs load', okAll.every(Boolean), urls.join(' | ')); }    { const et = btnByText(document.getElementById('actions'), /End turn/);
      check('the End turn button is visible and enabled', !!et && !et.disabled && getComputedStyle(et).opacity === '1' && et.getBoundingClientRect().width > 20, et ? 'opacity ' + getComputedStyle(et).opacity : 'missing'); }
    { const act0 = document.getElementById('actions'); const n0 = g.party[g.active].hand.length, ac0 = g.actionsLeft;
      const ub = btnByText(act0, /^Undo/);
      check('Undo is offered and starts disabled', !!ub && ub.disabled);
      click(btnByText(act0, /^Gather/));
      check('gathering changes the hand and enables Undo', g.party[g.active].hand.length >= n0 && g.actionsLeft === ac0 - 1 && !btnByText(document.getElementById('actions'), /^Undo/).disabled);
      click(btnByText(document.getElementById('actions'), /^Undo/));
      check('Undo takes the action back', g.party[g.active].hand.length === n0 && g.actionsLeft === ac0 && btnByText(document.getElementById('actions'), /^Undo/).disabled); }    check('hand shows cards', document.querySelectorAll('#hand .card').length === g.party[g.active].hand.length);
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

    // guided tour
    {
      const TT = H.tour;
      localStorage.removeItem('citadel-tour-done');
      H.startTour();
      const tr = document.querySelector('.tour');
      check('the guided tour opens with a spotlight and a first step', !!tr && H.tour.on && /1 of 7/.test(tr.textContent) && /siege/i.test(tr.textContent));
      const nextBtn = () => document.querySelector('.tour [data-t="next"]');
      const spotArea = () => { const r = document.querySelector('.tour-spot').getBoundingClientRect(); return r.width * r.height; };
      check('the first step highlights the board', spotArea() > 20000);
      click(nextBtn());
      check('Next moves to the missions step and highlights the mission strip', H.tour.i === 1 && /Missions/.test(document.querySelector('.tour-card h3').textContent) && spotArea() > 5000);
      click(document.querySelector('.tour [data-t="back"]'));
      check('Back returns to the previous step', H.tour.i === 0);
      for (let i = 0; i < 6; i++) click(nextBtn());
      check('the last step is centered with no spotlight and a Start playing button', H.tour.i === 6 && getComputedStyle(document.querySelector('.tour-spot')).display === 'none' && /Start playing/.test(nextBtn().textContent));
      click(nextBtn());
      check('finishing closes the tour and remembers it', !document.querySelector('.tour') && !H.tour.on && localStorage.getItem('citadel-tour-done') === '1');
      H.startTour();
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      check('Escape skips the tour', !document.querySelector('.tour') && !H.tour.on);
      // every tour step lands on something that exists and is visible
      let ok = true; const bad = [];
      H.startTour();
      for (let i = 0; i < 7; i++) { const t = H.tour; const r = document.querySelector('.tour-spot'); const c = document.querySelector('.tour-card').getBoundingClientRect(); if (c.width < 100 || c.left < 0 || c.right > window.innerWidth + 1) { ok = false; bad.push(i); } if (i < 6) click(nextBtn()); }
      check('every tour card fits inside the window', ok, bad.join(','));
      H.endTour();
    }
    // settings panel
    {
      const S = H.settings, Snd = window.CitadelSound, html = document.documentElement;
      click($('btnSettings'));
      const mb = $('modalCard');
      check('the Settings button opens the settings panel', !$('modal').hidden && !!mb.querySelector('#setVol') && !!mb.querySelector('#setMotion'));
      const fire = (n, v) => { if (typeof v === 'boolean') n.checked = v; else n.value = v; n.dispatchEvent(new Event(n.type === 'range' ? 'input' : 'change', { bubbles: true })); };
      fire(mb.querySelector('#setVol'), '30');
      check('the volume slider changes the sound volume', Math.abs(Snd.getVolume() - 0.3) < 0.01, String(Snd.getVolume()));
      check('the volume label follows the slider', mb.querySelector('#setVolOut').textContent === '30%');
      fire(mb.querySelector('#setAmb'), false);
      check('ambience can be switched off', Snd.isAmbienceOn() === false);
      fire(mb.querySelector('#setMotion'), 'reduce');
      check('the Motion setting can force reduced motion', html.classList.contains('reduce-motion') && window.CitadelFx.isReduced());
      fire(mb.querySelector('#setMotion'), 'full');
      check('the Motion setting can force full motion', !html.classList.contains('reduce-motion') && html.classList.contains('full-motion') && !window.CitadelFx.isReduced());
      fire(mb.querySelector('#setText'), 'large');
      check('large text is applied', html.classList.contains('large-text'));
      check('the mission view does not open by itself by default', S.autoView === false);
      fire(mb.querySelector('#setAuto'), true);
      check('opening the mission view automatically can be switched on', S.autoView === true);
      let stored = null; try { stored = JSON.parse(localStorage.getItem('citadel-settings-v1')); } catch (e) { /* ignore */ }
      check('settings are remembered in the browser', !!stored && Math.abs(stored.volume - 0.3) < 0.01 && stored.text === 'large' && stored.autoView === true && stored.ambience === false);
      click(btnByText(mb, /Reset to defaults/));
      check('Reset to defaults restores everything', Math.abs(Snd.getVolume() - 0.7) < 0.01 && Snd.isAmbienceOn() && !html.classList.contains('large-text') && S.autoView === false && S.motion === 'system');
      click(btnByText($('modalCard'), /^Done/));
      check('Done closes the settings panel', $('modal').hidden);
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
      const sc = $('shadowReveal').querySelector('.sr-card.art');
      const su = sc && (/url\("?([^")]+shadow\.(?:webp|jpg)[^")]*)"?\)/.exec(getComputedStyle(sc).backgroundImage) || [])[1];
      const sOk = su ? await new Promise(r => { const i = new Image(); i.onload = () => r(true); i.onerror = () => r(false); i.src = su; }) : false;
      check('the Shadow card shows its painting (the image URL loads)', !!sc && sOk, su || 'no art class');
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
        const ok = d.img ? /<img[^>]+src="assets\/[a-z-]+\.webp"/.test(a) : (/<svg/.test(a) && a.length > 2000 && a.includes(d.name.toUpperCase().split(' ')[0]));
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

    // live mission windows, progress-driven scenes and the expedition view
    {
      const Hh = H, M = window.CitadelMissions, mw = Hh.mw;
      const wins = [...document.querySelectorAll('#overlay .mwin')];
      check('the board has two live mission windows', wins.length === 2);
      const shown = mw.wins.filter(w => w.live);
      check('both windows show a mission scene with its own weather canvas', shown.length === 2 && shown.every(w => w.el.querySelector('.lv canvas')));
      check('the two windows show different missions', shown.length === 2 && shown[0].qid !== shown[1].qid);

      // the first window follows the active defender onto a mission
      const gw = Hh.game;
      const target = gw.quests.findIndex((q, i) => q && i !== mw.wins[0].slot);
      Hh.closeExpedition(true);
      gw.party[gw.active].loc = target; gw.actionsLeft = Math.max(1, gw.actionsLeft); Hh.render();
      check('the first window switches to the mission the active defender stands on', mw.wins[0].qid === gw.quests[target].id);

      // opening a window pulls it open into the expedition view
      click(wins[0]);
      const expEl = document.getElementById('expedition');
      check('selecting a window opens the expedition view', expEl.classList.contains('open') && !!expEl.querySelector('.exp-frame .lv svg'));
      check('the expedition shows the mission title and progress meter', /\d+ \/ \d+/.test(expEl.textContent) && expEl.querySelector('h3').textContent.length > 3);
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      check('Escape returns to the map', mw.exp === null);
      await new Promise(r => setTimeout(r, 450));
      check('the expedition overlay is gone after closing', !expEl.classList.contains('open') && expEl.innerHTML === '');

      // every generated scene reacts to progress: nothing lit at 0, something lit at 95%
      let reactive = true; const detail = [];
      ['sea', 'mountains', 'beacons', 'archives', 'gates', 'scouts', 'forge', 'oath'].forEach(id => {
        const lv = M.live(C.questDef(id));
        document.body.appendChild(lv.el);
        lv.update({ progress: 0, needed: 20, timer: 5 }, {});
        const n0 = lv.el.querySelectorAll('[data-at].on').length;
        lv.update({ progress: 19, needed: 20, timer: 5 }, {});
        const n1 = lv.el.querySelectorAll('[data-at].on').length;
        if (!(n1 > n0)) { reactive = false; detail.push(id); }
        lv.destroy(); lv.el.remove();
      });
      check('all 8 generated scenes change as progress grows', reactive, detail.join(','));
      const bl = M.live(C.questDef('beacons')); document.body.appendChild(bl.el);
      bl.update({ progress: 10, needed: 20, timer: 5 }, {});
      const lit = bl.el.querySelectorAll('.lit.on').length;
      bl.update({ progress: 19, needed: 20, timer: 5 }, {});
      check('beacons light one after another', lit >= 2 && bl.el.querySelectorAll('.lit.on').length > lit);
      bl.destroy(); bl.el.remove();
      const ol = M.live(C.questDef('oath')); document.body.appendChild(ol.el);
      ol.update({ progress: 19, needed: 20, timer: 5 }, {});
      check('knights kneel as the oath is renewed', ol.el.querySelectorAll('.kn.on').length >= 10);
      ol.destroy(); ol.el.remove();
      check('painted missions get a window scene too', !!M.live(C.questDef('pass')).el.querySelector('.lv-painted'));

      // a mission that ends while its expedition is open shows the outcome
      const ge = Hh.game; const slotE = ge.quests.findIndex(Boolean);
      ge.party[ge.active].loc = slotE; ge.actionsLeft = 2; Hh.render();
      Hh.openExpedition(slotE, null);
      const qe = ge.quests[slotE]; qe.progress = qe.needed - 1;
      ge.party[ge.active].hand = [{ id: 7501, suit: C.questDef(qe.id).suit }];
      C.contribute(ge, [7501]); Hh.render();
      check('finishing a mission inside the expedition shows COMPLETE', !!document.querySelector('#expedition .exp-result.success'));
      Hh.closeExpedition(true);
    }

    // painting drop-ins: nothing is added for missing files, layers appear when files exist
    {
      await new Promise(r => setTimeout(r, 400));
      // every painting layer on the page must point at a file that really loads (a missing file would draw a broken-image icon)
      const hrefs = [...document.querySelectorAll('.mc-svg:not(.lv-painted) image')].map(n => n.getAttribute('href'));
      const loadOk = await Promise.all(hrefs.map(h => new Promise(r => { const i = new Image(); i.onload = () => r(true); i.onerror = () => r(false); i.src = h; })));
      check('painting URLs carry a version so replaced images are never stale', hrefs.length > 0 && hrefs.every(h => /\?v=\d+$/.test(h)) && /^\d+$/.test(window.CitadelMissions.artVersion), hrefs.slice(0, 2).join(' '));
      check('painting layers only exist for files that load (no broken-image icons)', loadOk.every(Boolean), hrefs.filter((h, i) => !loadOk[i]).join(','));
      const M = window.CitadelMissions;
      const setProbe = (base, val) => { ['webp', 'jpg'].forEach(e => { M._probes[M.versioned(base + '.' + e)] = Promise.resolve(val); }); };
      const clearProbe = base => { ['webp', 'jpg'].forEach(e => { delete M._probes[M.versioned(base + '.' + e)]; }); };
      setProbe('assets/art/sea', true);
      setProbe('assets/card/sea', true);
      const host = document.createElement('div');
      host.innerHTML = M.art(C.questDef('sea'));
      document.body.appendChild(host);
      M.attach(host, C.questDef('sea'));
      await new Promise(r => setTimeout(r, 50));
      check('an art-only painting is placed inside the frame window', !!host.querySelector('g[clip-path] image.art-photo'));
      check('an art-only painting wins: the full-card file is not used when an illustration exists', !host.querySelector('image.card-photo'));
      host.remove();
      // with no illustration, a full-card painting covers the whole card
      setProbe('assets/art/sea', false);
      const hostC = document.createElement('div');
      hostC.innerHTML = M.art(C.questDef('sea'));
      document.body.appendChild(hostC);
      M.attach(hostC, C.questDef('sea'));
      await new Promise(r => setTimeout(r, 80));
      check('a full-card painting covers the whole card when there is no illustration', !!hostC.querySelector('svg > image.card-photo') && !hostC.querySelector('image.art-photo'));
      hostC.remove();
      setProbe('assets/art/sea', true);

      // a freshly downloaded JPG (no WebP yet) must still be picked up, and WebP must win when both exist
      M._probes[M.versioned('assets/art/forge.webp')] = Promise.resolve(false);
      M._probes[M.versioned('assets/art/forge.jpg')] = Promise.resolve({ w: 671, h: 1000 });
      const fj = await M.resolveImage('assets/art/forge');
      check('a JPG-only painting is still found (the format fallback)', !!fj && /forge\.jpg\?v=\d+$/.test(fj.url));
      M._probes[M.versioned('assets/art/forge.webp')] = Promise.resolve({ w: 671, h: 1000 });
      const fw = await M.resolveImage('assets/art/forge');
      check('WebP is preferred when both formats exist', !!fw && /forge\.webp\?v=\d+$/.test(fw.url));
      check('a painting with no file in either format resolves to nothing', await M.resolveImage('assets/art/__nothing__') === false);
      clearProbe('assets/art/forge');

      // tall paintings: full-bleed on cards, panning in the live windows
      setProbe('assets/art/mountains', { w: 671, h: 1000 });
      const hostT = document.createElement('div');
      hostT.innerHTML = M.art(C.questDef('mountains'));
      document.body.appendChild(hostT);
      M.attach(hostT, C.questDef('mountains'));
      const lvT = M.live(C.questDef('mountains'));
      document.body.appendChild(lvT.el);
      await new Promise(r => setTimeout(r, 80));
      check('a tall painting fills the whole card behind the title', !!hostT.querySelector('svg.bleed > image.art-bleed') && !hostT.querySelector('image.art-photo'));
      check('a tall painting pans slowly in the live window', lvT.el.classList.contains('lv-bleed') && !!lvT.el.querySelector('.lv-art') && !!lvT.el.querySelector('.lv-glow'));
      lvT.destroy(); lvT.el.remove(); hostT.remove();
      clearProbe('assets/art/mountains');

      const hostP = document.createElement('div');
      hostP.innerHTML = M.art(C.questDef('pass'));
      M.attach(hostP, C.questDef('pass'));
      check('missions with their own painted card are left alone', !hostP.querySelector('image'));
    }

    // the chronicle: a big centered card for major events
    {
      const D = H.describeEvent;
      const cases = [
        ['Rescue the Scouts is complete! A white sword is seated and the siege falls back.', 'win', 'complete'],
        ['Defend the Walls has failed! A black sword is seated.', 'lose', 'failed'],
        ['Shadow: a siege engine rolls up. (+1)', 'lose', 'siege'],
        ['Shadow: a full assault. +2 siege engines.', 'lose', 'siege'],
        ['Shadow: the Gate opens. A black sword is seated.', 'lose', 'black'],
        ['Captain Veyra advances Hold the Pass: +4 (4/13).', 'win', 'progress'],
        ['Lord Harren is wounded (2/3).', 'lose', 'wound'],
        ['The Berserker has fallen! A black sword is seated.', 'lose', 'fallen'],
        ['Sabotage! The enemy slips closer. +1 siege engine.', 'lose', 'sabotage'],
        ['Scout Elira is the Traitor! Cast out of the Citadel. A white sword is seated.', 'win', 'traitor'],
        ['Mage-Knight is innocent! Shaken by the accusation, they lose their next turn. A black sword is seated.', 'lose', 'wrong']
      ];
      const badMap = cases.filter(([t, c, k]) => { const d = D({ text: t, cls: c }); return !d || d.type !== k || !d.icon || !d.title; }).map(c => c[2]);
      check('every major engine event maps to a chronicle card', badMap.length === 0, badMap.join(','));
      check('a progress card shows the amount gained', D({ text: 'X advances Y: +4 (4/13).', cls: 'win' }).title === 'Mission Progress +4');
      check('lines that only set up an event produce no card', D({ text: 'Shadow: an arrow finds Lord Harren.', cls: 'lose' }) === null);

      H.clearChronicle();
      H.chronicle(D({ text: 'Shadow: a siege engine rolls up. (+1)', cls: 'lose' }));
      const cbox = document.getElementById('chronicle');
      check('a chronicle card appears with an icon, a title and a description', !!cbox.querySelector('.chron .chron-icon svg') && /Siege/.test(cbox.querySelector('b').textContent) && cbox.querySelector('p').textContent.length > 8);
      check('the chronicle never blocks clicks', getComputedStyle(cbox).pointerEvents === 'none');
      for (let i = 0; i < 10; i++) H.chronicle(D({ text: 'Lord Harren is wounded (2/3).', cls: 'lose' }));
      check('the chronicle queue stays short', H.chron.q.length <= 3, String(H.chron.q.length));
      H.clearChronicle();
      H.chronicle(D({ text: 'Defend the Walls has failed! A black sword is seated.', cls: 'lose' }));
      const shownAtOnce = !!cbox.querySelector('.chron');
      await new Promise(r => setTimeout(r, 2500));
      check('the card dismisses itself after about two seconds', shownAtOnce && !cbox.querySelector('.chron'));

      // a real action in the game produces a card
      H.clearChronicle();
      const gx = H.game, px = gx.party[gx.active], sx = gx.quests.findIndex(Boolean);
      if (!gx.over && sx >= 0) {
        px.loc = sx; gx.actionsLeft = 2; px.hand = [{ id: 8901, suit: C.questDef(gx.quests[sx].id).suit }];
        C.contribute(gx, [8901]); H.render();
        check('playing cards on a mission shows a chronicle card', /Progress|Complete/.test(cbox.textContent), cbox.textContent.slice(0, 60));
        H.clearChronicle(); H.closeExpedition(true);
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
    // daily challenge and end-of-game highlights
    {
      const D = H.daily;
      localStorage.removeItem('citadel-daily-v1');
      check('the daily key is a date and its seed is the date digits', /^\d{4}-\d{2}-\d{2}$/.test(D.dayKey()) && D.dailySeed() === Number(D.dayKey().replace(/-/g, '')));
      click($('btnNew'));
      const dbtn = document.querySelector('#modalCard [data-a="daily"]');
      check('the setup dialog offers the daily challenge', !!dbtn && /Daily challenge/.test($('modalCard').textContent) && /Not played yet/.test($('modalCard').textContent));
      click(dbtn);
      const dg = H.game;
      check('the daily game uses the date seed, 5 defenders, Normal', dg.daily === D.dayKey() && dg.seed === D.dailySeed() && dg.party.length === 5 && dg.difficulty === 'normal');
      const twin = C.createGame({ seed: D.dailySeed(), partySize: 5, difficulty: 'normal' });
      check('everyone gets the same deal (identical defenders and Shadow deck)', JSON.stringify(dg.party.map(p => p.id)) === JSON.stringify(twin.party.map(p => p.id)) && dg.shadowDeck.join() === twin.shadowDeck.join() && dg.traitor === twin.traitor);
      dg.stats.progress[0] = 9; dg.stats.done = 3; dg.over = { win: true, reason: 'test win' };
      H.render();
      const em = $('modalCard').textContent;
      check('the end screen shows highlights from the run', /Highlights/.test(em) && /Missions completed/.test(em) && /Most progress/.test(em));
      check('the end screen shows the daily streak and offers a shareable result', /Daily challenge/.test(em) && /streak/.test(em) && !!btnByText($('modalCard'), /Copy result/));
      const day1 = D.readDaily()[D.dayKey()];
      check('the daily win is recorded and counts toward a streak', !!day1 && day1.win === true && D.dailyStreak(D.readDaily()) >= 1);
      // a later loss the same day must not erase the win
      click(btnByText($('modalCard'), /Play again/)); click(document.querySelector('#modalCard [data-a="daily"]'));
      const g2 = H.game; g2.over = { win: false, reason: 'test loss' }; H.render();
      check('a later loss on the same day does not overwrite the win', D.readDaily()[D.dayKey()].win === true);
      // a game saved before statistics existed still gets an end screen
      const old = C.createGame({ seed: 5, partySize: 4 }); delete old.stats; old.over = { win: false, reason: 'old save' };
      H.startFrom(old);
      check('an old game without statistics still shows an end screen', /Defeat/.test($('modalCard').textContent) && !/Highlights/.test($('modalCard').textContent));
    }
    let stats = null;
    try { stats = JSON.parse(localStorage.getItem('citadel-stats-v1')); } catch (e) { /* ignore */ }
    check('win/loss record saved after the game ends', !!stats && stats.played >= 1, stats ? stats.played + ' played' : '');
    check('end modal offers a challenge link', !!btnByText($('modalCard'), /Copy challenge link/));
    // board ambience
    {
      const st = document.getElementById('stage');
      const layers = ['.torch', '.fog', '.glint', '.vignette', '.lantern', '.amb-danger', 'canvas.embers'];
      check('the board has its ambience layers', layers.every(q => !!st.querySelector(q)));
      check('ambience never blocks clicks', [...st.querySelectorAll('.amb, .amb > *')].every(n => getComputedStyle(n).pointerEvents === 'none'));
      const A = window.CitadelAmbience;
      A.update({ siege: 10, black: 0, storm: 2 });
      check('high siege puts the board in danger', st.classList.contains('in-danger') && st.dataset.storm === '2');
      A.update({ siege: 1, black: 0, storm: 0 });
      check('and the danger clears again', !st.classList.contains('in-danger'));
      A.setReduced(true);
      check('reduced motion stills the ambience', st.classList.contains('amb-still') && A._state.raf === 0);
      A.setReduced(false);
    }    // suit powers rail
    {
      const rail = document.getElementById('powers');
      check('the suit-power rail lists four powers and the ward', !!rail && rail.querySelectorAll('.pw').length === 5 && /Charge/.test(rail.textContent) && /Swift/.test(rail.textContent) && /Ward/.test(rail.textContent));
    }    // path of destruction
    {
      const tr = document.getElementById('trail');
      const n = window.__citadel.game.trail.length;
      check('the path of destruction lists the Shadow cards drawn', !!tr && tr.querySelectorAll('.tchip:not(.citadel)').length === Math.min(24, n) && n >= 1);
      check('the path ends at the Citadel', !!tr.querySelector('.tchip.citadel'));
      check('the newest Shadow card is marked', !!tr.querySelector('.tchip.last'));
    }    // campaign, achievements, colour-blind mode
    { const H5 = window.__citadel;
      try { localStorage.removeItem('citadel-campaign-v1'); localStorage.removeItem('citadel-ach-v1'); } catch (e) { /* ignore */ }
      H5.startCampaign();
      const g5 = H5.game;
      check('the campaign starts at chapter 1 (4 defenders, easy)', g5.campaign === 1 && g5.party.length === 4 && g5.difficulty === 'easy');
      g5.over = { win: true, reason: 'test' }; g5.stats.wounds = 0; g5.round = 9;
      H5.render();
      await new Promise(r => setTimeout(r, 1300));
      check('winning a chapter advances the campaign', H5.readCampaign().chapter === 1);
      const ach = H5.readAch();
      check('a win earns First Light, Untouched and Lightning Defence', !!ach.first_win && !!ach.untouched && !!ach.swift, JSON.stringify(ach));
      check('the end screen shows the replay and unlocked achievements', !!document.querySelector('#replay .tchip') && /Achievement unlocked/.test(document.getElementById('modalCard').textContent));
      const s2 = H5.settings; s2.cb = true; document.documentElement.classList.toggle('cb', true);
      check('colour-blind mode changes the suit colours', getComputedStyle(document.documentElement).getPropertyValue('--blade').trim().toUpperCase() === '#E69F00');
      s2.cb = false; document.documentElement.classList.toggle('cb', false);
      try { localStorage.removeItem('citadel-campaign-v1'); localStorage.removeItem('citadel-ach-v1'); } catch (e) { /* ignore */ }
      document.querySelectorAll('#modal [data-a="view"]').forEach(b => b.click());
    }    // guided practice game
    { window.__citadel.startPractice();
      const cb = document.getElementById('coach');
      check('Practice starts a 3-defender easy game with a coach', window.__citadel.game.party.length === 3 && window.__citadel.game.difficulty === 'easy' && !cb.hidden && /Step 1/.test(cb.textContent));
      click(cb.querySelector('button'));
      check('the coach can be dismissed', document.getElementById('coach').hidden); }    // the crash guard: an error is reported to the player and collected, and the game stays usable
    {
      const before = window.__citadelErrors.length;
      H.reportError(new Error('test error'));
      check('an unexpected error shows a friendly bar with Reload', !!document.querySelector('.crash') && !!btnByText(document.querySelector('.crash'), /Reload/) && window.__citadelErrors.length === before + 1);
      click(btnByText(document.querySelector('.crash'), /Dismiss/));
      check('the error bar can be dismissed', !document.querySelector('.crash'));
      window.__citadelErrors.pop();           // that error was deliberate
    }
    check('no script errors', errors.length === 0 && window.__citadelErrors.length === 0, errors.concat(window.__citadelErrors).join(' | '));

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
