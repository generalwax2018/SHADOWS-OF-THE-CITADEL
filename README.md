# Shadows of the Citadel

An original cooperative board game of siege and betrayal, playable in any browser. The Citadel is
surrounded, quests are racing their deadlines, and one of your defenders is secretly working for the enemy.

The rules, code and layout are original to this project. The artwork was generated with AI image tools; see [License and credits](#license-and-credits).

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
   - **Gather supplies**: draw 2 cards. You may hold more than 7 during your turn; at its end, **Discard** the cards
     you choose (free), or the oldest go
   - **Rest** at the Citadel: everyone there heals 1
   - **Tend wounds** anywhere: discard two cards of one suit to heal 1, yourself or a defender standing with you
   - **Sortie** from the Citadel: ride out with 1 to 3 cards (Blades 2, others 1). Beat an eight-sided die and a
     siege engine burns; fail and you are wounded
   - **Press on** (free, once per turn): lose 1 health for one more action, never from your last point
   - **Give a card** to a defender standing in the same place
   - **Accuse** a defender (needs at least one sabotage rumor)

   **Hint** suggests a sensible next step at any time.
3. **End turn.** Play passes to the next defender. After the last one, a new round starts and every quest deadline drops by 1.

### Suit powers
Cards are more than numbers. Play **two cards of the same suit** in one play and that suit's power fires as well:

| Pair | Power | Effect |
|---|---|---|
| Blade | Charge | The siege falls back one engine |
| Shield | Ward | A ward absorbs the next wound anyone takes (hold up to two) |
| Scroll | Lore | The quest gains one more round |
| Boot | Swift | The play costs no action (once per turn) |

The rail under your hand lights up for pairs you hold and glows for the pair you have selected, and the Play button shows what it will trigger. Hint suggests pair plays.

### Missions
Seven missions are on the board at a time, drawn from twelve, and each has its own card in the **Missions** strip under
the board. A card shows its illustration, its favoured suit, the rounds left, the progress made and which defenders are
standing there. Select a card to open it full size, or to move there.

- Four missions use the painted cards. The other eight have generated illustrations that move: beacon fires flicker,
  the sea rolls under a storm, the forge throws sparks, fog drifts through the pines, banners sway.
- **Replace the generated art with paintings:** drop an image at `assets/art/<id>.webp` or `.jpg` (illustration only, the game adds
  the frame and text; tall 2:3 paintings work best) or `assets/card/<id>.webp` (a complete card) and it is used
  automatically. All eight formerly generated missions now have paintings this way. See
  [docs/MISSION_ART.md](docs/MISSION_ART.md) for the file names, what is still missing and ready-made prompts.
- Cards animate as the game changes: a **+N** floats up when you make progress, a card pulses red when it has two
  rounds or fewer left, it is stamped **COMPLETE** and flips away when finished, and it is stamped **FAILED**, greys out
  and drops when its deadline passes. A new mission then flips into the empty place.
- On a phone the strip becomes a swipeable row.

### Live mission windows and the expedition view
The two panels on the right of the board are **live mission windows**. Each shows one active mission as a moving scene
with its own weather: rain and lightning at sea, snow and embers on the peak, fog and fireflies in the forest, sparks
at the forge, golden motes at the oath. The mission your defender is standing on comes first, then the one you are
inspecting, then the most urgent. The storm on the board (from siege engines) adds rain and lightning to every window.

The scenes change as you make progress, so you can see how a mission is going:

| Mission | What you see as progress grows |
|---|---|
| Scout the Sea | the black sails are spotted one by one |
| Mountain Watch | the signal fire grows and an answering beacon lights on the far ridge |
| Light the Beacons | beacons light one after another along the hills |
| Guard the Archives | the fire dies down and rescued scrolls fill the chest |
| Mend the Gates | the portcullis bars are forged back and the broken slab is replaced |
| Rescue the Scouts | the fog lifts and the riders reach the lights of home |
| Feed the Forge | finished swords fill the rack |
| Renew the Oath | the knights kneel one by one and the light grows |

Click a window (or choose **Mission view** on a card) and it pulls open into a large **expedition view** with the mission's
title, progress, deadline and the defenders on it. It opens by itself when a defender goes on a mission and closes
when they come home. Press **Esc** or **Return to the map** to leave, and tick **Open the mission view automatically** in Settings (off by default) to
turn that off. When a mission ends while you are in it, you see **COMPLETE** or **FAILED** before returning to the map.

Each mission costs progress and has a deadline in rounds.
- **Complete** it: a white sword is seated, the siege falls back by 1, and every defender draws a card.
- **Miss the deadline**: a black sword is seated.

### The Traitor
One defender secretly serves the enemy. They sabotage quests and open the gates, and every sabotage produces a **rumor**:
a short list of defenders seen nearby. **The Traitor is always on the list.** Compare rumors to narrow the field, then accuse.
- **Right:** the Traitor is exiled, a white sword is seated, and the sabotage stops.
- **Wrong:** the accused loses their next turn and a black sword is seated.
- A Traitor who **falls in battle** is unmasked and seats no black sword.
- **Last betrayal:** a Traitor still hidden when the 7th white sword is seated throws off the mask and breaks one
  white sword (it turns black), and the game goes on. Finding them before the end really matters.

A sabotage is a **plot** that springs at the start of a later turn (within one trip round the table), often on
someone else's turn, so *when* it happened proves nothing. It strikes a mission with progress (up to 2 progress lost)
or lets a siege engine in, never "where the Traitor stands". The rumors are the evidence. A rumor always names fewer
defenders than are still standing (3 on Easy and Normal, 2 on Hard, fewer in a small party), so even a 3-defender
game can be solved.

### Defenders
Every defender has a **power** that is always on and a **Feat**: a free deed they can use once per game, on their own
turn (the gold **Feat** button). Select any portrait (on the start screen, the active defender, or the Defenders tab)
to open that defender's **character sheet**: a full-size portrait with their title, health, power, Feat and story.

| Defender | Power (always on) | Feat (once per game, free) |
|---|---|---|
| Captain Veyra | +1 progress whenever she plays cards on a quest | **Rally the Line**: every defender still standing heals 1 |
| Lord Harren | draws 3 cards when gathering supplies | **Open the Vaults**: every defender draws a card |
| Scout Elira | moving costs no action | **Clear the Road**: the next Shadow card is revealed and sent to the bottom of the deck |
| The Berserker | Blade cards add +1 progress each | **Blood and Fire**: two siege engines are torn down; he loses 1 health (not his last) |
| Mage-Knight | glimpses the next Shadow card | **Unmake**: the next Shadow card is cancelled |
| Cavalry Captain | takes 3 actions each turn | **Relief Ride**: a mission of your choice gains 2 rounds |
| Shield-Bearer | 4 health instead of 3 | **Wall of Shields**: raise 2 wards (up to 3, one past the usual limit) |

**Choosing defenders.** On the start screen, under *Your defenders*, select a portrait to read the sheet and take that
defender into the company (up to the party size). Anyone you do not choose is dealt at random. Challenge links
remember your choices. A *Your company* screen introduces the party at the start of each game (switch it off there).
Online, each player picks a defender on the Host or Join form; if two ask for the same one, the earlier seat gets it.
Your secret role is shown on your own character sheet.

Choose 3 to 7 defenders and Easy, Normal or Hard when starting. Quest costs are fitted per difficulty and party size
(see [Tests](#tests)), so every size plays at the same difficulty. Your game autosaves in the browser, and your
win/loss record is kept per difficulty.

### Keys
`1`-`9` select a card, `P` or `Enter` play, `G` gather, `R` rest, `H` hint, `U` undo, `E` end turn.

### Card draws and the path of destruction
Cards fly out of their decks: the Shadow card flies from the Shadow deck and flips open, and supplies fly from the Gather button into your hand. Below the board, the **Path of destruction** lists every Shadow card drawn so far (and every lost quest) as a trail of glowing chips that ends at the Citadel, so the whole table can see how the ruin is spreading. Reduced motion turns the flights off.

### The chronicle
Major events appear as a large card in the middle of the board, with an icon, a title and a plain description, then
dismiss themselves after about two seconds: a siege engine rolling up, a black or white sword being seated, progress on a
mission, a mission completed or failed, a defender wounded or fallen, sabotage, and the Traitor being unmasked (or an
innocent wrongly accused). Events that happen together queue up one after another, and the queue stays short so it never
falls behind the game. The cards never block clicks, and the **Chronicle** panel on the right still records everything
for later review.

### Board ambience
The board has living light (js/ambience.js): flickering torchlight on the castle and wheel, drifting fog, gold glints sweeping over the frames, a lantern that follows your cursor, embers rising from the siege engines as they gather, and a red glow at the edges when the Citadel is in danger. It is decoration only, never blocks clicks, and reduced motion keeps the lighting but stops the movement.

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
identity and the decks are never sent to anyone else. If the Traitor is a person, they press **Sabotage** and pick a
target (a mission or the gates). Laying the plot is free, nothing is logged, and no other player's browser receives
any message at all; the plot springs a few turns later. If it is a bot, it plots on its own. If the human Traitor
drops out, the bot that takes their seat carries on plotting.

Things to know:
- **Privacy:** players' browsers can see each other's IP address (that is how peer-to-peer works). Unless you tick
  **Same network only**, the handshake also asks a public STUN server (`stun.l.google.com`) for your public address.
- Some strict networks (corporate firewalls, some mobile carriers) block peer-to-peer connections; there is no relay server.
- If the host closes the page, the game pauses for everyone. The host's browser keeps the running game: on the start
  screen, **Resume hosted game** carries on where it stopped, with bots holding the seats until friends come back
  through **Invite / rejoin**. (The host's browser holds the whole game, Traitor included, so a host who opens the
  browser's developer tools could peek. Play with people you trust, or let someone neutral host.)
- Hands are visible to all players (the active defender's hand is always shown).

### Campaign, achievements and replay
- **Campaign:** five linked chapters of rising difficulty (setup screen). Each chapter you win gives your veterans one more starting ward (up to two). Progress is kept on this device.
- **Achievements:** ten goals such as Untouched (win without a wound), Iron Wall (win on Hard) and Mastermind (win as the online Traitor). See them under **Settings > Achievements**.
- **Replay:** the end screen replays the Shadow trail card by card.
- **Eclipse** is a Hard-only Shadow card: the furthest-along mission loses 2 progress.
- **Colour-blind colours** (Settings) switch suits, danger and roles to a palette that stays distinct for red-green colour blindness.
- Mission cards show their **Blessed** / **Rich** twist, and enlarge when you hover them in the side rail.

### Less scrolling
On a desktop screen the board is sized to fit your window height, so the board and the Shadow trail are visible without scrolling. Defenders, Rumors and the Chronicle share one tabbed panel (a red dot on **Rumors** means a new sabotage rumor), and the missions are listed on the board's centre column (on a board at least 700 pixels wide; on smaller screens the list goes under the board). Click a mission to select it.

### Practice, Undo and more
- **Practice (guided)** on the setup screen starts a short easy 3-defender game with a coach box that says what to do next.
- **Undo** (offline only, key **U**) takes back your last action this turn. It is not available after End turn, for
  accusations, online, or for anything that revealed new cards (gathering, a completed mission), since that would let
  you peek at the deck and choose again.
- **Mission modifiers:** a mission can be **Blessed** (pairs add progress) or **Rich** (needs 2 more, everyone draws 2).
- **Shadow cards** now include Fair Omen (draw 2) and Famine (everyone discards a random card).
- **Feedback** appears in the top bar once a form address is set in `FEEDBACK_URL` (`js/ui.js`); until then it is hidden.

### Daily challenge
The setup screen has a **Daily challenge**: everyone gets the same game each calendar day (5 defenders, Normal), seeded
from the date. Your best attempt per day and your streak are kept on this device, and the end screen has **Copy result**
so you can compare with friends.

### Settings and the guided tour
The gear button opens **Settings**: master volume, sound effects, ambience, motion (follow the system, reduced or
full), automatic expedition view, and text size. Settings are stored in your browser. **Replay guided tour** (in
Settings or Rules) walks through the board in seven steps; it is offered once on your first game.

#### Rejoining and swapping in friends
If a friend's connection drops, a bot plays their seat. The host presses **Invite / rejoin** (top bar), picks that seat, and sends a new invite code. The friend taps **Rejoin** on their Disconnected screen and pastes it; they get their defender, their hand and their secret role back. The same button seats a new friend in place of any bot mid-game. If the *host* closes the page, the game ends for everyone.

### Seeds and challenge links
Every game has a seed. Enter one on the setup screen, or share a link like `index.html#seed=42&size=4&diff=hard`
(the end screen has a **Copy challenge link** button). The same seed deals the same game, so friends can compare runs.

## Project layout

| Path | What it is |
|---|---|
| `index.html`, `css/style.css` | the page and its styling |
| `js/engine.js` | all the rules: pure logic, no DOM, seedable and saveable |
| `js/ui.js` | renders engine state onto the painted board, sound/animation effects, lobby screens |
| `js/missions.js` | mission card art and live scenes: the paintings, plus generated animated SVG scenes driven by progress |
| `js/fx.js` | weather and atmosphere particles (rain, snow, embers, sparks, fog, motes) for the mission windows |
| `js/sound.js` | synthesized sound effects and ambience (Web Audio, no audio files) |
| `js/net.js` | WebRTC transport and compact invite/reply codes |
| `js/online.js` | host (authoritative, runs bots) and guest sessions, no DOM |
| `assets/` | board, quest cards and defender portraits; `art/` and `card/` hold optional mission paintings |
| `docs/MISSION_ART.md` | how to render and add paintings for the generated missions, with prompts |
| `docs/GROK_REQUEST.md` | art status (nothing outstanding) and how to replace a painting safely |
| `assets/cards/` | painted hand cards (`blade`, `shield`, `scroll`, `boot`) and the Shadow card |
| `tests.html` | engine unit tests plus a bot balance simulation |
| `tests-online.html` | host/guest protocol tests over a real WebRTC loopback connection |
| `js/selftest.js` | UI smoke test, loaded only with `#selftest` in the URL |
| `tools/` | the test runners (rules, UI, online) and `optimize-art.ps1`, which shrinks new paintings to WebP |

Add `#seed=42` to the URL to start a reproducible game (useful for bug reports).

## Releasing a change

`index.html` loads the CSS and scripts with `?v=...` (RELEASE VERSION). Change that value whenever you publish, so browsers fetch the new files instead of a cached copy (GitHub Pages lets browsers cache for 10 minutes).

## Tests

All suites run headless in Edge or Chrome, with no Node or server:

```powershell
powershell -ExecutionPolicy Bypass -File tools\run-tests.ps1            # rules + balance simulation
powershell -ExecutionPolicy Bypass -File tools\run-ui-test.ps1          # clicks through the real UI
powershell -ExecutionPolicy Bypass -File tools\run-online-test.ps1      # host/guest protocol over real WebRTC
powershell -ExecutionPolicy Bypass -File tools\run-online-ui-test.ps1   # two real tabs: lobby, codes, play to the end
powershell -ExecutionPolicy Bypass -File tools\run-online-ui-test.ps1 -GuestTraitor   # same, with a human Traitor
```

`tests.html` also opens in a normal browser. The online tests drive Edge or Chrome over the DevTools protocol because
WebRTC needs real clocks.

The balance simulation plays seeded games with a simple greedy bot, per difficulty and party size. Mission costs are
fitted per difficulty and party size (`SIZE_NEED` in `js/engine.js`) so every party size aims at the same win rate:
about 88% on Easy, 45% on Normal and 20% on Hard. Measured over 1,500 games each:

| Defenders | Easy | Normal | Hard |
|---|---|---|---|
| 3 | 87% | 46% | 19% |
| 4 | 90% | 42% | 19% |
| 5 | 87% | 45% | 20% |
| 6 | 88% | 43% | 21% |
| 7 | 88% | 43% | 19% |

(`tests.html` prints a smaller 150-game sample, so expect a few points of noise there.) Mission costs use random
rounding, so the average cost changes smoothly as you tune. The bot is a simple greedy player: it never passes cards
and only accuses when one defender is named in every rumor. A thoughtful human should do better. Tune `DIFFICULTY` and
`SIZE_NEED` in `js/engine.js` and rerun `tools\run-tests.ps1`.

The same suites run on every push through GitHub Actions (.github/workflows/tests.yml). The end screen shows run highlights (most progress, missions completed or failed, wounds, sabotages), and an unexpected script error shows a Reload bar instead of failing silently.

## License and credits

- **Code** (HTML, CSS, JavaScript and the scripts in `tools/`): [MIT License](LICENSE).
- **Artwork** (everything in `assets/`): all rights reserved, **not** under the MIT license, so please do not reuse the
  images elsewhere without permission. It was generated with AI image tools (Grok) from prompts written for this project,
  then resized and compressed here. See [assets/LICENSE.txt](assets/LICENSE.txt), and check the generating service's terms
  and your local rules before selling or commercially publishing the game.
- **Sound** is synthesized in the browser at run time; there are no audio files.
- The game is an original design. It is a co-operative game with a hidden traitor, a family of designs that long predates
  it, but its rules, names, art and text are its own.
