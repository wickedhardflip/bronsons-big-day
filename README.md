# Bronson's Big Day

A 3D browser game starring Bronson, an 80 lb chocolate mix with a yellow collar and a blue harness, and his two humans.

## Play

- **Easiest:** download this repo (Code > Download ZIP), unzip it, and double-click `index.html`. It runs in any modern desktop or mobile browser. No install, no server.
- Works offline too: if the three.js CDN can't be reached, the page falls back to `vendor/three.min.js`.
- **GitHub Pages:** Pages can serve this repo directly (Settings > Pages > Deploy from branch `main`, folder `/root`). Pages on a *private* repo needs a paid GitHub plan (Pro, Team or Enterprise).

## Chapters

1. **Rise and Shine** - wake up and find 8 treats in the yard (a golden one hides behind the house).
2. **Walkies to the Lake** - lead Mom and Andy through the checkpoint rings to the end of the dock. Tag squirrels for bonus points.
3. **Fetch-Off at Bark Park** - race Daisy, Moose and Pepper to Andy's throws. First to 3 wins. Bark at a friend carrying the ball to make them drop it.
4. **Sunset Snooze** - beat the dark home to bed. Fireflies add time.

Progress is checkpointed at the start of every chapter (stored in your browser's localStorage, along with your best score).

## Controls

| Action | Keyboard / mouse | Touch |
| --- | --- | --- |
| Move | WASD or arrow keys | Drag on the left side |
| Sprint (Zoomies) | Shift | Zoom button |
| Jump | Space | Jump button |
| Bark | E | Bark button |
| Camera | Drag mouse, scroll to zoom, C to recenter | Drag on the right side |
| Pause / music | P or Esc / M | Buttons top right |

## How it's built

- Single page, no build step needed to play. `index.html` is generated from `src/` by `node build.js`.
- 3D: [three.js r128](https://threejs.org) (MIT), loaded from cdnjs with a local fallback in `vendor/`.
- Characters are built from primitives with procedural animation (gait, gallop, swim, tail wag, ear flop, sleeping).
- Music and sound effects are generated live with the Web Audio API. No audio files, nothing licensed. Each situation has its own track: title theme, cozy morning, upbeat walk, dramatic fetch-off, tense dusk race, and a music-box lullaby.

## Files

- `src/audio.js` - procedural music sequencer and sound effects
- `src/models.js` - Bronson, the owners, friend dogs, squirrels and props
- `src/world.js` - terrain, house, trail, dog park, lake and dock, time of day
- `src/game.js` - camera, controls, chapters, checkpoints, HUD
- `src/shell.html` - page markup and styles
