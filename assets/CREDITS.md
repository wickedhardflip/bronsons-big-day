# Credits

## Sound

- Bronson's bark: four short clips cut from **"Dog Bark Growl Talk Studio Quality"** by **harveyism** on Freesound, sound #417514.
  - Source: https://freesound.org/people/harveyism/sounds/417514/
  - License: Creative Commons 0 (CC0 1.0, public domain dedication). No attribution is required; it is credited here anyway.
  - Changes: clips cut at about 5.47 s, 7.33 s, 8.26 s and 35.35 s (0.46 s each, with a short fade), converted to 22 kHz mono MP3 (`sounds/bark1.mp3` to `bark4.mp3`). The game plays them slightly pitched down to suit an 80 lb dog.
- All music and every other sound effect is synthesized live in the browser with the Web Audio API. No other audio files are used.

## Code

- [three.js](https://github.com/mrdoob/three.js) r128, MIT License, Copyright 2010-2021 three.js authors. `vendor/three.min.js` is the unmodified build.
- `vendor/Sky.js` and `vendor/Water.js` are adapted from the three.js examples (MIT, same authors) with local shader changes for night sky, moon, shallow-water tint, shoreline fade and tone mapping. Each file's header notes the changes.

## Everything else

Characters, textures, terrain, trees and props are generated in code at load time. There are no third-party images or models.
