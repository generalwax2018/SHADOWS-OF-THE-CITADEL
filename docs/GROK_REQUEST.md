# Art still needed: copy and paste for Grok

Every mission is painted now. **One image is still missing: the Boot hand card.** Until it exists, Boot cards keep the
plain design (a green boot icon on a dark card); everything else already uses paintings.

## Boot card (hand card)

- **File:** `assets/cards/boot.jpg`
- **Size:** portrait 2:3, for example 500x745 (the same size as the scroll, shield and blade cards)
- **Matches:** the scroll, shield and blade card paintings: one hero object, close up, dark surface, a glowing accent

Paste the style block first, then the prompt.

> Dark fantasy oil painting, hyper-detailed, cinematic composition, gritty realism, moody and desaturated with warm
> torchlight and ember accents, volumetric fog and smoke, dramatic rim lighting, weathered steel armor, deep blue-black
> cloaks, worn stone and iron. Epic but grim. No text, no letters, no watermark, no border, no frame.

> A single heavy, battle-worn war boot of dark leather and riveted steel, caked with mud and ash, standing on cracked
> flagstones in a torch-lit stone corridor. A faint emerald-green glow rises from the stitched runes along the boot's
> cuff, a few embers drifting past. Close-up, centred composition, the boot filling most of the frame, deep shadows
> around it. Vertical 2:3 portrait.

## Saving it so the game can see it

1. Download the image yourself and save it as exactly `assets/cards/boot.jpg` inside the project folder.
2. Open js/missions.js and raise the number next to `ART_VERSION` by one (for example `'4'` becomes `'5'`). This makes every browser fetch the new image instead of a cached copy of an older one or of a missing file. (Or ask Claude to do it.)
3. Reload the game. Boot cards in the hand show the painting.
4. Commit and push.

**Do not let an AI tool upload the file to GitHub for you.** It cannot send image files and instead commits a tiny text
file with the right name that only says `BINARY_PLACEHOLDER`. That has already happened once and the placeholder had to
be removed. A real image starts with the letters `JFIF` or `Exif` when opened as text, and is at least tens of
kilobytes. If a painting's file is under 1 KB, it is a placeholder.

Also check the file name carefully: one batch arrived named `workspaceartifactsbeacons.jpg` instead of `beacons.jpg`,
and the game only looks for the exact names.

## Already done

Missions: Hold the Pass, Recover the Banner, Seek the Relic Blade, Defend the Walls, Mend the Gates, Rescue the Scouts,
Guard the Archives, Scout the Sea, Feed the Forge, Mountain Watch, Light the Beacons, Renew the Oath.
Hand cards: Blade, Shield, Scroll. Shadow card.
