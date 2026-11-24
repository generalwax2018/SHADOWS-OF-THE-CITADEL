/*
 * Shadows of the Citadel - rules engine.
 * Pure game logic: no DOM, no timers. State is plain JSON so it can be saved,
 * replayed from a seed, and unit-tested. All randomness comes from state.rng.
 */
(function (root) {
  'use strict';

  const SUITS = ['blade', 'shield', 'scroll', 'boot'];
  const SUIT_LABEL = { blade: 'Blade', shield: 'Shield', scroll: 'Scroll', boot: 'Boot' };
  const SEATS = 12;          // seats on the Round Wheel
  const WIN_WHITE = 7;       // 7 white swords: the Citadel holds
  const LOSE_BLACK = 6;      // 6 black swords: 7 white can no longer be reached
  const SIEGE_MAX = 12;
  const HAND_LIMIT = 7;
  const SLOTS = 7;           // quest frames on the board
  const CITADEL = -1;        // location id; 0..6 are quest slots
  const MAX_CONTRIBUTE = 3;

  const DEFENDERS = [
    { id: 'veyra',     name: 'Captain Veyra',   hp: 3, img: 'defender-veyra',
      ability: 'Rallying Cry: adds +1 progress whenever she contributes to a quest.' },
    { id: 'harren',    name: 'Lord Harren',     hp: 3, img: 'defender-harren',
      ability: 'Quartermaster: draws 3 cards instead of 2.' },
    { id: 'elira',     name: 'Scout Elira',     hp: 3, img: 'defender-elira',
      ability: 'Pathfinder: moving costs no action.' },
    { id: 'berserker', name: 'The Berserker',   hp: 3, img: 'defender-berserker',
      ability: 'Fury: Blade cards add +1 progress each.' },
    { id: 'mage',      name: 'Mage-Knight',     hp: 3, img: 'defender-mage',
      ability: 'Foresight: glimpses the next Shadow card.' },
    { id: 'cavalry',   name: 'Cavalry Captain', hp: 3, img: 'defender-cavalry',
      ability: 'Swift Charge: takes 3 actions each turn.' },
    { id: 'shield',    name: 'Shield-Bearer',   hp: 4, img: 'defender-shield',
      ability: 'Bulwark: has 4 health instead of 3.' }
  ];

  // needed = progress to complete, timer = rounds before it fails
  const QUEST_DEFS = [
    { id: 'pass',      name: 'Hold the Pass',        suit: 'shield', needed: 5, timer: 6, img: 'quest-pass',
      text: 'Defeat the Shadow Assault before the Pass is overrun.' },
    { id: 'banner',    name: 'Recover the Banner',   suit: 'blade',  needed: 5, timer: 6, img: 'quest-banner',
      text: 'Win back the fallen standard from the field.' },
    { id: 'blade',     name: 'Seek the Relic Blade', suit: 'scroll', needed: 6, timer: 7, img: 'quest-blade',
      text: 'Find the blade the old kings buried.' },
    { id: 'walls',     name: 'Defend the Walls',     suit: 'shield', needed: 5, timer: 6, img: 'quest-walls',
      text: 'Keep the siege towers from the curtain wall.' },
    { id: 'sea',       name: 'Scout the Sea',        suit: 'boot',   needed: 4, timer: 6, img: null,
      text: 'Count the black sails before they land.' },
    { id: 'mountains', name: 'Mountain Watch',       suit: 'scroll', needed: 4, timer: 6, img: null,
      text: 'Light the signal fires above the passes.' },
    { id: 'beacons',   name: 'Light the Beacons',    suit: 'boot',   needed: 5, timer: 7, img: null,
      text: 'Call the far garrisons to the Citadel.' },
    { id: 'archives',  name: 'Guard the Archives',   suit: 'scroll', needed: 5, timer: 7, img: null,
      text: 'Save the war-records from the burning library.' },
    { id: 'gates',     name: 'Mend the Gates',       suit: 'shield', needed: 4, timer: 6, img: null,
      text: 'Reforge the shattered portcullis.' },
    { id: 'scouts',    name: 'Rescue the Scouts',    suit: 'boot',   needed: 5, timer: 7, img: null,
      text: 'Bring the lost riders home through the fog.' },
    { id: 'forge',     name: 'Feed the Forge',       suit: 'blade',  needed: 5, timer: 7, img: null,
      text: 'Keep the armourers working through the night.' },
    { id: 'oath',      name: 'Renew the Oath',       suit: 'blade',  needed: 6, timer: 8, img: null,
      text: 'Rally the wavering lords to the Citadel banner.' }
  ];

  // needScale multiplies each quest's progress cost; timerBonus shifts its deadline in rounds.
  const DIFFICULTY = {
    easy:   { needScale: 2.4, timerBonus: 3, calm: 6, gate: 1, siege2: 2, wound: 3 },
    normal: { needScale: 2.98, timerBonus: 2, calm: 3, gate: 2, siege2: 3, wound: 4 },
    hard:   { needScale: 3.0, timerBonus: 1, calm: 2, gate: 3, siege2: 4, wound: 5 }
  };

  // A round has one turn per defender, so a bigger party does more work (and meets more Shadow
  // cards) before each deadline. This keeps 3 to 7 defenders comparably difficult.
  const SIZE_NEED = { 3: 0.74, 4: 0.88, 5: 1, 6: 1.17, 7: 1.27 };

  // ---------- randomness ----------
  function rand(s) {                       // mulberry32, state kept in s.rng
    s.rng = (s.rng + 0x6D2B79F5) >>> 0;
    let t = s.rng;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  function randInt(s, n) { return Math.floor(rand(s) * n); }
  function shuffle(s, arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = randInt(s, i + 1);
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function say(s, text, cls) { s.log.push({ turn: s.turn, text, cls: cls || '' }); }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  // ---------- setup ----------
  function buildShadowDeck(s) {
    const d = DIFFICULTY[s.difficulty];
    const counts = { siege1: 8, siege2: d.siege2, dread: 3, wound: d.wound, whisper: 3,
                     gate: d.gate, calm: d.calm, hand: 3, omen: 2, famine: 2 };
    const deck = [];
    Object.keys(counts).forEach(type => { for (let i = 0; i < counts[type]; i++) deck.push(type); });
    return shuffle(s, deck);
  }

  function createGame(opts) {
    opts = opts || {};
    const size = Math.max(3, Math.min(7, opts.partySize || 5));
    const difficulty = DIFFICULTY[opts.difficulty] ? opts.difficulty : 'normal';
    const seed = (opts.seed != null ? opts.seed : (Date.now() ^ (Math.random() * 4294967296))) >>> 0;

    const s = {
      version: 1, rng: seed, seed, difficulty,
      turn: 1, round: 1, active: 0, actionsLeft: 0, maxActions: 2,
      over: null,                               // {win, reason} once finished
      seats: new Array(SEATS).fill(null),
      siege: 0,
      party: [], whiteDeck: [], whiteDiscard: [], shadowDeck: [], shadowDiscard: [],
      quests: new Array(SLOTS).fill(null), questPool: [],
      traitor: -1, traitorRevealed: false, rumors: [], sabotages: 0,
      lastShadow: null, log: [], trail: [], ward: 0
    };

    // party
    const picks = shuffle(s, DEFENDERS.map((_, i) => i)).slice(0, size);
    picks.forEach(i => {
      const d = DEFENDERS[i];
      s.party.push({ id: d.id, hp: d.hp, maxHp: d.hp, loc: CITADEL, hand: [],
                     alive: true, exiled: false, stunned: false });
    });
    s.traitor = randInt(s, s.party.length);
    s.stats = { progress: s.party.map(() => 0), done: 0, failed: 0, wounds: 0 };   // for the end-of-game highlights

    // white deck: 12 of each suit
    let cardId = 1;
    SUITS.forEach(suit => { for (let i = 0; i < 12; i++) s.whiteDeck.push({ id: cardId++, suit }); });
    shuffle(s, s.whiteDeck);
    s.party.forEach((p, i) => drawCards(s, i, 4, true));

    // quests: shuffle the pool, deal the first 7 to the frames
    const bonus = DIFFICULTY[difficulty].timerBonus;
    s.questPool = shuffle(s, QUEST_DEFS.map(q => q.id));
    for (let slot = 0; slot < SLOTS; slot++) dealQuest(s, slot, bonus);

    s.shadowDeck = buildShadowDeck(s);
    say(s, 'The shadows gather. Defend the Citadel. One of you serves the enemy.', '');
    beginTurn(s);
    return s;
  }

  function questDef(id) { return QUEST_DEFS.find(q => q.id === id); }
  function defenderDef(id) { return DEFENDERS.find(d => d.id === id); }

  function dealQuest(s, slot, bonus) {
    if (bonus === undefined) bonus = DIFFICULTY[s.difficulty].timerBonus;
    const id = s.questPool.pop();
    if (!id) { s.quests[slot] = null; return; }
    const def = questDef(id);
    const scale = DIFFICULTY[s.difficulty].needScale * (SIZE_NEED[s.party.length] || 1);
    const r = rand(s), mod = r < 0.2 ? 'blessed' : r < 0.36 ? 'rich' : null;    // mission modifiers
    s.quests[slot] = { id, progress: 0, needed: Math.max(3, Math.round(def.needed * scale)) + (mod === 'rich' ? 2 : 0), timer: Math.max(3, def.timer + bonus) };
    if (mod) s.quests[slot].mod = mod;
  }

  // ---------- helpers ----------
  function livingIdx(s) {
    const out = [];
    s.party.forEach((p, i) => { if (p.alive && !p.exiled) out.push(i); });
    return out;
  }
  function has(s, idx, id) { const p = s.party[idx]; return p && p.id === id && p.alive && !p.exiled; }
  function anyHas(s, id) { return s.party.some((_, i) => has(s, i, id)); }
  function count(s, color) { return s.seats.filter(x => x === color).length; }
  function locName(s, loc) {
    if (loc === CITADEL) return 'the Citadel';
    const q = s.quests[loc];
    return q ? questDef(q.id).name : 'an empty field';
  }

  function addSword(s, color) {
    const seat = s.seats.indexOf(null);
    if (seat >= 0) s.seats[seat] = color;
    checkEnd(s);
  }

  function addSiege(s, n) {
    s.siege = Math.max(0, Math.min(SIEGE_MAX, s.siege + n));
    checkEnd(s);
  }

  function checkEnd(s) {
    if (s.over) return;
    if (count(s, 'white') >= WIN_WHITE) {
      s.over = { win: true, reason: 'Seven white swords are seated. The Citadel holds!' };
    } else if (count(s, 'black') >= LOSE_BLACK) {
      s.over = { win: false, reason: 'Six black swords. The Wheel can no longer be won.' };
    } else if (s.siege >= SIEGE_MAX) {
      s.over = { win: false, reason: 'Twelve siege engines surround the Citadel. It is overrun.' };
    } else if (livingIdx(s).length === 0) {
      s.over = { win: false, reason: 'Every defender has fallen.' };
    }
    if (s.over) s.actionsLeft = 0;
  }

  function drawCards(s, idx, n, silent) {
    const p = s.party[idx];
    let drawn = 0;
    for (let i = 0; i < n; i++) {
      if (s.whiteDeck.length === 0) {
        if (s.whiteDiscard.length === 0) break;
        s.whiteDeck = shuffle(s, s.whiteDiscard.splice(0));
      }
      p.hand.push(s.whiteDeck.pop());
      drawn++;
    }
    return drawn;
  }

  function discardToLimit(s, idx) {
    const p = s.party[idx];
    let dropped = 0;
    while (p.hand.length > HAND_LIMIT) {
      s.whiteDiscard.push(p.hand.shift());
      dropped++;
    }
    if (dropped) say(s, `${defenderDef(p.id).name} discards ${dropped} card${dropped > 1 ? 's' : ''} (hand limit ${HAND_LIMIT}).`);
  }

  function damage(s, idx, n) {
    const p = s.party[idx];
    if (!p.alive) return;
    if ((s.ward || 0) > 0 && n > 0) {
      s.ward--;
      say(s, `A ward shatters and absorbs the blow meant for ${defenderDef(p.id).name}.`, 'win');
      return;
    }
    p.hp -= n;
    if (s.stats) s.stats.wounds++;
    const nm = defenderDef(p.id).name;
    if (p.hp <= 0) {
      p.hp = 0; p.alive = false;
      say(s, `${nm} has fallen! A black sword is seated.`, 'lose');
      s.whiteDiscard.push(...p.hand.splice(0));
      if (idx === s.traitor && !s.traitorRevealed) {
        s.traitorRevealed = true;
        say(s, `${nm} was the Traitor.`, '');
      }
      addSword(s, 'black');
    } else {
      say(s, `${nm} is wounded (${p.hp}/${p.maxHp}).`, 'lose');
    }
  }

  // ---------- the traitor ----------
  function sabotage(s) {
    if (s.traitorRevealed) return;
    const t = s.party[s.traitor];
    if (!t || !t.alive || t.exiled) return;
    s.sabotages++;
    const q = t.loc >= 0 ? s.quests[t.loc] : null;
    if (q && q.progress > 0) {
      q.progress = Math.max(0, q.progress - 2);
      say(s, `Sabotage at ${questDef(q.id).name}! Progress is undone.`, 'lose');
    } else if (t.loc === CITADEL || !q) {
      addSiege(s, 1);
      say(s, 'Sabotage! Someone opened a postern to the enemy. +1 siege engine.', 'lose');
    } else {
      const other = s.quests.findIndex(x => x && x.progress > 0);
      if (other >= 0) {
        s.quests[other].progress = Math.max(0, s.quests[other].progress - 1);
        say(s, `Sabotage! Work on ${questDef(s.quests[other].id).name} is ruined.`, 'lose');
      } else {
        addSiege(s, 1);
        say(s, 'Sabotage! The enemy slips closer. +1 siege engine.', 'lose');
      }
    }
    // Rumor: the traitor plus decoys. Intersecting rumors exposes them.
    const size = s.difficulty === 'hard' ? 2 : 3;
    const pool = livingIdx(s).filter(i => i !== s.traitor);
    shuffle(s, pool);
    const suspects = [s.traitor].concat(pool.slice(0, Math.max(0, size - 1)));
    shuffle(s, suspects);
    s.rumors.push(suspects);
    say(s, `Witnesses saw: ${suspects.map(i => defenderDef(s.party[i].id).name).join(', ')} nearby.`, '');
  }

  // ---------- turn flow ----------
  function resolveShadow(s, type) {
    const idx = s.active;
    const nm = defenderDef(s.party[idx].id).name;
    switch (type) {
      case 'siege1':  addSiege(s, 1); say(s, 'Shadow: a siege engine rolls up. (+1)', 'lose'); break;
      case 'siege2':  addSiege(s, 2); say(s, 'Shadow: a full assault. +2 siege engines.', 'lose'); break;
      case 'dread':
        say(s, 'Shadow: dread falls. Every quest loses a round.', 'lose');
        s.quests.forEach((q, i) => { if (q) q.timer -= 1; });
        expireQuests(s);
        break;
      case 'wound':   say(s, `Shadow: an arrow finds ${nm}.`, 'lose'); damage(s, idx, 1); break;
      case 'whisper': {
        const h = s.party[idx].hand;
        if (h.length) {
          const c = h.splice(randInt(s, h.length), 1)[0];
          s.whiteDiscard.push(c);
          say(s, `Shadow: a whisper steals a ${SUIT_LABEL[c.suit]} card from ${nm}.`, 'lose');
        } else {
          addSiege(s, 1);
          say(s, 'Shadow: a whisper finds an empty hand. +1 siege engine.', 'lose');
        }
        break;
      }
      case 'gate':    say(s, 'Shadow: the Gate opens. A black sword is seated.', 'lose'); addSword(s, 'black'); break;
      case 'calm':    say(s, 'Shadow: a strange calm. Nothing stirs.', ''); break;
      case 'omen':
        drawCards(s, s.active, 2); discardToLimit(s, s.active);
        say(s, 'Shadow: a fair omen. ' + defenderDef(s.party[s.active].id).name + ' draws two cards.', 'win'); break;
      case 'famine':
        s.party.forEach(q => { if (q.alive && q.hand.length) s.whiteDiscard.push(q.hand.shift()); });
        say(s, 'Shadow: famine. Every defender discards a card.', 'lose'); break;
      case 'hand':
        if (s.traitorRevealed || !s.party[s.traitor] || !s.party[s.traitor].alive) {
          say(s, 'Shadow: a whisper of treachery, but the Traitor is gone.', '');
        } else {
          say(s, 'Shadow: the Traitor strikes from within.', 'lose');
          sabotage(s);
        }
        break;
    }
  }

  function drawShadow(s) {
    if (s.shadowDeck.length === 0) {
      s.shadowDeck = shuffle(s, s.shadowDiscard.splice(0));
      if (s.shadowDeck.length === 0) s.shadowDeck = buildShadowDeck(s);
    }
    const type = s.shadowDeck.pop();
    s.shadowDiscard.push(type);
    s.lastShadow = type;
    if (s.trail) s.trail.push({ r: s.round, type });   // public history: the path of destruction
    resolveShadow(s, type);
  }

  function nextShadowPeek(s) {
    if (!anyHas(s, 'mage')) return null;
    return s.shadowDeck.length ? s.shadowDeck[s.shadowDeck.length - 1] : 'reshuffle';
  }

  function expireQuests(s) {
    s.quests.forEach((q, slot) => {
      if (q && q.timer <= 0 && !s.over) {
        if (s.stats) s.stats.failed++;
        if (s.trail) s.trail.push({ r: s.round, type: 'failed' });
        say(s, `${questDef(q.id).name} has failed! A black sword is seated.`, 'lose');
        s.party.forEach(p => { if (p.loc === slot) p.loc = CITADEL; });
        s.quests[slot] = null;
        dealQuest(s, slot);
        addSword(s, 'black');
      }
    });
  }

  function beginTurn(s) {
    if (s.over) return;
    s.maxActions = has(s, s.active, 'cavalry') ? 3 : 2;
    s.actionsLeft = s.maxActions;
    s.swiftUsed = false;
    const nm = defenderDef(s.party[s.active].id).name;
    say(s, `-- Turn ${s.turn}: ${nm} --`, 'turn');
    drawShadow(s);
    if (s.over) return;
    if (!s.party[s.active].alive) { endTurn(s, true); return; } // fell to the shadow draw
  }

  function endTurn(s, forced) {
    if (s.over) return { ok: false, msg: 'The game is over.' };
    const prev = s.active;
    if (!forced) discardToLimit(s, prev);

    // A bot Traitor may quietly sabotage after their own turn. A human Traitor chooses when to (see sabotageAction).
    if (!forced && !s.traitorHuman && prev === s.traitor && !s.traitorRevealed && s.party[prev].alive && rand(s) < 0.4) {
      sabotage(s);
      checkEnd(s);
      if (s.over) return { ok: true };
    }

    // Walk the turn order to the next defender who is alive, present and not stunned.
    // A round ends each time the walk passes from the last seat back to seat 0.
    const n = s.party.length;
    let cur = prev;
    for (let step = 0; step < n * 2 + 1; step++) {
      cur = (cur + 1) % n;
      if (cur === 0) {
        newRound(s);
        if (s.over) return { ok: true };
      }
      const p = s.party[cur];
      if (!p.alive || p.exiled) continue;
      if (p.stunned) {
        p.stunned = false;
        say(s, `${defenderDef(p.id).name} is stunned and loses their turn.`, '');
        continue;
      }
      s.active = cur;
      s.turn++;
      beginTurn(s);
      return { ok: true };
    }
    checkEnd(s);
    return { ok: true };
  }

  function newRound(s) {
    s.round++;
    s.quests.forEach(q => { if (q) q.timer -= 1; });
    say(s, `== Round ${s.round} ==`, 'turn');
    expireQuests(s);
  }

  // ---------- player actions ----------
  function fail(msg) { return { ok: false, msg }; }
  function canAct(s) {
    if (s.over) return fail('The game is over.');
    if (s.actionsLeft <= 0) return fail('No actions left. End your turn.');
    return null;
  }
  function spend(s, n) { s.actionsLeft = Math.max(0, s.actionsLeft - n); }

  function move(s, dest) {
    const bad = canAct(s); if (bad) return bad;
    const p = s.party[s.active];
    if (dest !== CITADEL && !(dest >= 0 && dest < SLOTS && s.quests[dest])) return fail('Nowhere to go there.');
    if (p.loc === dest) return fail('Already there.');
    p.loc = dest;
    const free = has(s, s.active, 'elira');
    if (!free) spend(s, 1);
    say(s, `${defenderDef(p.id).name} moves to ${locName(s, dest)}${free ? ' (free)' : ''}.`);
    return { ok: true };
  }

  // Suit powers: playing two or more cards of one suit in a single play also triggers that suit's power (once per play),
  // on top of their progress. Cards are therefore worth more than their number: you build pairs, and the pair you
  // choose decides whether you push the siege back, raise a ward, buy time, or save an action.
  const POWERS = {
    blade:  { name: 'Charge', text: 'The siege falls back one engine.' },
    shield: { name: 'Ward',   text: 'A ward absorbs the next wound (up to two held).' },
    scroll: { name: 'Lore',   text: 'This quest gains one more round.' },
    boot:   { name: 'Swift',  text: 'This play costs no action (once per turn).' }
  };
  const WARD_MAX = 2;
  const MODS = { blessed: { name: 'Blessed', text: 'A pair played here adds +1 progress per power.' }, rich: { name: 'Rich', text: 'Needs 2 more progress, but everyone draws 2 cards when it is done.' } };
  function suitPowers(s, idx, cardIds) {
    const p = s.party[idx];
    const n = {};
    Array.from(new Set(cardIds || [])).forEach(id => { const c = p.hand.find(x => x.id === id); if (c) n[c.suit] = (n[c.suit] || 0) + 1; });
    return SUITS.filter(su => n[su] >= 2 && !(su === 'boot' && s.swiftUsed));
  }

  function cardValue(s, idx, card, quest) {
    const def = questDef(quest.id);
    let v = card.suit === def.suit ? 2 : 1;
    if (has(s, idx, 'berserker') && card.suit === 'blade') v += 1;
    return v;
  }

  function contributeValue(s, idx, cardIds) {
    const p = s.party[idx];
    const quest = s.quests[p.loc];
    if (!quest) return 0;
    let total = 0;
    cardIds.forEach(id => {
      const c = p.hand.find(x => x.id === id);
      if (c) total += cardValue(s, idx, c, quest);
    });
    if (total > 0 && has(s, idx, 'veyra')) total += 1;
    return total;
  }

  function contribute(s, cardIds) {
    const bad = canAct(s); if (bad) return bad;
    const idx = s.active, p = s.party[idx];
    const quest = p.loc >= 0 ? s.quests[p.loc] : null;
    if (!quest) return fail('Move to a quest first.');
    const ids = Array.from(new Set(cardIds || []));
    if (ids.length === 0) return fail('Select 1 to 3 cards to play.');
    if (ids.length > MAX_CONTRIBUTE) return fail(`Play at most ${MAX_CONTRIBUTE} cards.`);
    if (!ids.every(id => p.hand.some(c => c.id === id))) return fail('Those cards are not in your hand.');

    const gain = contributeValue(s, idx, ids);
    const powers = suitPowers(s, idx, ids);          // read before the cards leave the hand
    ids.forEach(id => {
      const k = p.hand.findIndex(c => c.id === id);
      s.whiteDiscard.push(p.hand.splice(k, 1)[0]);
    });
    quest.progress += gain;
    if (s.stats) s.stats.progress[idx] += gain;
    const swift = powers.includes('boot') && !s.swiftUsed;      // Swift can save one action per turn
    if (swift) s.swiftUsed = true; else spend(s, 1);
    if (powers.includes('boot') && !swift) powers.splice(powers.indexOf('boot'), 1);
    const def = questDef(quest.id);
    say(s, `${defenderDef(p.id).name} advances ${def.name}: +${gain} (${Math.min(quest.progress, quest.needed)}/${quest.needed}).`, 'win');
    if (quest.mod === 'blessed' && powers.length) { quest.progress += powers.length; if (s.stats) s.stats.progress[idx] += powers.length; say(s, 'Blessed: +' + powers.length + ' progress for the pair.', 'win'); }
    powers.forEach(su => {
      if (s.stats) s.stats.powers = (s.stats.powers || 0) + 1;
      const pw = POWERS[su];
      if (su === 'blade') { if (s.siege > 0) addSiege(s, -1); say(s, `Blade pair, ${pw.name}: the siege falls back.`, 'win'); }
      else if (su === 'shield') { s.ward = Math.min(WARD_MAX, (s.ward || 0) + 1); say(s, `Shield pair, ${pw.name}: a ward is raised (${s.ward}).`, 'win'); }
      else if (su === 'scroll') { quest.timer += 1; say(s, `Scroll pair, ${pw.name}: ${def.name} gains a round.`, 'win'); }
      else if (su === 'boot') { say(s, `Boot pair, ${pw.name}: no action spent.`, 'win'); }
    });

    if (quest.progress >= quest.needed) {
      const slot = p.loc;
      if (s.stats) s.stats.done++;
      say(s, `${def.name} is complete! A white sword is seated and the siege falls back.`, 'win');
      if (s.siege > 0) addSiege(s, -1);
      s.party.forEach(q => { if (q.loc === slot) q.loc = CITADEL; });
      s.quests[slot] = null;
      dealQuest(s, slot);
      livingIdx(s).forEach(i => drawCards(s, i, quest.mod === 'rich' ? 2 : 1));
      s.party.forEach((_, i) => discardToLimit(s, i));
      addSword(s, 'white');
    }
    return { ok: true, gain };
  }

  function drawAction(s) {
    const bad = canAct(s); if (bad) return bad;
    const n = has(s, s.active, 'harren') ? 3 : 2;
    const got = drawCards(s, s.active, n);
    spend(s, 1);
    say(s, `${defenderDef(s.party[s.active].id).name} gathers supplies (+${got} cards).`);
    discardToLimit(s, s.active);
    return { ok: true };
  }

  function rest(s) {
    const bad = canAct(s); if (bad) return bad;
    const p = s.party[s.active];
    if (p.loc !== CITADEL) return fail('Rest only at the Citadel.');
    let healed = 0;
    s.party.forEach((q, i) => {
      if (q.alive && !q.exiled && q.loc === CITADEL && q.hp < q.maxHp) { q.hp++; healed++; }
    });
    if (!healed) return fail('No one at the Citadel needs rest.');
    spend(s, 1);
    say(s, `Rest at the Citadel: ${healed} defender${healed > 1 ? 's' : ''} recover 1 health.`, 'win');
    return { ok: true };
  }

  function accuse(s, target) {
    const bad = canAct(s); if (bad) return bad;
    if (s.rumors.length === 0) return fail('No evidence yet. Wait for a sabotage.');
    if (s.traitorRevealed) return fail('The Traitor is already unmasked.');
    const t = s.party[target];
    if (!t || !t.alive || t.exiled) return fail('Choose a living defender.');
    if (target === s.active) return fail('You cannot accuse yourself.');
    spend(s, 1);
    const nm = defenderDef(t.id).name;
    if (target === s.traitor) {
      t.exiled = true;
      s.traitorRevealed = true;
      say(s, `${nm} is the Traitor! Cast out of the Citadel. A white sword is seated.`, 'win');
      addSword(s, 'white');
    } else {
      t.stunned = true;
      say(s, `${nm} is innocent! Shaken by the accusation, they lose their next turn. A black sword is seated.`, 'lose');
      addSword(s, 'black');
    }
    return { ok: true, correct: target === s.traitor };
  }

  // Online play with a human Traitor: they choose when to strike. Costs 1 action; nothing in the
  // public log says who did it, only the usual rumor of who was nearby.
  function sabotageAction(s) {
    const bad = canAct(s); if (bad) return bad;
    if (s.active !== s.traitor || s.traitorRevealed) return fail('Only the hidden Traitor can do that.');
    spend(s, 1);
    sabotage(s);
    checkEnd(s);
    return { ok: true };
  }

  // What one player is allowed to see: decks collapse to counts, the Traitor's identity stays
  // hidden from everyone else until it is revealed, and the seed stays secret until the game ends.
  function redact(s, viewer) {
    const v = clone(s);
    const mage = anyHas(s, 'mage');
    const n = s.shadowDeck.length;
    v.shadowDeck = s.shadowDeck.map((c, i) => (i === n - 1 && mage) ? c : '?');
    v.shadowDiscard = [];
    v.whiteDeck = s.whiteDeck.map(() => 0);
    v.whiteDiscard = [];
    v.rng = 0;
    if (!s.over) v.seed = 0;
    if (!s.over && !s.traitorRevealed && viewer !== s.traitor) v.traitor = -1;
    v.viewer = viewer;
    return v;
  }

  // Hand a card to another defender standing in the same place. Costs 1 action.
  function give(s, cardId, target) {
    const bad = canAct(s); if (bad) return bad;
    const from = s.party[s.active], to = s.party[target];
    if (!to || !to.alive || to.exiled) return fail('Choose a living defender.');
    if (target === s.active) return fail('You cannot give a card to yourself.');
    if (to.loc !== from.loc) return fail('They must be in the same place.');
    if (to.hand.length >= HAND_LIMIT) return fail('Their hand is full.');
    const k = from.hand.findIndex(c => c.id === cardId);
    if (k < 0) return fail('That card is not in your hand.');
    to.hand.push(from.hand.splice(k, 1)[0]);
    spend(s, 1);
    say(s, `${defenderDef(from.id).name} passes a card to ${defenderDef(to.id).name}.`);
    return { ok: true };
  }

  // Which cards best advance the quest the active defender stands at (up to 3).
  function bestPlay(s, idx, smart) {
    const p = s.party[idx], q = p.loc >= 0 ? s.quests[p.loc] : null;
    if (!q) return null;
    if (smart) {                       // try every 1 to 3 card play and value the suit powers too
      const hand = p.hand, n = hand.length; let best = null;
      const worth = su => su === 'blade' ? (s.siege >= 4 ? 2.2 : 1) : su === 'shield' ? 1.2 : su === 'scroll' ? (q.timer <= 3 ? 2.5 : 0.6) : 1.6;
      const tryIds = ids => {
        const gain = contributeValue(s, idx, ids);
        const score = Math.min(gain, q.needed - q.progress + 1) + suitPowers(s, idx, ids).reduce((a, su) => a + worth(su), 0) - ids.length * 0.15;
        if (!best || score > best.score) best = { ids, gain, quest: q, score };
      };
      for (let a = 0; a < n; a++) {
        tryIds([hand[a].id]);
        for (let b = a + 1; b < n; b++) {
          tryIds([hand[a].id, hand[b].id]);
          for (let c = b + 1; c < n; c++) tryIds([hand[a].id, hand[b].id, hand[c].id]);
        }
      }
      return best;
    }
    const ranked = p.hand.map(c => ({ id: c.id, v: cardValue(s, idx, c, q) })).sort((a, b) => b.v - a.v).slice(0, MAX_CONTRIBUTE);
    if (!ranked.length) return null;
    const ids = ranked.map(r => r.id);
    return { ids, gain: contributeValue(s, idx, ids), quest: q };
  }

  // A recommended next step for the active defender. Used by the Hint button and handy for tests.
  function suggest(s, opts) {
    if (s.over) return null;
    const idx = s.active, p = s.party[idx];
    if (s.actionsLeft <= 0) return { type: 'end', text: 'No actions left. End your turn.' };

    if (s.rumors.length >= 2 && !s.traitorRevealed) {
      const sus = suspicion(s);
      const top = s.party.map((_, i) => i).filter(i => sus[i] === s.rumors.length && i !== idx && s.party[i].alive && !s.party[i].exiled);
      if (top.length === 1) return { type: 'accuse', target: top[0], text: `${defenderDef(s.party[top[0]].id).name} is named in every rumor. Accuse them.` };
    }
    const hurt = s.party.some(q => q.alive && !q.exiled && q.loc === CITADEL && q.hp < q.maxHp);
    if (p.loc === CITADEL && hurt && p.hp <= 1) return { type: 'rest', text: 'You are nearly down. Rest at the Citadel.' };

    const here = bestPlay(s, idx, !!(opts && opts.smart));
    if (here) {
      const def = questDef(here.quest.id);
      const pw = suitPowers(s, idx, here.ids).map(su => POWERS[su].name);
      return { type: 'play', cards: here.ids, text: (pw.length ? 'A pair triggers ' + pw.join(' and ') + '. ' : '') + `Play ${here.ids.length} card${here.ids.length > 1 ? 's' : ''} on ${def.name} for +${here.gain}.` };
    }
    if (p.hand.length >= 2) {
      let pick = null;
      s.quests.forEach((q, slot) => {
        if (!q || slot === p.loc) return;
        const ranked = p.hand.map(c => cardValue(s, idx, c, q)).sort((a, b) => b - a).slice(0, MAX_CONTRIBUTE);
        const gain = ranked.reduce((n, v) => n + v, 0);
        const left = Math.max(1, q.needed - q.progress);
        const score = (Math.min(gain, left) / left) * 3 - q.timer * 0.2;
        if (!pick || score > pick.score) pick = { slot, score, q };
      });
      if (pick) return { type: 'move', dest: pick.slot, text: `Head to ${questDef(pick.q.id).name}: your hand suits it best.` };
    }
    return { type: 'draw', text: 'Your hand is thin. Gather supplies.' };
  }

  // Suspicion tally for the UI: how many rumors name each defender.
  function suspicion(s) {
    const out = s.party.map(() => 0);
    s.rumors.forEach(r => r.forEach(i => { out[i]++; }));
    return out;
  }

  const api = {
    SUITS, SUIT_LABEL, MODS, POWERS, WARD_MAX, suitPowers, SEATS, WIN_WHITE, LOSE_BLACK, SIEGE_MAX, HAND_LIMIT, SLOTS, CITADEL, MAX_CONTRIBUTE,
    DEFENDERS, QUEST_DEFS, DIFFICULTY,
    createGame, move, contribute, contributeValue, drawAction, rest, accuse, give, endTurn, sabotageAction,
    suggest, redact, suspicion, nextShadowPeek, questDef, defenderDef, count, livingIdx, locName, clone
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Citadel = api;
})(typeof window !== 'undefined' ? window : globalThis);
