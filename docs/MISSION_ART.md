# Mission art: how to replace the generated cards with paintings

Eight of the twelve missions are drawn in code. Four already have full painted cards
(`pass`, `banner`, `blade`, `walls`). This guide is for rendering the other eight with an image
generator such as Grok, then dropping the files in. No code changes are needed.

## Two ways to supply a painting

| | **A. Art only (recommended)** | **B. Full card** |
|---|---|---|
| File | `assets/art/<id>.jpg` | `assets/card/<id>.jpg` |
| What it is | The illustration only: no text, no frame | A complete card with frame, title and objective painted in, like the four existing cards |
| Shape | Square (1:1), for example 1024x1024 | Portrait 2:3, for example 784x1168 or 1024x1536 |
| What the game adds | The gold frame, title, objective text, deadline, suit and progress bar | Only the deadline, suit and progress chips |
| Risk | None. Text is always spelled correctly | Image generators often misspell title text |

If both files exist for a mission, the full card (B) covers the art-only version (A).
Use JPG, aim for under 400 KB each so the page stays fast, and keep file names in lower case.

If a file is missing, the generated scene is shown instead, so you can add paintings one at a time.

## Mission ids and file names

| Mission | id | Art-only file | Full-card file |
|---|---|---|---|
| Scout the Sea | `sea` | `assets/art/sea.jpg` | `assets/card/sea.jpg` |
| Mountain Watch | `mountains` | `assets/art/mountains.jpg` | `assets/card/mountains.jpg` |
| Light the Beacons | `beacons` | `assets/art/beacons.jpg` | `assets/card/beacons.jpg` |
| Guard the Archives | `archives` | `assets/art/archives.jpg` | `assets/card/archives.jpg` |
| Mend the Gates | `gates` | `assets/art/gates.jpg` | `assets/card/gates.jpg` |
| Rescue the Scouts | `scouts` | `assets/art/scouts.jpg` | `assets/card/scouts.jpg` |
| Feed the Forge | `forge` | `assets/art/forge.jpg` | `assets/card/forge.jpg` |
| Renew the Oath | `oath` | `assets/art/oath.jpg` | `assets/card/oath.jpg` |

## The look to match

The four painted cards share one style. Put this block at the start of every prompt:

> Dark fantasy oil painting, hyper-detailed, cinematic composition, gritty realism, moody and desaturated with
> warm torchlight and ember accents, volumetric fog and smoke, dramatic rim lighting, weathered steel armor,
> deep blue-black cloaks, worn stone and iron. Epic but grim. No text, no letters, no watermark, no border, no frame.

Recurring details from the existing cards, useful to keep the set consistent: the defenders wear dark steel with
deep blue cloaks and a mountain or castle emblem on their shields; the enemy is a faceless mass of shadow soldiers
with red torches; skies are heavy and overcast; the palette is mostly black, slate blue and bronze with orange fire.

## Prompts for art only (option A, square 1:1)

Paste the style block first, then one of these.

**sea** `assets/art/sea.jpg`
> A storm-black sea at night. A fleet of black-sailed warships with tiny lanterns advances on a rocky coast, seen from
> a cliff-top watchtower in the foreground where a lone sentry in a blue cloak holds a spyglass. Towering waves, a
> pale moon breaking through storm clouds, a faint streak of lightning on the horizon.

**mountains** `assets/art/mountains.jpg`
> A snow-capped mountain peak at dusk with a stone signal tower on its summit, a great beacon fire burning there and
> throwing orange light across the snow. A soldier in dark armor kneels in the foreground feeding the flames, smoke
> and sparks rising into a violet sky, jagged peaks fading into haze behind.

**beacons** `assets/art/beacons.jpg`
> A chain of beacon fires burning on hilltops stretching into the distance under a starry night sky, each one smaller
> and hazier than the last. In the foreground a ruined watchtower with a defender in a blue cloak lighting the nearest
> beacon, a river catching the firelight, a cold moon above.

**archives** `assets/art/archives.jpg`
> The great library of a besieged citadel on fire. Towering shelves of books and scrolls, a tall arched window
> showing a night sky, flames creeping along the floor. Scholars and soldiers in dark cloaks carry armfuls of scrolls
> to safety, burning pages and embers drifting upward, shafts of cold light cutting through the smoke.

**gates** `assets/art/gates.jpg`
> The shattered main gate of a stone fortress at night in the rain, the iron portcullis bent and broken. Masons and
> blacksmiths in dark leather work by torchlight, one swinging a heavy hammer with a shower of sparks, soldiers in
> blue-black cloaks holding the line behind them, wet stone glistening, shadow forces gathering in the distance.

**scouts** `assets/art/scouts.jpg`
> Three mounted scouts lost in a dense pine forest thick with cold fog at night, one riding ahead holding a single
> lantern whose warm glow is the only color in the scene. Shafts of pale moonlight through the trees, faint
> firefly-like embers, a narrow track vanishing into mist, a sense of being watched.

**forge** `assets/art/forge.jpg`
> The citadel armoury forge at night. A massive stone furnace blazing orange, a broad-shouldered smith in a leather
> apron hammering a glowing blade on an anvil, a shower of sparks, racks of swords and shields in the shadows, heat
> shimmer in the air, soot and ash, the only light coming from the fire.

**oath** `assets/art/oath.jpg`
> Dawn in the great hall of the citadel. Rows of armored lords and knights kneel before a plain longsword raised
> upright on a stone altar, a beam of golden sunrise falling on the blade. Tall blue and crimson banners hang from
> the walls, dust motes glow in the light, solemn and heroic.

## Prompts for full cards (option B, portrait 2:3)

Use the same scenes, with this wrapper (replace the title and objective for each mission):

> A vertical fantasy trading-card in the style of an ornate dark gold and bronze frame with carved filigree corners, a
> small shield emblem at the top and a skull emblem at the bottom. The title across the top in large pale serif
> capitals reads "SCOUT THE SEA". The central illustration is: [scene from above]. At the bottom a parchment-and-dark-stone
> panel with the word "OBJECTIVE" in gold and below it the text "Count the black sails before they land."

| Mission | Title | Objective line |
|---|---|---|
| sea | SCOUT THE SEA | Count the black sails before they land. |
| mountains | MOUNTAIN WATCH | Light the signal fires above the passes. |
| beacons | LIGHT THE BEACONS | Call the far garrisons to the Citadel. |
| archives | GUARD THE ARCHIVES | Save the war-records from the burning library. |
| gates | MEND THE GATES | Reforge the shattered portcullis. |
| scouts | RESCUE THE SCOUTS | Bring the lost riders home through the fog. |
| forge | FEED THE FORGE | Keep the armourers working through the night. |
| oath | RENEW THE OATH | Rally the wavering lords to the Citadel banner. |

Image generators often garble small text. If the title or objective comes out wrong, regenerate, or use option A
for that mission instead.

## Adding the files

1. Save each image with the exact file name from the table above, in the matching folder (`assets/art/` or
   `assets/card/`). The folders already exist.
2. Reload the game. The painting appears automatically on the mission card and in the full-size card view.
3. To publish, commit the new files and push. With GitHub Pages the new art goes live in a minute or two.

The browser will show a "404" in its developer console for any mission that does not have a painting yet.
That is expected and harmless.

## Tips for a consistent set

- Generate all eight in one session so the style stays close, and reuse the style block word for word.
- Keep the camera at a similar distance (a wide establishing shot with a figure in the foreground).
- For option A the game crops the square to the frame window, so keep the important subject near the center.
- If one image looks too bright next to the others, lower its brightness slightly before saving.
