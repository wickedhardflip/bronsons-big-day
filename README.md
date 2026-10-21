# Bronson's Big Day

A 3D browser game starring Bronson, an 80 lb chocolate mix with a yellow collar and a blue harness, and his two humans.

## Play

**[Play Bronson's Big Day in your browser](https://wickedhardflip.github.io/bronsons-big-day/)** (GitHub Pages; works on phones too)

- **Easiest:** download this repo (Code > Download ZIP), unzip it, and double-click `index.html`. It runs in any modern desktop or mobile browser. No install, no server.
- Works offline too: if the three.js CDN can't be reached, the page falls back to `vendor/three.min.js`.
- **GitHub Pages:** served from branch `main`, folder `/ (root)` (Settings > Pages).

## Chapters

1. **Rise and Shine** - wake up and find 8 treats in the yard (a golden one hides behind the house).
2. **Walkies to the Lake** - lead Mom and Andy through the checkpoint rings to the end of the dock. Tag squirrels for bonus points.
3. **Duck Hunt with Andy** - Andy is in his duck blind. Each time he drops a duck into the lake, swim out, grab it and bring it back. Retrieve 5 ducks; each one adds time.
4. **Fetch-Off at Bark Park** - race Daisy, Moose and Pepper to Andy's throws. First to 3 wins. Bark at a friend carrying the ball to make them drop it.
5. **Picnic with Mom** - just Bronson and Mom on the meadow at golden hour. Chase off squirrels and seagulls trying to steal her snacks, bark to scare them, and fetch her frisbee. Lose 3 snacks and the picnic is over.
6. **Sunset Snooze** - beat the dark home to bed. Fireflies add time.

Each chapter opens with a card listing its goals; the clock starts when you tap or click Start. A turning mini map (top right) shows treats, friends, Mom and Andy, thieves and your next goal. The goal arrow floats over the target when it's on screen and sits on the screen edge, pointing the way with a distance, when it isn't. Thrown balls, frisbees and falling ducks get a pulsing target ring where they'll land.

Leave Bronson alone for a few seconds and his real habits show up: a big two-part stretch, a side scratch with a back leg, or a long, unblinking stare into your soul (the camera creeps in for that one).

Progress is checkpointed at the start of every chapter (stored in your browser's localStorage, along with your best score).

## Leaderboard

Finish all six chapters in one game (started with **Play**) to post your time with 3-letter initials. The title screen shows the top 3, and the **Top 10** button shows the rest. Only play time counts: menus and pauses don't, retries do. Posting works on the GitHub Pages version. The backend is a small Cloudflare Worker with a D1 database, in [`leaderboard/`](leaderboard/).

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
- 3D: [three.js r128](https://threejs.org) (MIT), loaded from cdnjs with a local fallback in `vendor/`. Physically based sky (Preetham) with image-based lighting, a reflective lake, splat-mapped terrain, wind-blown instanced grass, leaf-card trees, soft shadows and filmic tone mapping. Phones get a lighter quality tier and the resolution adapts if frames run slow.
- Characters are built from primitives with procedural animation (gait, gallop, swim, tail wag, ear flop, sleeping, aiming, sitting).
- Bronson's bark is a real recording (CC0, see [assets/CREDITS.md](assets/CREDITS.md)). Music and all other sound effects are generated live with the Web Audio API. Each situation has its own track.

## Files

- `src/audio.js` - procedural music sequencer and sound effects
- `src/models.js` - Bronson, the owners, friend dogs, squirrels and props
- `src/world.js` - sky, terrain, grass, trees, house, trail, dog park, lake, dock, duck blind, picnic meadow, time of day
- `vendor/Sky.js`, `vendor/Water.js` - adapted three.js example shaders (MIT)
- `assets/sounds/` - bark clips (CC0), inlined into the page by `build.js`; credits in `assets/CREDITS.md`
- `src/game.js` - camera, controls, chapters, checkpoints, HUD
- `src/shell.html` - page markup and styles
- `leaderboard/` - the leaderboard Worker and its D1 schema
