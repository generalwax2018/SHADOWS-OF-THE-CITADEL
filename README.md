# Shadows of the Citadel

An original cooperative board game of siege and betrayal, playable in any browser. The Citadel is
surrounded, quests are racing their deadlines, and one of your defenders is secretly working for the enemy.

All art and rules are original.

## Run the game

There is nothing to install or build: no Node, no package manager, no server, no internet connection needed.

### 1. Get the files
Either download the ZIP (**Code > Download ZIP** on GitHub, then extract it) or clone it:

```bash
git clone https://github.com/generalwax2018/SHADOWS-OF-THE-CITADEL.git
```

Keep the folder structure as it is: `index.html` loads `css/`, `js/` and `assets/` from beside it.

### 2. Open it
Double-click **`index.html`**. It opens in your default browser and works straight from the file system.

| Browser | Version |
|---|---|
| Chrome, Edge, Brave | any recent version |
| Firefox | 113 or newer |
| Safari | 16.4 or newer |

Older browsers can still play offline, but online play and some animations need these versions.

When the page opens, choose how many defenders (3 to 7) and a difficulty, then press **Begin**. Press **Rules** at any
time for a summary. Turn the **Sound** button on or off in the top bar; browsers only allow audio after your first click.

### 3. Play with friends online (optional)
Click **Play online** on the start screen and follow [Online play](#online-play) below. You need nothing extra, but
every player needs the page open in their own browser. Everyone can use their own copy of `index.html`, or you can all
open the same web address if you host it (next section).

### Host it on the web (optional)
The game is plain static files, so any static host works. With **GitHub Pages**:

1. Push the repository to GitHub.
2. Open **Settings > Pages**.
3. Under **Build and deployment**, choose **Deploy from a branch**, pick `main` and the `/ (root)` folder, and save.
4. After a minute the game is live at `https://generalwax2018.github.io/SHADOWS-OF-THE-CITADEL/`.

To serve it locally instead (some browsers are stricter about local files), run this in the project folder and open
`http://localhost:8000`:

```bash
python -m http.server 8000
```

### Troubleshooting
| Problem | Fix |
|---|---|
| The board is blank or portraits are missing | The `assets/` folder is not beside `index.html`. Re-extract the whole ZIP and keep the folders together. |
| No sound | Click anywhere on the page first (browsers block audio until you interact), and check the **Sound** button says "on". |
| Animations look reduced | Your system has "reduce motion" turned on. The game respects it. |
| "Copy" buttons do nothing | Select the code in the box and copy it by hand (Ctrl+C or Cmd+C). Some browsers block clipboard access on local files. |
| Online invite will not connect | Make sure both codes were copied in full. On the same Wi-Fi, tick **Same network only** on both sides. Strict firewalls can block peer-to-peer play. |
| Saved game or record is gone | They are stored in your browser. Clearing site data, or a private window, removes them. |

## Try it without downloading
A hosted copy of the single-player game may be available from the project owner as a shared link. It does not
include online play.

## How to play

Seat **7 white swords** on the Round Wheel before the shadows win.

You lose if any of these happen:
- **6 black swords** are seated (seven white can no longer be reached)
- **12 siege engines** surround the Citadel
- every defender falls

### A turn
1. **Shadow.** A Shadow card is drawn and resolved first: siege engines, an arrow, a whisper that steals a card, the Gate opening, dread that shortens every quest deadline, or treachery from within.
2. **Heroic.** The active defender takes **2 actions** (3 for the Cavalry Captain):
   - **Move** to a quest or back to the Citadel
   - **Play cards** on a quest (up to 3). A card matching the quest's favoured suit is worth 2, any other card 1
   - **Gather supplies**: draw 2 cards (hand limit 7)
   - **Rest** at the Citadel: everyone there heals 1
   - **Give a card** to a defender standing in the same place
   - **Accuse** a defender (needs at least one sabotage rumor)

   **Hint** suggests a sensible next step at any time.
3. **End turn.** Play passes to the next defender. After the last one, a new round starts and every quest deadline drops by 1.

### Missions
Seven missions are on the board at a time, drawn from twelve, and each has its own card in the **Missions** strip under
the board. A card shows its illustration, its favoured suit, the rounds left, the progress made and which defenders are
standing there. Select a card to open it full size, or to move there.

- Four missions use the painted cards. The other eight have generated illustrations that move: beacon fires flicker,
  the sea rolls under a storm, the forge throws sparks, fog drifts through the pines, banners sway.
- **Replace the generated art with paintings:** drop an image at `assets/art/<id>.jpg` (illustration only, the game adds
  the frame and text) or `assets/card/<id>.jpg` (a complete card) and it is used automatically. See
  [docs/MISSION_ART.md](docs/MISSION_ART.md) for the file names and ready-made prompts.
- Cards animate as the game changes: a **+N** floats up when you make progress, a card pulses red when it has two
  rounds or fewer left, it is stamped **COMPLETE** and flips away when finished, and it is stamped **FAILED**, greys out
  and drops when its deadline passes. A new mission then flips into the empty place.
- On a phone the strip becomes a swipeable row.

Each mission costs progress and has a deadline in rounds.
- **Complete** it: a white sword is seated, the siege falls back by 1, and every defender draws a card.
- **Miss the deadline**: a black sword is seated.

### The Traitor
One defender secretly serves the enemy. They sabotage quests and open the gates, and every sabotage produces a **rumor**:
a short list of defenders seen nearby. **The Traitor is always on the list.** Compare rumors to narrow the field, then accuse.
- **Right:** the Traitor is exiled, a white sword is seated, and the sabotage stops.
- **Wrong:** the accused loses their next turn and a black sword is seated.

### Defenders
| Defender | Ability |
|---|---|
| Captain Veyra | +1 progress whenever she plays cards on a quest |
| Lord Harren | draws 3 cards when gathering supplies |
| Scout Elira | moving costs no action |
| The Berserker | Blade cards add +1 progress each |
| Mage-Knight | glimpses the next Shadow card |
| Cavalry Captain | takes 3 actions each turn |
| Shield-Bearer | 4 health instead of 3 |

Choose 3 to 7 defenders and Easy, Normal or Hard when starting. Quest costs scale with party size, so every size
plays at a similar difficulty. Your game autosaves in the browser, and your win/loss record is kept per difficulty.

### Keys
`1`-`7` select a card, `P` or `Enter` play, `G` gather, `R` rest, `H` hint, `E` end turn.

### Sound and motion
All sound is synthesized in the browser (bells, thuds, a Shadow swell, thunder, a wind bed that follows the weather),
so there are no audio files to license. Use the **Sound** button to mute. Animations (token travel, swords seating
on the wheel, siege engines igniting, the Shadow card reveal, wound flashes, screen shake) are driven by what changed
in the game state, so they look the same offline and online. Both respect the system "reduce motion" setting.

### Online play
Up to 7 people can play, each controlling one defender. Empty seats are played by bots, and a player who disconnects
is replaced by a bot.

1. **Host:** Play online, Host a game, Create lobby, Invite a friend. Send the invite code to your friend.
2. **Friend:** Play online, Join, paste the code, Create reply code, send the reply code back.
3. **Host:** paste the reply code, Connect. Repeat for each friend, then Start game.

There is no game server: the codes carry a WebRTC handshake and the game then runs directly between the browsers.
The host's browser runs the rules and checks every move, and each player is sent only their own view, so the Traitor's
identity and the decks are never sent to anyone else. If the Traitor is a person, they get a **Sabotage** action and
choose when to strike; if it is a bot, it sabotages on its own.

Things to know:
- **Privacy:** players' browsers can see each other's IP address (that is how peer-to-peer works). Unless you tick
  **Same network only**, the handshake also asks a public STUN server (`stun.l.google.com`) for your public address.
- Some strict networks (corporate firewalls, some mobile carriers) block peer-to-peer connections; there is no relay server.
- The host must stay in the game. If the host leaves, the game ends for everyone. There is no reconnecting after a drop.
- Hands are visible to all players (the active defender's hand is always shown).

### Seeds and challenge links
Every game has a seed. Enter one on the setup screen, or share a link like `index.html#seed=42&size=4&diff=hard`
(the end screen has a **Copy challenge link** button). The same seed deals the same game, so friends can compare runs.

## Project layout

| Path | What it is |
|---|---|
| `index.html`, `css/style.css` | the page and its styling |
| `js/engine.js` | all the rules: pure logic, no DOM, seedable and saveable |
| `js/ui.js` | renders engine state onto the painted board, sound/animation effects, lobby screens |
| `js/missions.js` | mission card art: the paintings, plus generated animated SVG scenes for the rest |
| `js/sound.js` | synthesized sound effects and ambience (Web Audio, no audio files) |
| `js/net.js` | WebRTC transport and compact invite/reply codes |
| `js/online.js` | host (authoritative, runs bots) and guest sessions, no DOM |
| `assets/` | board, quest cards, card back and defender portraits; `art/` and `card/` hold optional mission paintings |
| `docs/MISSION_ART.md` | how to render and add paintings for the generated missions, with prompts |
| `tests.html` | engine unit tests plus a bot balance simulation |
| `tests-online.html` | host/guest protocol tests over a real WebRTC loopback connection |
| `js/selftest.js` | UI smoke test, loaded only with `#selftest` in the URL |
| `tools/` | test runners and the one-off asset extraction script |
| `legacy/` | the three earlier prototype versions, kept for reference |

Add `#seed=42` to the URL to start a reproducible game (useful for bug reports).

## Tests

Both suites run headless in Edge or Chrome, with no Node or server:

```powershell
powershell -ExecutionPolicy Bypass -File tools\run-tests.ps1            # rules + balance simulation
powershell -ExecutionPolicy Bypass -File tools\run-ui-test.ps1          # clicks through the real UI
powershell -ExecutionPolicy Bypass -File tools\run-online-test.ps1      # host/guest protocol over real WebRTC
powershell -ExecutionPolicy Bypass -File tools\run-online-ui-test.ps1   # two real tabs: lobby, codes, play to the end
powershell -ExecutionPolicy Bypass -File tools\run-online-ui-test.ps1 -GuestTraitor   # same, with a human Traitor
```

`tests.html` also opens in a normal browser. The online tests drive Edge or Chrome over the DevTools protocol because
WebRTC needs real clocks.

The balance simulation plays seeded games with a simple greedy bot, per difficulty and party size. Win rates:

| Defenders | Easy | Normal | Hard |
|---|---|---|---|
| 3 | 81% | 27% | 11% |
| 4 | 81% | 33% | 16% |
| 5 | 88% | 43% | 26% |
| 6 | 94% | 49% | 16% |
| 7 | 94% | 40% | 20% |

The bot is a simple greedy player: it never passes cards and only accuses when one defender is named in every
rumor. A thoughtful human should do better. Tune `DIFFICULTY` and `SIZE_NEED` in `js/engine.js` and rerun `tools\run-tests.ps1`.
