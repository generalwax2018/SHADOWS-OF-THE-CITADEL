# Art status: nothing is outstanding

Every mission, every hand card and the Shadow card now have paintings.

| Art | Files |
|---|---|
| 12 missions | `assets/quest-*.jpg` (4 full painted cards) and `assets/art/<id>.jpg` (8 illustrations) |
| Hand cards: Blade, Shield, Scroll, Boot | `assets/cards/<suit>.jpg` |
| Shadow card | `assets/cards/shadow.jpg` |

Remaining ideas, none required:

- **Card back** for a deck or draw pile, in the same style (Grok already made one in `legacy/shadows_of_the_citadel_refined.html`).
- **Replacing any painting:** see below.

## Replacing or adding a painting

Style block to paste first in any new prompt:

> Dark fantasy oil painting, hyper-detailed, cinematic composition, gritty realism, moody and desaturated with warm
> torchlight and ember accents, volumetric fog and smoke, dramatic rim lighting, weathered steel armor, deep blue-black
> cloaks, worn stone and iron. Epic but grim. No text, no letters, no watermark, no border, no frame.

1. Download the image yourself and save it with the exact name in the table above (mission paintings are tall 2:3 images,
   for example 1024x1536; hand cards are 500x745).
2. Open `js/missions.js` and raise the number next to `ART_VERSION` by one. This makes every browser fetch the new image
   instead of a cached copy of an older one or of a missing file. (Or ask Claude to do it.)
3. Reload the game, then commit and push.

**Do not let an AI tool upload the file to GitHub for you.** It cannot send image files and instead commits a tiny text
file with the right name that only says `BINARY_PLACEHOLDER`. That has already happened once and the placeholder had to
be removed. A real image starts with the letters `JFIF` or `Exif` when opened as text, and is at least tens of
kilobytes. If a painting's file is under 1 KB, it is a placeholder.

Also check the file name carefully: one batch arrived named `workspaceartifactsbeacons.jpg` instead of `beacons.jpg`,
and the game only looks for the exact names.

A painting that already has a frame baked in (like the boot card, which has a gold border) works fine: it is shown as
it is. The other hand cards are frameless, so a framed card looks a little richer than the rest.
