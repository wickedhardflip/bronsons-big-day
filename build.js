// Builds the single-file game: dist/bronson.html (artifact body) and index.html (standalone page).
const fs = require('fs'), path = require('path');
const src = f => fs.readFileSync(path.join(__dirname, 'src', f), 'utf8');
const vendor = f => fs.readFileSync(path.join(__dirname, 'vendor', f), 'utf8');
// real bark recordings (CC0, see assets/CREDITS.md), inlined so the game stays a single offline-capable file
const barks = fs.readdirSync(path.join(__dirname, 'assets', 'sounds')).filter(f => /^bark\d+\.mp3$/.test(f)).sort()
  .map(f => 'data:audio/mpeg;base64,' + fs.readFileSync(path.join(__dirname, 'assets', 'sounds', f)).toString('base64'));
const audio = src('audio.js').replace('/*__BARKS__*/[]', () => JSON.stringify(barks));
// Sky.js and Water.js are small three.js example modules (MIT), vendored with local shader tweaks
const js = [vendor('Sky.js'), vendor('Water.js'), audio, src('models.js'), src('outfits.js'), src('world.js'), src('game.js')].join('\n') + `
if (!window.THREE) { document.getElementById('loading').textContent = 'Could not load the 3D engine. Check your internet connection and reload.'; }
else { const go = () => boot(); (window.claude && window.claude.hot && window.claude.hot.ready) ? window.claude.hot.ready(go) : go(); }
`;
const body = src('shell.html').replace('/*__GAME_JS__*/', () => js);
fs.mkdirSync(path.join(__dirname, 'dist'), { recursive: true });
fs.writeFileSync(path.join(__dirname, 'dist', 'bronson.html'), body);
// standalone page: fall back to the bundled copy of three.js when the CDN is unreachable (offline play)
const cdn = '<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>';
const page = body.replace(cdn, () => cdn + '\n<script>window.THREE || document.write(\'<script src="vendor/three.min.js"><\\/script>\');</script>');
fs.writeFileSync(path.join(__dirname, 'index.html'), '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n' + page + '\n</html>\n');
console.log('built', body.length, 'bytes,', barks.length, 'bark clips');
