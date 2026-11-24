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
    move: 1, contribute: 1, drawAction: 0, rest: 0, accuse: 1, give: 2, endTurn: 0, sabotageAction: 1, discard: 1,
    sortie: 1, tend: 2, pressOn: 0
  };
  // Actions whose effect only the actor may see: everyone else gets no message at all, so not even the
  // arrival of a state update hints that something happened.
  const PRIVATE = { sabotageAction: true };
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
    if (name === 'contribute' || name === 'sortie') return Array.isArray(args[0]) && args[0].length <= C.MAX_CONTRIBUTE && args[0].every(Number.isInteger);
    if (name === 'tend') return Array.isArray(args[0]) && args[0].length === 2 && args[0].every(Number.isInteger) && Number.isInteger(args[1]);
    if (name === 'discard') return Array.isArray(args[0]) && args[0].length <= 48 && args[0].every(Number.isInteger);
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
    // The seat the next friend should take. Mid-game, a seat whose player left comes first.
    openSeat() {
      if (this.game) { const d = this.seats.findIndex(s => s.kind === 'bot' && s.dropped); if (d >= 0) return d; }
      return this.seats.findIndex(s => s.kind === 'bot');
    }
    // Seats a friend could (re)join mid-game: everything a bot is playing.
    botSeats() { return this.seats.map((s, seat) => ({ seat, name: s.name, dropped: !!s.dropped, kind: s.kind })).filter(x => x.kind === 'bot'); }

    // Start a handshake with one friend. Returns the invite code to send them.
    // Mid-game this is also how a friend rejoins (or a new friend takes over a bot): pass { seat } to pick the seat.
    async invite(opts) {
      let seat = opts && Number.isInteger(opts.seat) && this.seats[opts.seat] && this.seats[opts.seat].kind === 'bot' ? opts.seat : this.openSeat();
      if (seat < 0) throw new Error('Every seat is taken.');
      const peer = new N.Peer({ lanOnly: this.lanOnly });
      const prev = this.game ? this.seats[seat] : null;           // a running game keeps the bot playing until the friend is in
      this.seats[seat] = { kind: 'pending', name: prev ? prev.name : 'Waiting...', peer, prev };
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
        this.seats[seat] = s.prev || { kind: 'bot', name: 'Bot ' + seat, peer: null };
        this.ev.emit('lobby', this.lobby());
      }
    }

    _joined(seat, peer) {
      const s = this.seats[seat];
      if (!s || s.peer !== peer) return;
      const g = this.game;
      s.kind = 'human'; s.joined = true;
      s.name = s.prev && s.prev.name ? s.prev.name.replace(/ \(bot\)$/, '') : 'Player ' + (seat + 1);
      s.prev = null; delete s.dropped;
      this.ev.emit('lobby', this.lobby());
      if (g && seat === g.traitor) g.traitorHuman = true;      // a person took over the Traitor's seat: they choose when to strike
      if (g) {                                   // joining a running game: give them the game, then everyone the new names
        s.peer.send({ t: 'start', you: seat, names: this.names(), view: C.redact(g, seat) });
        this.ev.emit('rejoined', seat, s.name);
        this.broadcast();
      } else this._sendLobby();
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
      this.seats[seat] = was === 'pending' && s.prev ? s.prev
        : { kind: 'bot', name: (was === 'human' ? s.name + ' (bot)' : 'Bot ' + seat), peer: null, dropped: was === 'human' };
      if (was === 'human') {
        if (this.game && seat === this.game.traitor) this.game.traitorHuman = false;   // the bot now plays the Traitor's part
        this.ev.emit('left', seat, s.name);
        if (this.game) { this.broadcast(); this.runBots(); } else this._sendLobby();
      }
      this.ev.emit('lobby', this.lobby());
    }

    _message(seat, m) {
      if (m.t === 'hello') {
        const st = this.seats[seat];
        if (!st || st.named) return;                // one name per connection: no renaming (or broadcast spam) mid-game
        st.named = true;
        st.name = cleanName(m.name, 'Player ' + (seat + 1));
        this.ev.emit('lobby', this.lobby());
        if (this.game) this.broadcast(); else this._sendLobby();
      } else if (m.t === 'act') {
        const r = this._apply(seat, m.name, m.args);
        const s = this.seats[seat];
        if (s && s.peer) s.peer.send({ t: 'result', ok: !!r.ok, msg: r.msg || '', name: String(m.name || '') });
      }
    }

    // Carry on a hosted game after the host's page was closed or reloaded. Every friend comes back through
    // Invite / rejoin; until then a bot plays their seat (and, if it was the Traitor's seat, the Traitor's part).
    resume(game, saved) {
      if (this.game) return this.game;
      saved = saved || [];
      this.game = game;
      for (let i = 1; i < this.size; i++) {
        const was = saved[i] || {};
        const human = was.kind === 'human';
        const nm = String(was.name || ('Bot ' + i)).replace(/ \(bot\)$/, '');
        this.seats[i] = { kind: 'bot', name: human ? cleanName(nm, 'Player ' + (i + 1)) + ' (bot)' : 'Bot ' + i, peer: null, dropped: human };
      }
      game.traitorHuman = game.traitor === 0;
      this.ev.emit('start', game);
      this.ev.emit('state', game);
      this.runBots();
      return game;
    }
    // What a host needs to save so the game can be resumed later.
    snapshot() {
      return this.game ? { v: 1, size: this.size, difficulty: this.difficulty, lanOnly: this.lanOnly, game: this.game,
        seats: this.seats.map(s => ({ kind: s.kind === 'pending' ? (s.prev && s.prev.dropped ? 'human' : 'bot') : (s.dropped ? 'human' : s.kind), name: s.name })) } : null;
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
      if (r && r.ok) {
        if (PRIVATE[name]) this._sendTo(seat);
        else this.broadcast();
      }
      return r || { ok: false, msg: 'That did not work.' };
    }

    // Send one player their view without telling anyone else that anything changed.
    _sendTo(seat) {
      const g = this.game, s = this.seats[seat];
      if (!g) return;
      if (seat === 0) this.ev.emit('state', g);
      else if (s && s.kind === 'human' && s.peer) s.peer.send({ t: 'state', names: this.names(), view: C.redact(g, seat) });
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

    _botTurn() { const k = this.seats[this.game.active].kind; return k === 'bot' || k === 'pending'; }   // an invite still being answered is played by the bot

    runBots() {
      clearTimeout(this.botTimer);
      const g = this.game;
      if (!g || g.over) return;
      if (!this._botTurn()) return;
      this.botTimer = setTimeout(() => this._botStep(), this.botDelay);
    }
    _botStep() {
      const g = this.game;
      if (!g || g.over || !this._botTurn()) return;
      const h = C.suggest(g, { smart: true });
      let r = { ok: false };
      if (h) {
        if (h.type === 'play') r = C.contribute(g, h.cards);
        else if (h.type === 'move') r = C.move(g, h.dest);
        else if (h.type === 'draw') r = C.drawAction(g);
        else if (h.type === 'rest') r = C.rest(g);
        else if (h.type === 'accuse') r = C.accuse(g, h.target);
        else if (h.type === 'tend') r = C.tend(g, h.cards, h.target);
        else if (h.type === 'sortie') r = C.sortie(g, h.cards);
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
