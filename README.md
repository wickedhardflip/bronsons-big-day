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

**Difficulty:** pick Easy, Normal or Hard on the title screen. Easy gives about 30% more time on each clock, bigger time rewards, and slower ducks, picnic thieves and rival dogs; Hard is the reverse. The picnic clock is the same on every difficulty (you hold out until it ends), so only its critters change.

**Chapter select** unlocks after you finish the game once. Practice any chapter; practice doesn't touch your checkpoint or the leaderboard.

## Wardrobe and photo mode

Each chapter hides one tennis ball off the beaten path (it sparkles; the chapter card tells you whether you've found it yet). Every ball unlocks new looks, and you dress Bronson in the **Wardrobe** on the title screen. The look you pick is saved and he wears it through every chapter.

| Unlock | Looks |
| --- | --- |
| Free | Yellow or red collar, blue harness or no harness |
| Chapter 1 ball | Red bandana, pink collar |
| Chapter 2 ball | Yellow rain jacket, green collar |
| Chapter 3 ball | Orange life vest |
| Chapter 4 ball | Baseball cap, red harness |
| Chapter 5 ball | Flower crown, blue plaid bandana |
| Chapter 6 ball | Bow tie, black harness, purple collar |
| Finish the game | Holiday looks: Santa hat, reindeer antlers (with a red nose), holiday sweater, bunny ears |
| Finish a full game on Hard | Halloween looks: pumpkin costume, witch hat |
| All 6 balls | Hot dog costume, party hat, superhero cape |

His harness comes off under an outfit, and the leash clips to his collar or over the outfit instead.

**Photo mode** is in the pause menu and the wardrobe. The world holds still while you drag to orbit around Bronson, pinch or scroll to zoom, and pose him (stand, sit, lie down, play bow, head tilt, look at me). The shutter saves a full-resolution JPEG with a small watermark; on phones that support it there's a Share button, and you can always press and hold the photo to save it. Time in photo mode doesn't count toward the run clock.

Progress is checkpointed at the start of every chapter (stored in your browser's localStorage, along with your best score).

## Free roam

Finish all six chapters once and a **Free roam** button appears on the title screen. It's a no-timer sandbox on the lake meadow where you play as Mom, in first person:

- **Commands:** sit, down, shake, spin, speak, roll over, play bow, stay, come, fetch, treat and pet. Mom's hand does the matching signal, and she crouches down to his level to pet him, shake his paw or hand him a treat. Bronson still does his own thing between commands: he wanders, sniffs, stretches, scratches and stares into your soul.
- **Andy** is sitting at the end of the dock, fishing. Walk up to him to talk, have him call Bronny over for a scratch behind the ears, or have him toss Bronny a fish (he catches it and shows it off).
- **Wardrobe and photos:** every look is unlocked in free roam, and the outfit you pick there is kept separately from the one he wears in the story. Photo mode works the same as in the main game.
- **Time of day:** cycle morning, noon, afternoon, golden hour, sunset and night from the chip at the top.

Shortcut: tap the **Bronson's Big Day** logo on the title screen three times quickly to jump straight into free roam, even before you've finished a run.

| Free roam | Keyboard / mouse | Touch |
| --- | --- | --- |
| Walk / jog | WASD or up/down arrows, Shift to jog; left/right arrows turn | Drag on the left side (push to the edge to jog) |
| Look around | Drag the mouse | Drag on the right side |
| Commands | 1 to 9 (sit, down, shake, spin, speak, roll over, play bow, stay, come), F fetch, T treat, G pet | Command buttons |
| Andy (when you're next to him) | E talk, C call Bronny, X toss a fish | Andy buttons |

## Leaderboard

Finish all six chapters in one game (started with **Play**) to post your time with 3-letter initials. The title screen shows the top 3, and the **Top 10** button shows the rest, with tabs for All, Easy, Normal and Hard (the All tab labels each time with its difficulty). A run clock shows in the corner during a full game, and your personal best per difficulty is kept in your browser. Only play time counts: menus and pauses don't, retries do. Posting works on the GitHub Pages version. The backend is a small Cloudflare Worker with a D1 database, in [`leaderboard/`](leaderboard/).

## Controls

| Action | Keyboard / mouse | Touch |
| --- | --- | --- |
| Move | WASD or arrow keys | Drag on the left side |
| Sprint (Zoomies) | Shift | Zoom button |
| Jump | Space | Jump button |
| Bark | E | Bark button |
| Camera | Drag mouse, scroll to zoom, C to recenter | Drag on the right side |
| Pause menu (resume, photo mode, restart chapter, quit) / music | P or Esc / M | Menu and Music buttons, top right |

## How it's built

- Single page, no build step needed to play. `index.html` is generated from `src/` by `node build.js`.
- 3D: [three.js r128](https://threejs.org) (MIT), loaded from cdnjs with a local fallback in `vendor/`. Physically based sky (Preetham) with image-based lighting, a reflective lake, splat-mapped terrain, wind-blown instanced grass, leaf-card trees, soft shadows and filmic tone mapping. Phones get a lighter quality tier and the resolution adapts if frames run slow.
- Characters are built from primitives with procedural animation (gait, gallop, swim, tail wag, ear flop, sleeping, aiming, sitting).
- Bronson's bark is a real recording (CC0, see [assets/CREDITS.md](assets/CREDITS.md)). Music and all other sound effects are generated live with the Web Audio API. Each situation has its own track.

## Files

- `src/audio.js` - procedural music sequencer and sound effects
- `src/models.js` - Bronson, the owners, friend dogs, squirrels and props
- `src/outfits.js` - the wardrobe: every look, how it unlocks, and the clothes (cut to Bronson's torso profile so they move with him)
- `src/world.js` - sky, terrain, grass, trees, house, trail, dog park, lake, dock, duck blind, picnic meadow, time of day
- `vendor/Sky.js`, `vendor/Water.js` - adapted three.js example shaders (MIT)
- `assets/sounds/` - bark clips (CC0), inlined into the page by `build.js`; credits in `assets/CREDITS.md`
- `src/game.js` - camera, controls, chapters, checkpoints, HUD, free roam
- `src/shell.html` - page markup and styles
- `leaderboard/` - the leaderboard Worker and its D1 schema
