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

  // Each defender has a passive power (always on) and a Feat: a free, once-per-game deed that can turn a bad moment.
  // `feat.target` says what the Feat needs chosen: 'slot' (a mission) or nothing.
  const DEFENDERS = [
    { id: 'veyra',     name: 'Captain Veyra',   hp: 3, img: 'defender-veyra', title: 'Captain of the Watch', role: 'Leader',
      ability: 'Rallying Cry: adds +1 progress whenever she contributes to a quest.',
      feat: { id: 'rally', name: 'Rally the Line', text: 'Every defender still standing heals 1.' },
      bio: 'She has held the gate through three sieges and lost no one she could reach. The garrison follows her voice before her orders.' },
    { id: 'harren',    name: 'Lord Harren',     hp: 3, img: 'defender-harren', title: 'Keeper of the Stores', role: 'Supply',
      ability: 'Quartermaster: draws 3 cards instead of 2.',
      feat: { id: 'requisition', name: 'Open the Vaults', text: 'Every defender still standing draws a card.' },
      bio: 'Old, careful and rich. Every barrel in the Citadel is in his ledger, and he has been saving the last vault for a day like this.' },
    { id: 'elira',     name: 'Scout Elira',     hp: 3, img: 'defender-elira', title: 'Eyes of the Citadel', role: 'Scout',
      ability: 'Pathfinder: moving costs no action.',
      feat: { id: 'scout', name: 'Clear the Road', text: 'The next Shadow card is revealed and sent to the bottom of the deck.' },
      bio: 'Nobody hears her leave and nobody sees her return. She knows the enemy\'s march before their captains do.' },
    { id: 'berserker', name: 'The Berserker',   hp: 3, img: 'defender-berserker', title: 'Wrath of the North', role: 'Fighter',
      ability: 'Fury: Blade cards add +1 progress each.',
      feat: { id: 'warcry', name: 'Blood and Fire', text: 'Two siege engines are torn down. He loses 1 health (not from his last).' },
      bio: 'He came over the mountains alone, asking only for the front of the line. The siege crews have learned his name.' },
    { id: 'mage',      name: 'Mage-Knight',     hp: 3, img: 'defender-mage', title: 'Sworn of the Old Order', role: 'Seer',
      ability: 'Foresight: glimpses the next Shadow card.',
      feat: { id: 'dispel', name: 'Unmake', text: 'The next Shadow card is cancelled: it is drawn and has no effect.' },
      bio: 'Half scholar, half soldier, wholly unsettling. The runes on that armour were not put there by any smith.' },
    { id: 'cavalry',   name: 'Cavalry Captain', hp: 3, img: 'defender-cavalry', title: 'Spur of the Realm', role: 'Rider',
      ability: 'Swift Charge: takes 3 actions each turn.',
      feat: { id: 'relief', name: 'Relief Ride', text: 'Choose a mission: it gains 2 rounds.', target: 'slot' },
      bio: 'Where the riders go, the line holds a little longer. He has never once arrived late, and does not mean to start.' },
    { id: 'shield',    name: 'Shield-Bearer',   hp: 4, img: 'defender-shield', title: 'The Unbroken', role: 'Guardian',
      ability: 'Bulwark: has 4 health instead of 3.',
      feat: { id: 'bulwark', name: 'Wall of Shields', text: 'Raise 2 wards (up to 3 held, one past the usual limit).' },
      bio: 'Patient as stone. Others win the glory; the Shield-Bearer makes sure they live to enjoy it.' }
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
    hard:   { needScale: 3.0, timerBonus: 1, calm: 2, gate: 3, siege2: 4, wound: 5, eclipse: 2 }   // Eclipse only on Hard
  };

  // A round has one turn per defender, so a bigger party does more work (and meets more Shadow
  // cards) before each deadline. These multipliers on needScale keep 3 to 7 defenders comparably difficult.
  // They are fitted per difficulty by bot simulation (tests.html prints the resulting win rates).
  const SIZE_NEED = {
    easy:   { 3: 0.51, 4: 0.49, 5: 0.76, 6: 1.18, 7: 1.54 },    // bot wins about 88%
    normal: { 3: 0.63, 4: 0.77, 5: 1.01, 6: 1.21, 7: 1.37 },    // about 45%
    hard:   { 3: 0.65, 4: 0.86, 5: 1.05, 6: 1.21, 7: 1.37 }     // about 20%
  };

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
                     gate: d.gate, calm: d.calm, hand: 3, omen: 2, famine: 2, eclipse: d.eclipse || 0 };
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
      traitor: -1, traitorRevealed: false, rumors: [], sabotages: 0, plot: null,
      lastShadow: null, log: [], trail: [], ward: 0
    };

    // party: chosen defenders keep their seat (opts.picks[i] is seat i's choice, or null); the rest are random.
    // With no picks this is exactly the old random deal, so existing seeds and challenge links still match.
    const pool = shuffle(s, DEFENDERS.map((_, i) => i));
    const chosen = new Array(size).fill(-1);
    (Array.isArray(opts.picks) ? opts.picks : []).slice(0, size).forEach((id, seat) => {
      const k = DEFENDERS.findIndex(d => d.id === id);
      if (k >= 0 && !chosen.includes(k)) chosen[seat] = k;
    });
    const rest = pool.filter(k => !chosen.includes(k));
    for (let i = 0; i < size; i++) if (chosen[i] < 0) chosen[i] = rest.shift();
    chosen.forEach(i => {
      const d = DEFENDERS[i];
      s.party.push({ id: d.id, hp: d.hp, maxHp: d.hp, loc: CITADEL, hand: [],
                     alive: true, exiled: false, stunned: false, featUsed: false });
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
    const sizes = SIZE_NEED[s.difficulty] || {};
    const scale = DIFFICULTY[s.difficulty].needScale * (sizes[s.party.length] || 1);
    const r = rand(s), mod = r < 0.2 ? 'blessed' : r < 0.36 ? 'rich' : null;    // mission modifiers
    // Random rounding keeps the average cost exactly def.needed * scale, so difficulty tuning is smooth
    // instead of jumping a whole point of progress on every mission at once.
    const need = Math.max(3, Math.floor(def.needed * scale + rand(s)));
    s.quests[slot] = { id, progress: 0, needed: need + (mod === 'rich' ? 2 : 0), timer: Math.max(3, def.timer + bonus) };
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
    // The Traitor's last betrayal: a Traitor still hidden when the Citadel is about to hold throws off the mask and
    // breaks one white sword (it turns black). Unmasking them earlier is the only way to be safe from this.
    if (color === 'white' && !s.over && count(s, 'white') >= WIN_WHITE && !s.traitorRevealed) {
      const t = s.party[s.traitor];
      if (t && t.alive && !t.exiled) {
        s.traitorRevealed = true; t.exiled = true; s.plot = null;
        const k = s.seats.lastIndexOf('white');
        if (k >= 0) s.seats[k] = 'black';
        say(s, `Betrayal! At the moment of triumph ${defenderDef(t.id).name} throws off the mask: they were the Traitor, and a white sword turns black.`, 'lose');
      }
    }
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
      s.whiteDiscard.push(...p.hand.splice(0));
      if (idx === s.traitor && !s.traitorRevealed) {
        // The Citadel does not mourn a traitor: no black sword, and their plots die with them.
        s.traitorRevealed = true;
        s.plot = null;
        say(s, `${nm} has fallen! ${nm} was the Traitor, so no black sword is seated.`, 'win');
        checkEnd(s);
      } else {
        say(s, `${nm} has fallen! A black sword is seated.`, 'lose');
        addSword(s, 'black');
      }
    } else {
      say(s, `${nm} is wounded (${p.hp}/${p.maxHp}).`, 'lose');
    }
  }

  // ---------- the traitor ----------
  // How many defenders a rumor names. Always fewer than the living, so a rumor can never name everyone
  // (with 3 defenders a 3-name rumor would carry no information at all).
  function rumorSize(s) {
    const base = s.difficulty === 'hard' ? 2 : 3;
    return Math.max(1, Math.min(base, livingIdx(s).length - 1));
  }

  // A sabotage never strikes where the Traitor stands (that would point straight at them). It hits the
  // chosen mission if it still has progress, otherwise a random mission with progress, otherwise the siege.
  function sabotage(s, target) {
    if (s.traitorRevealed) return;
    const t = s.party[s.traitor];
    if (!t || !t.alive || t.exiled) return;
    s.sabotages++;
    let slot = Number.isInteger(target) && target >= 0 && s.quests[target] && s.quests[target].progress > 0 ? target : -1;
    if (slot < 0 && target !== CITADEL) {
      const worked = s.quests.map((q, i) => (q && q.progress > 0 ? i : -1)).filter(i => i >= 0);
      if (worked.length) slot = worked[randInt(s, worked.length)];
    }
    if (slot >= 0) {
      const q = s.quests[slot], lost = Math.min(2, q.progress);
      q.progress -= lost;
      say(s, `Sabotage at ${questDef(q.id).name}! ${lost} progress is undone.`, 'lose');
    } else {
      addSiege(s, 1);
      say(s, 'Sabotage! Someone opened a postern to the enemy. +1 siege engine.', 'lose');
    }
    // Rumor: the traitor plus decoys. Intersecting rumors exposes them.
    const pool = livingIdx(s).filter(i => i !== s.traitor);
    shuffle(s, pool);
    const suspects = [s.traitor].concat(pool.slice(0, rumorSize(s) - 1));
    shuffle(s, suspects);
    s.rumors.push(suspects);
    say(s, `Witnesses saw: ${suspects.map(i => defenderDef(s.party[i].id).name).join(', ')} nearby.`, '');
  }

  // The Traitor lays a plot that springs at the start of a later turn (1 to N turns away, N = defenders still
  // standing). It is never resolved on the Traitor's own action, so the timing of a sabotage gives nothing away.
  function layPlot(s, target) {
    const n = Math.max(1, livingIdx(s).length);
    s.plot = { at: s.turn + 1 + randInt(s, n), target: Number.isInteger(target) ? target : null };
  }
  function springPlot(s) {
    if (!s.plot || s.over || s.turn < s.plot.at) return;
    const target = s.plot.target;
    s.plot = null;
    sabotage(s, target);
    checkEnd(s);
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
        drawCards(s, s.active, 2);            // the hand limit is checked when this turn ends
        say(s, 'Shadow: a fair omen. ' + defenderDef(s.party[s.active].id).name + ' draws two cards.', 'win'); break;
      case 'eclipse': {                                  // Hard only: the furthest-along mission loses ground
        let best = -1;
        s.quests.forEach((q, i) => { if (q && q.progress > 0 && (best < 0 || q.progress > s.quests[best].progress)) best = i; });
        if (best >= 0) {
          const q = s.quests[best]; const lost = Math.min(2, q.progress); q.progress -= lost;
          say(s, `Shadow: an eclipse. ${questDef(q.id).name} loses ${lost} progress.`, 'lose');
        } else { addSiege(s, 1); say(s, 'Shadow: an eclipse finds no work to undo. +1 siege engine.', 'lose'); }
        break;
      }
      case 'famine':
        s.party.forEach(q => { if (q.alive && !q.exiled && q.hand.length) s.whiteDiscard.push(q.hand.splice(randInt(s, q.hand.length), 1)[0]); });
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
    if (s.dispel) {                                    // the Mage-Knight's Unmake: this card is drawn and does nothing
      s.dispel = false;
      if (s.trail) s.trail.push({ r: s.round, type: 'dispelled' });
      say(s, `Shadow: ${SHADOW_NAME[type] || type}, but the Mage-Knight's working unmakes it. Nothing happens.`, 'win');
      return;
    }
    if (s.trail) s.trail.push({ r: s.round, type });   // public history: the path of destruction
    resolveShadow(s, type);
  }

  const SHADOW_NAME = { siege1: 'Siege Engine', siege2: 'Full Assault', dread: 'Dread', wound: 'Arrow Storm', whisper: 'Whisper',
    gate: 'The Gate Opens', calm: 'Calm', omen: 'Fair Omen', famine: 'Famine', eclipse: 'Eclipse', hand: 'Treachery' };

  // ---------- Feats: each defender's once-per-game deed. Free (no action), on your own turn. ----------
  function feat(s, arg) {
    if (s.over) return fail('The game is over.');
    const idx = s.active, p = s.party[idx], d = defenderDef(p.id), f = d.feat;
    if (!p.alive || p.exiled) return fail('Only a defender still standing can do that.');
    if (p.featUsed) return fail(`${f.name} has already been used this game.`);
    const living = livingIdx(s);
    switch (f.id) {
      case 'rally': {
        const hurt = living.filter(i => s.party[i].hp < s.party[i].maxHp);
        if (!hurt.length) return fail('No one is wounded.');
        hurt.forEach(i => { s.party[i].hp++; });
        say(s, `${d.name}: ${f.name}! ${hurt.length} defender${hurt.length > 1 ? 's' : ''} recover 1 health.`, 'win');
        break;
      }
      case 'requisition':
        living.forEach(i => drawCards(s, i, 1));
        say(s, `${d.name}: ${f.name}! Every defender draws a card.`, 'win');
        break;
      case 'scout': {
        if (!s.shadowDeck.length) return fail('The Shadow deck is empty; it reshuffles next turn.');
        const top = s.shadowDeck.pop();
        s.shadowDeck.unshift(top);
        say(s, `${d.name}: ${f.name}! The coming ${SHADOW_NAME[top] || top} is turned aside to the bottom of the deck.`, 'win');
        break;
      }
      case 'warcry':
        if (s.siege <= 0) return fail('There are no siege engines to tear down.');
        if (p.hp <= 1) return fail('Too weak for that.');
        p.hp--;
        addSiege(s, -2);
        say(s, `${d.name}: ${f.name}! Two siege engines are torn down (${p.hp}/${p.maxHp}).`, 'win');
        break;
      case 'dispel':
        if (s.dispel) return fail('The next Shadow card is already unmade.');
        s.dispel = true;
        say(s, `${d.name}: ${f.name}! The next Shadow card will come to nothing.`, 'win');
        break;
      case 'relief': {
        const q = Number.isInteger(arg) && arg >= 0 && arg < SLOTS ? s.quests[arg] : null;
        if (!q) return fail('Choose a mission.');
        q.timer += 2;
        say(s, `${d.name}: ${f.name}! ${questDef(q.id).name} gains 2 rounds.`, 'win');
        break;
      }
      case 'bulwark':
        if ((s.ward || 0) >= WARD_MAX + 1) return fail('The wards are already at their strongest.');
        s.ward = Math.min(WARD_MAX + 1, (s.ward || 0) + 2);
        say(s, `${d.name}: ${f.name}! Wards raised (${s.ward}).`, 'win');
        break;
      default: return fail('Unknown feat.');
    }
    p.featUsed = true;
    if (s.stats) s.stats.feats = (s.stats.feats || 0) + 1;
    return { ok: true };
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
    s.pressedOn = false;
    const nm = defenderDef(s.party[s.active].id).name;
    say(s, `-- Turn ${s.turn}: ${nm} --`, 'turn');
    drawShadow(s);
    if (s.over) return;
    springPlot(s);                                               // a plot laid earlier may spring now, on anyone's turn
    if (s.over) return;
    if (!s.party[s.active].alive) { endTurn(s, true); return; } // fell to the shadow draw
  }

  function endTurn(s, forced) {
    if (s.over) return { ok: false, msg: 'The game is over.' };
    const prev = s.active;
    if (!forced) discardToLimit(s, prev);   // anything not discarded by choice (see discard) goes oldest first

    // A bot Traitor may quietly lay a plot after their own turn; it springs on a later turn, not now.
    // A human Traitor chooses when to (see sabotageAction).
    if (!forced && !s.traitorHuman && prev === s.traitor && !s.traitorRevealed && s.party[prev].alive && !s.plot && rand(s) < 0.4) {
      layPlot(s, null);
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
      else if (su === 'shield') { s.ward = Math.max(s.ward || 0, Math.min(WARD_MAX, (s.ward || 0) + 1)); /* never lowers a Wall of Shields */ say(s, `Shield pair, ${pw.name}: a ward is raised (${s.ward}).`, 'win'); }
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
      livingIdx(s).forEach(i => drawCards(s, i, quest.mod === 'rich' ? 2 : 1));   // each defender trims to the limit at the end of their own turn
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
    return { ok: true };
  }

  // Choose which cards to let go when over the hand limit. Free, and only down to the limit.
  // Whatever is still over the limit when the turn ends is discarded oldest first.
  function discard(s, cardIds) {
    if (s.over) return fail('The game is over.');
    const p = s.party[s.active];
    const ids = Array.from(new Set(cardIds || []));
    const excess = p.hand.length - HAND_LIMIT;
    if (excess <= 0) return fail(`You are within the hand limit of ${HAND_LIMIT}.`);
    if (ids.length === 0) return fail('Select the cards to discard.');
    if (ids.length > excess) return fail(`Discard only ${excess} card${excess > 1 ? 's' : ''}.`);
    if (!ids.every(id => p.hand.some(c => c.id === id))) return fail('Those cards are not in your hand.');
    ids.forEach(id => { const k = p.hand.findIndex(c => c.id === id); s.whiteDiscard.push(p.hand.splice(k, 1)[0]); });
    say(s, `${defenderDef(p.id).name} discards ${ids.length} card${ids.length > 1 ? 's' : ''} (hand limit ${HAND_LIMIT}).`);
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

  // Sortie: from the Citadel, ride out against one siege engine. Play 1 to 3 cards; Blades count 2, the others 1
  // (the Berserker's Blades 3). Roll an eight-sided die: beat it and the engine burns, otherwise you are wounded.
  const SORTIE_DIE = 8;
  function sortieValue(s, idx, cardIds) {
    const p = s.party[idx];
    return Array.from(new Set(cardIds || [])).reduce((n, id) => {
      const c = p.hand.find(x => x.id === id);
      if (!c) return n;
      return n + (c.suit === 'blade' ? (has(s, idx, 'berserker') ? 3 : 2) : 1);
    }, 0);
  }
  function sortieChance(total) { return Math.max(0, Math.min(SORTIE_DIE, total - 1)) / SORTIE_DIE; }
  function sortie(s, cardIds) {
    const bad = canAct(s); if (bad) return bad;
    const idx = s.active, p = s.party[idx];
    if (p.loc !== CITADEL) return fail('Sorties ride out from the Citadel.');
    if (s.siege <= 0) return fail('There is no siege engine to strike.');
    const ids = Array.from(new Set(cardIds || []));
    if (ids.length === 0) return fail('Select 1 to 3 cards to ride out with.');
    if (ids.length > MAX_CONTRIBUTE) return fail(`Ride out with at most ${MAX_CONTRIBUTE} cards.`);
    if (!ids.every(id => p.hand.some(c => c.id === id))) return fail('Those cards are not in your hand.');
    const total = sortieValue(s, idx, ids);
    ids.forEach(id => { const k = p.hand.findIndex(c => c.id === id); s.whiteDiscard.push(p.hand.splice(k, 1)[0]); });
    spend(s, 1);
    const roll = 1 + randInt(s, SORTIE_DIE);
    const nm = defenderDef(p.id).name;
    if (total > roll) {
      addSiege(s, -1);
      if (s.stats) s.stats.sorties = (s.stats.sorties || 0) + 1;
      say(s, `Sortie! ${nm} rides out (${total} against ${roll}) and a siege engine burns.`, 'win');
    } else {
      say(s, `Sortie! ${nm} rides out (${total} against ${roll}) and is driven back.`, 'lose');
      damage(s, idx, 1);
      if (!p.alive) s.actionsLeft = 0;
    }
    return { ok: true, total, roll, won: total > roll };
  }

  // Tend wounds: discard two cards of one suit to heal 1, yourself or a defender standing with you. Works anywhere.
  function tend(s, cardIds, target) {
    const bad = canAct(s); if (bad) return bad;
    const idx = s.active, p = s.party[idx];
    const ids = Array.from(new Set(cardIds || []));
    if (target === undefined || target === null) target = idx;
    const t = s.party[target];
    if (!t || !t.alive || t.exiled) return fail('Choose a living defender.');
    if (t.loc !== p.loc) return fail('You can only tend someone standing with you.');
    if (t.hp >= t.maxHp) return fail(`${defenderDef(t.id).name} is not wounded.`);
    if (ids.length !== 2) return fail('Select two cards of the same suit.');
    const cards = ids.map(id => p.hand.find(c => c.id === id));
    if (cards.some(c => !c)) return fail('Those cards are not in your hand.');
    if (cards[0].suit !== cards[1].suit) return fail('The two cards must share a suit.');
    ids.forEach(id => { const k = p.hand.findIndex(c => c.id === id); s.whiteDiscard.push(p.hand.splice(k, 1)[0]); });
    spend(s, 1);
    t.hp++;
    say(s, target === idx ? `${defenderDef(p.id).name} binds their wounds (${t.hp}/${t.maxHp}).`
      : `${defenderDef(p.id).name} tends ${defenderDef(t.id).name}'s wounds (${t.hp}/${t.maxHp}).`, 'win');
    return { ok: true };
  }

  // Press on: once per turn, spend 1 health for one more action. Never from your last point of health.
  function pressOn(s) {
    if (s.over) return fail('The game is over.');
    const p = s.party[s.active];
    if (s.pressedOn) return fail('You have already pressed on this turn.');
    if (p.hp <= 1) return fail('Too weak to press on.');
    p.hp--; s.actionsLeft++; s.pressedOn = true;
    say(s, `${defenderDef(p.id).name} presses on through the pain (+1 action, ${p.hp}/${p.maxHp}).`, '');
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
      s.plot = null;                       // an unmasked Traitor's plots come to nothing
      say(s, `${nm} is the Traitor! Cast out of the Citadel. A white sword is seated.`, 'win');
      addSword(s, 'white');
    } else {
      t.stunned = true;
      say(s, `${nm} is innocent! Shaken by the accusation, they lose their next turn. A black sword is seated.`, 'lose');
      addSword(s, 'black');
    }
    return { ok: true, correct: target === s.traitor };
  }

  // Online play with a human Traitor: they choose when and where to strike. Laying a plot costs no action and
  // changes nothing anyone else can see; the plot springs at the start of a later turn (possibly someone else's),
  // so neither the timing nor an action count gives the Traitor away. One plot at a time.
  // target: a quest slot (0..6) to set back, or CITADEL (-1) to let a siege engine in. Omit for "anywhere".
  function sabotageAction(s, target) {
    if (s.over) return fail('The game is over.');
    if (s.active !== s.traitor || s.traitorRevealed) return fail('Only the hidden Traitor can do that.');
    if (s.plot) return fail('A plot is already laid. Wait for it to spring.');
    if (target !== undefined && target !== null && target !== CITADEL && !(Number.isInteger(target) && target >= 0 && target < SLOTS && s.quests[target]))
      return fail('Choose a mission or the gates.');
    layPlot(s, target === undefined ? null : target);
    const turns = s.plot.at - s.turn;
    return { ok: true, msg: `The plot is laid. It springs within the next ${livingIdx(s).length} turns.`, turns };
  }

  // What one player is allowed to see: decks collapse to counts, the Traitor's identity and plots stay
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
    const insider = viewer === s.traitor && !s.traitorRevealed;
    if (!s.over && !s.traitorRevealed && viewer !== s.traitor) v.traitor = -1;
    if (!insider) delete v.plot;
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
    const fs = suggestFeat(s);
    if (fs) return fs;
    const hurt = s.party.some(q => q.alive && !q.exiled && q.loc === CITADEL && q.hp < q.maxHp);
    if (p.loc === CITADEL && hurt && p.hp <= 1) return { type: 'rest', text: 'You are nearly down. Rest at the Citadel.' };
    if (p.hp <= 1 && p.hp < p.maxHp) {                 // away from the Citadel: bind your wounds with a pair
      const bySuit = {};
      p.hand.forEach(c => { (bySuit[c.suit] = bySuit[c.suit] || []).push(c.id); });
      const q = p.loc >= 0 ? s.quests[p.loc] : null, fav = q ? questDef(q.id).suit : null;
      const su = SUITS.filter(x => (bySuit[x] || []).length >= 2).sort((a, b) => (a === fav) - (b === fav))[0];
      if (su) return { type: 'tend', cards: bySuit[su].slice(0, 2), target: idx, text: `You are nearly down. Discard two ${SUIT_LABEL[su]} cards to bind your wounds.` };
    }
    if (p.loc === CITADEL && s.siege >= 7) {           // the walls are about to fall: ride out against an engine
      const ids = p.hand.map(c => ({ id: c.id, v: sortieValue(s, idx, [c.id]) })).sort((a, b) => b.v - a.v).slice(0, MAX_CONTRIBUTE).map(x => x.id);
      const total = sortieValue(s, idx, ids);
      if (ids.length && sortieChance(total) >= 0.5) return { type: 'sortie', cards: ids, text: `The siege is closing in. Ride out with ${ids.length} card${ids.length > 1 ? 's' : ''} (${total} against a d${SORTIE_DIE}, ${Math.round(sortieChance(total) * 100)}% to burn an engine).` };
    }

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

  // When a Feat is clearly worth spending now (used by Hint and the bots). Feats are free, so they come first.
  function suggestFeat(s) {
    const idx = s.active, p = s.party[idx];
    if (!p || p.featUsed || !p.alive || p.exiled) return null;
    const f = defenderDef(p.id).feat, living = livingIdx(s);
    const use = text => ({ type: 'feat', arg: -1, text: `Use your Feat, ${f.name}: ${text}` });
    switch (f.id) {
      case 'rally': { const n = living.filter(i => s.party[i].hp < s.party[i].maxHp).length; return n >= 2 ? use(`${n} defenders are wounded.`) : null; }
      case 'requisition': return living.reduce((n, i) => n + s.party[i].hand.length, 0) <= living.length * 2 ? use('hands are running thin.') : null;
      case 'warcry': return s.siege >= 7 && p.hp >= 2 ? use('the siege is closing in.') : null;
      case 'bulwark': return !s.ward && living.some(i => s.party[i].hp <= 1) ? use('someone is one wound from falling.') : null;
      case 'dispel': case 'scout': return (s.siege >= 9 || count(s, 'black') >= 4) ? use('one more blow could end it.') : null;
      case 'relief': {
        let best = -1;
        s.quests.forEach((q, i) => { if (q && q.timer <= 1 && q.progress >= q.needed / 2 && (best < 0 || q.progress > s.quests[best].progress)) best = i; });
        return best >= 0 ? { type: 'feat', arg: best, text: `Use your Feat, ${f.name}: ${questDef(s.quests[best].id).name} is about to fail.` } : null;
      }
    }
    return null;
  }

  // Suspicion tally for the UI: how many rumors name each defender.
  function suspicion(s) {
    const out = s.party.map(() => 0);
    s.rumors.forEach(r => r.forEach(i => { out[i]++; }));
    return out;
  }

  const api = {
    SUITS, SUIT_LABEL, MODS, POWERS, WARD_MAX, suitPowers, SEATS, WIN_WHITE, LOSE_BLACK, SIEGE_MAX, HAND_LIMIT, SLOTS, CITADEL, MAX_CONTRIBUTE,
    DEFENDERS, QUEST_DEFS, DIFFICULTY, SIZE_NEED,
    createGame, move, contribute, contributeValue, drawAction, rest, accuse, give, endTurn, sabotageAction, discard,
    sortie, sortieValue, sortieChance, SORTIE_DIE, tend, pressOn, feat, SHADOW_NAME,
    suggest, redact, suspicion, nextShadowPeek, questDef, defenderDef, count, livingIdx, locName, clone, rumorSize
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Citadel = api;
})(typeof window !== 'undefined' ? window : globalThis);
