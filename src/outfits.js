// Bronson's wardrobe: the catalog of looks, how each one unlocks, and the clothes themselves.
// Clothes are cut to the dog's own torso profile, so they move with every pose and quirk.
const Outfits = (() => {
  const { std, mesh, grp, loft, strapRing, canvasTex, SPH, SPH_LO, mergeStatic } = Models;
  const V3 = THREE.Vector3;
  const DS = THREE.DoubleSide;

  const SLOTS = [{ id: 'collar', name: 'Collar' }, { id: 'harness', name: 'Harness' }, { id: 'neck', name: 'Neck' }, { id: 'head', name: 'Hat' }, { id: 'body', name: 'Outfit' }];
  // unlock: none = free; ball = that chapter's hidden tennis ball; finish = finish the game; hard = finish a full run on Hard; allBalls = all six balls
  const ITEMS = [
    { id: 'c-yellow', slot: 'collar', name: 'Yellow', color: 0xf2c418 },
    { id: 'c-red', slot: 'collar', name: 'Red', color: 0xe0483e },
    { id: 'c-pink', slot: 'collar', name: 'Pink', color: 0xff7ab8, unlock: { ball: 'rise' } },
    { id: 'c-green', slot: 'collar', name: 'Green', color: 0x2ecc71, unlock: { ball: 'walk' } },
    { id: 'c-purple', slot: 'collar', name: 'Purple', color: 0x8e44ad, unlock: { ball: 'sunset' } },
    { id: 'h-blue', slot: 'harness', name: 'Blue', color: 0x1f55d6 },
    { id: 'h-none', slot: 'harness', name: 'No harness' },
    { id: 'h-red', slot: 'harness', name: 'Red', color: 0xc62828, unlock: { ball: 'fetch' } },
    { id: 'h-black', slot: 'harness', name: 'Black', color: 0x2a2a2e, unlock: { ball: 'sunset' } },
    { id: 'n-none', slot: 'neck', name: 'Nothing' },
    { id: 'n-bandana', slot: 'neck', name: 'Red bandana', sw: '#c62828', unlock: { ball: 'rise' } },
    { id: 'n-plaid', slot: 'neck', name: 'Blue plaid bandana', sw: '#2b4c8c', unlock: { ball: 'picnic' } },
    { id: 'n-bowtie', slot: 'neck', name: 'Bow tie', sw: '#1f2f5c', unlock: { ball: 'sunset' } },
    { id: 'hd-none', slot: 'head', name: 'Nothing' },
    { id: 'hd-cap', slot: 'head', name: 'Baseball cap', sw: '#d32f2f', unlock: { ball: 'fetch' } },
    { id: 'hd-flowers', slot: 'head', name: 'Flower crown', sw: '#ff8fb1', unlock: { ball: 'picnic' } },
    { id: 'hd-santa', slot: 'head', name: 'Santa hat', sw: '#d0202a', unlock: { finish: true } },
    { id: 'hd-antlers', slot: 'head', name: 'Reindeer antlers', sw: '#b08850', unlock: { finish: true } },
    { id: 'hd-bunny', slot: 'head', name: 'Bunny ears', sw: '#f8f6f2', unlock: { finish: true } },
    { id: 'hd-witch', slot: 'head', name: 'Witch hat', sw: '#7b3fa0', unlock: { hard: true } },
    { id: 'hd-party', slot: 'head', name: 'Party hat', sw: '#2bb3e6', unlock: { allBalls: true } },
    { id: 'b-none', slot: 'body', name: 'Nothing' },
    { id: 'b-rain', slot: 'body', name: 'Rain jacket', sw: '#ffc81e', unlock: { ball: 'walk' } },
    { id: 'b-vest', slot: 'body', name: 'Life vest', sw: '#ff6d00', unlock: { ball: 'duck' } },
    { id: 'b-sweater', slot: 'body', name: 'Holiday sweater', sw: '#c62828', unlock: { finish: true } },
    { id: 'b-pumpkin', slot: 'body', name: 'Pumpkin costume', sw: '#f28c28', unlock: { hard: true } },
    { id: 'b-hotdog', slot: 'body', name: 'Hot dog costume', sw: '#b4432a', unlock: { allBalls: true } },
    { id: 'b-cape', slot: 'body', name: 'Superhero cape', sw: '#d32f2f', unlock: { allBalls: true } },
  ];
  const DEFAULT = { collar: 'c-yellow', harness: 'h-blue', neck: 'n-none', head: 'hd-none', body: 'b-none' };
  const BALL_CHAPTERS = ['rise', 'walk', 'duck', 'fetch', 'picnic', 'sunset'];
  const byId = {}; ITEMS.forEach(i => { byId[i.id] = i; });
  const item = id => byId[id];

  // prog: { balls: { rise: true, ... }, finished, hard }
  function unlocked(it, prog) {
    const u = it.unlock; if (!u) return true;
    const balls = prog.balls || {};
    if (u.ball) return !!balls[u.ball];
    if (u.finish) return !!prog.finished;
    if (u.hard) return !!prog.hard;
    if (u.allBalls) return BALL_CHAPTERS.every(c => balls[c]);
    return false;
  }
  function hint(it) {
    const u = it.unlock; if (!u) return '';
    if (u.ball) return `Find the hidden tennis ball in Chapter ${BALL_CHAPTERS.indexOf(u.ball) + 1}.`;
    if (u.finish) return 'Finish the whole game to unlock the holiday looks.';
    if (u.hard) return 'Finish a full game on Hard to unlock the Halloween looks.';
    return 'Find all 6 hidden tennis balls.';
  }
  const unlockedIds = prog => ITEMS.filter(i => unlocked(i, prog)).map(i => i.id);
  // anything unknown or still locked falls back to his everyday look
  function sanitize(o, prog) {
    const out = Object.assign({}, DEFAULT);
    if (o && typeof o === 'object') SLOTS.forEach(s => { const it = item(o[s.id]); if (it && it.slot === s.id && unlocked(it, prog)) out[s.id] = it.id; });
    return out;
  }

  // ---------- fabric textures (made once, shared) ----------
  const texCache = {};
  const tex = (key, w, h, draw, repeat) => texCache[key] || (texCache[key] = canvasTex(w, h, draw, repeat));
  const paisleyTex = () => tex('paisley', 256, 256, (g, w, h) => {
    g.fillStyle = '#c62828'; g.fillRect(0, 0, w, h);
    const drop = (x, y, s, a) => {
      g.save(); g.translate(x, y); g.rotate(a); g.scale(s, s);
      g.fillStyle = '#fbeee6'; g.beginPath(); g.moveTo(0, -18); g.bezierCurveTo(16, -12, 14, 14, 0, 16); g.bezierCurveTo(-14, 14, -12, -2, 0, -18); g.fill();
      g.fillStyle = '#c62828'; g.beginPath(); g.ellipse(1, 4, 5, 7, 0, 0, 7); g.fill();
      g.fillStyle = '#1b1b1b'; g.beginPath(); g.arc(1, 4, 2.2, 0, 7); g.fill();
      g.restore();
    };
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) drop(32 + x * 64 + (y % 2) * 32, 32 + y * 64, 0.9, (x + y) * 0.9);
    g.fillStyle = '#fbeee6'; for (let i = 0; i < 70; i++) { g.beginPath(); g.arc((i * 53) % w, (i * 97) % h, 2, 0, 7); g.fill(); }
  }, [2, 2]);
  const plaidTex = () => tex('plaid', 256, 256, (g, w, h) => {
    g.fillStyle = '#2b4c8c'; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(16,28,64,.55)'; [0, 128].forEach(o => { g.fillRect(o + 20, 0, 40, h); g.fillRect(0, o + 20, w, 40); });
    g.fillStyle = 'rgba(140,180,235,.35)'; [0, 128].forEach(o => { g.fillRect(o + 80, 0, 22, h); g.fillRect(0, o + 80, w, 22); });
    g.fillStyle = 'rgba(255,255,255,.8)'; [0, 128].forEach(o => { g.fillRect(o + 70, 0, 3, h); g.fillRect(0, o + 70, w, 3); });
  }, [3, 3]);
  const dotsTex = () => tex('dots', 128, 128, (g, w, h) => {
    g.fillStyle = '#1f2f5c'; g.fillRect(0, 0, w, h); g.fillStyle = '#f4f1ea';
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) { g.beginPath(); g.arc(16 + x * 32 + (y % 2) * 16, 16 + y * 32, 4, 0, 7); g.fill(); }
  }, [1, 1]);
  // red knit with white zigzags and snowflakes; rows run around the body
  const sweaterTex = () => tex('sweater', 256, 512, (g, w, h) => {
    g.fillStyle = '#b81f24'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 8) for (let x = 0; x < w; x += 8) { g.fillStyle = (x / 8 + y / 8) % 2 ? 'rgba(0,0,0,.06)' : 'rgba(255,255,255,.04)'; g.fillRect(x, y, 8, 8); }
    const zig = y => { g.strokeStyle = '#fbf6ee'; g.lineWidth = 7; g.beginPath(); for (let x = 0; x <= w; x += 16) g.lineTo(x, y + ((x / 16) % 2 ? 9 : -9)); g.stroke(); };
    [70, 250, 440].forEach(zig);
    const flake = (x, y, r) => { g.strokeStyle = '#fbf6ee'; g.lineWidth = 4; for (let k = 0; k < 3; k++) { const a = k * Math.PI / 3; g.beginPath(); g.moveTo(x - Math.cos(a) * r, y - Math.sin(a) * r); g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); g.stroke(); } };
    for (let x = 32; x < w; x += 64) { flake(x, 160, 16); flake(x + 32, 345, 16); }
    g.fillStyle = '#1f7a3a'; for (let x = 0; x < w; x += 64) { g.beginPath(); g.moveTo(x + 32, 120); g.lineTo(x + 46, 145); g.lineTo(x + 18, 145); g.fill(); g.beginPath(); g.moveTo(x, 300); g.lineTo(x + 14, 325); g.lineTo(x - 14, 325); g.fill(); }
  }, [4, 1]);
  const partyTex = () => tex('party', 256, 256, (g, w, h) => {
    const cols = ['#2bb3e6', '#ffd23f', '#ff5d8f', '#7ad151'];
    for (let i = -8; i < 16; i++) { g.fillStyle = cols[(i + 16) % 4]; g.beginPath(); g.moveTo(i * 32, 0); g.lineTo(i * 32 + 32, 0); g.lineTo(i * 32 + 32 + h, h); g.lineTo(i * 32 + h, h); g.fill(); }
    g.fillStyle = '#ffffff'; for (let i = 0; i < 40; i++) { g.beginPath(); g.arc((i * 71) % w, (i * 37) % h, 5, 0, 7); g.fill(); }
  });
  // cape with a gold "B" crest; drawn upside down so it reads the right way on his back
  const capeTex = () => tex('cape', 256, 512, (g, w, h) => {
    g.fillStyle = '#d32f2f'; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(0, 0, 10, h); g.fillRect(w - 10, 0, 10, h);
    g.save(); g.translate(w / 2, h * 0.62); g.rotate(Math.PI);
    g.fillStyle = '#ffcc33'; g.beginPath(); g.arc(0, 0, 62, 0, 7); g.fill();
    g.strokeStyle = '#a32020'; g.lineWidth = 6; g.stroke();
    g.fillStyle = '#a32020'; g.font = '400 92px "Lilita One", "Arial Black", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('B', 0, 6);
    g.restore();
  });
  const pumpkinTex = () => tex('pumpkin', 256, 64, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, w, 0);
    for (let i = 0; i <= 9; i++) { gr.addColorStop(i / 9, '#c95f12'); if (i < 9) gr.addColorStop((i + 0.5) / 9, '#ff9b2f'); }
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  });

  // ---------- garment geometry ----------
  // extra room over the shoulder and haunch muscles so they never poke through
  const clearance = z => 0.07 * Math.exp(-(((z - 0.215) / 0.07) ** 2)) + 0.08 * Math.exp(-(((z + 0.31) / 0.07) ** 2));
  function shellPt(d, z, a, grow) { const [yc, w, h] = d.prof(z), k = grow + clearance(z) * Math.cos(a) ** 2; return new V3(Math.cos(a) * w * k, yc + Math.sin(a) * h * k, z); }
  // a coat cut to the torso from z0 (rump side) to z1 (chest side), wrapping over the back and down past the sides; the belly stays open for the legs.
  // a0..a1 is the arc it covers (0 is his left side, PI/2 the top of his back)
  function shell(d, z0, z1, wrap, grow, segZ = 20, segA = 32, a0 = -wrap, a1 = Math.PI + wrap) {
    const pos = [], uv = [], idx = [];
    for (let i = 0; i <= segZ; i++) {
      const t = i / segZ, z = z0 + (z1 - z0) * t;
      for (let j = 0; j <= segA; j++) { const u = j / segA, p = shellPt(d, z, a0 + (a1 - a0) * u, grow); pos.push(p.x, p.y, p.z); uv.push(u, t); }
    }
    for (let i = 0; i < segZ; i++) for (let j = 0; j < segA; j++) { const a = i * (segA + 1) + j, b = a + segA + 1; idx.push(a, b, a + 1, a + 1, b, b + 1); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
    return g;
  }
  // a rolled hem around the edge of a shell
  function hem(d, z0, z1, wrap, grow, r) {
    const pts = [], n = 18, a0 = -wrap, a1 = Math.PI + wrap;
    for (let i = 0; i < n; i++) pts.push(shellPt(d, z0 + (z1 - z0) * i / n, a0, grow));
    for (let i = 0; i < n; i++) pts.push(shellPt(d, z1, a0 + (a1 - a0) * i / n, grow));
    for (let i = 0; i < n; i++) pts.push(shellPt(d, z1 - (z1 - z0) * i / n, a1, grow));
    for (let i = 0; i < n; i++) pts.push(shellPt(d, z0, a1 - (a1 - a0) * i / n, grow));
    return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 160, r, 6, true);
  }
  // a strap all the way around the body: sits on the garment over the back, snug under the belly
  function girth(d, zc, width, over, under, wrap) {
    const seg = 48, pos = [], idx = [];
    for (let j = 0; j <= seg; j++) {
      const a = -Math.PI / 2 + j / seg * Math.PI * 2, s = Math.sin(a), cover = Math.min(1, Math.max(0, (s + 1) / (1 + Math.sin(-wrap) + 1e-3)));
      const k = under + (over - under) * cover;
      for (let e = -1; e <= 1; e += 2) { const z = zc + e * width, [yc, w, h] = d.prof(z); pos.push(Math.cos(a) * w * k, yc + s * h * k, z); }
    }
    for (let j = 0; j < seg; j++) { const a = j * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
    return g;
  }
  const topY = (d, z, grow) => { const [yc, , h] = d.prof(z); return yc + h * grow; };

  // ---------- the clothes ----------
  const BUILD = {
    'n-bandana': d => bandana(d, std(0xffffff, { map: paisleyTex(), roughness: 0.85, side: DS })),
    'n-plaid': d => bandana(d, std(0xffffff, { map: plaidTex(), roughness: 0.9, side: DS })),
    'n-bowtie': d => {
      const f = d.collarFit, n = new V3(0, -Math.sin(f.tilt), Math.cos(f.tilt)), p = new V3().fromArray(f.throat).addScaledVector(n, 0.014);
      const g = grp(d.neck, [p.x, p.y, p.z]); g.rotation.x = f.tilt;
      const m = std(0xffffff, { map: dotsTex(), roughness: 0.55 });
      [-1, 1].forEach(s => mesh(new THREE.ConeGeometry(0.021, 0.036, 4), m, g, [s * 0.019, 0, 0], [0, 0, s * Math.PI / 2], [1, 1, 0.5]));
      mesh(SPH, m, g, [0, 0, 0.002], null, [0.01, 0.012, 0.009]);
      return g;
    },
    'hd-cap': d => {
      const g = grp(d.head), m = std(0xd32f2f, { roughness: 0.7 });
      mesh(new THREE.SphereGeometry(1, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2), m, g, [0, 0.056, -0.014], [-0.16, 0, 0], [0.071, 0.052, 0.076]);
      mesh(new THREE.CylinderGeometry(1, 1, 1, 24, 1, false, -Math.PI / 2, Math.PI), m, g, [0, 0.058, 0.04], [0.14, 0, 0], [0.064, 0.005, 0.078]);
      mesh(SPH_LO, std(0xffffff, { roughness: 0.6 }), g, [0, 0.106, -0.022], null, [0.008, 0.005, 0.008]);
      return g;
    },
    'hd-santa': d => {
      const g = grp(d.head), red = new THREE.MeshPhysicalMaterial({ color: 0xd0202a, roughness: 0.75, sheen: new THREE.Color(0xff8080) }), fur = std(0xf6f3ee, { roughness: 1 });
      const path = [[0, 0.06, -0.02, 0.066, 0.07], [0, 0.12, -0.035, 0.05, 0.054], [0, 0.165, -0.06, 0.034, 0.036], [0.032, 0.185, -0.098, 0.02, 0.02], [0.058, 0.17, -0.122, 0.009, 0.009]];
      mesh(loft(path.map(([x, y, z, w, h]) => ({ p: [x, y, z], w, h })), { ref: [0, 0, 1], seg: 20 }), red, g);
      mesh(new THREE.TorusGeometry(1, 0.24, 10, 28), fur, g, [0, 0.062, -0.02], [Math.PI / 2 - 0.08, 0, 0], [0.068, 0.072, 0.068]);
      mesh(SPH, fur, g, [0.062, 0.166, -0.126], null, [0.022, 0.022, 0.022]);
      return g;
    },
    'hd-antlers': d => {
      const g = grp(d.head), band = std(0x5a3a22, { roughness: 0.6 }), felt = std(0xb08850, { roughness: 0.95 });
      mesh(new THREE.TorusGeometry(0.075, 0.0055, 6, 24, Math.PI), band, g, [0, 0.014, -0.035], [0.12, 0, 0]);
      const tube = pts => { const c = new THREE.CatmullRomCurve3(pts.map(p => new V3(p[0], p[1], p[2]))); mesh(new THREE.TubeGeometry(c, 14, 0.0075, 6, false), felt, g); mesh(SPH_LO, felt, g, pts[pts.length - 1], null, [0.0075, 0.0075, 0.0075]); };
      [-1, 1].forEach(s => {
        tube([[s * 0.045, 0.074, -0.03], [s * 0.065, 0.12, -0.036], [s * 0.085, 0.17, -0.054], [s * 0.078, 0.21, -0.074]]);
        tube([[s * 0.064, 0.115, -0.036], [s * 0.056, 0.145, -0.006], [s * 0.05, 0.165, 0.012]]);
        tube([[s * 0.084, 0.165, -0.052], [s * 0.105, 0.185, -0.036], [s * 0.118, 0.202, -0.024]]);
      });
      // and a shiny red nose, of course
      mesh(SPH, new THREE.MeshPhysicalMaterial({ color: 0xe0201c, emissive: 0x6a0000, roughness: 0.25, clearcoat: 1 }), g, [0, -0.012, d.nz + 0.003], [-0.3, 0, 0], [0.025, 0.019, 0.017]);
      return g;
    },
    'hd-bunny': d => {
      const g = grp(d.head), white = std(0xf8f6f2, { roughness: 0.95 }), pink = std(0xf5a8c0, { roughness: 0.8 });
      mesh(new THREE.TorusGeometry(0.075, 0.0055, 6, 24, Math.PI), pink, g, [0, 0.014, -0.035], [0.12, 0, 0]);
      [-1, 1].forEach(s => {
        const e = grp(g, [s * 0.032, 0.078, -0.035]); e.rotation.set(-0.12, 0, -s * 0.2);
        if (s > 0) e.rotation.x = 0.25; // one ear flops forward a little
        mesh(SPH, white, e, [0, 0.07, 0], null, [0.024, 0.08, 0.012]);
        mesh(SPH, pink, e, [0, 0.068, 0.007], null, [0.014, 0.062, 0.006]);
      });
      return g;
    },
    'hd-witch': d => {
      const g = grp(d.head), black = std(0x1c1424, { roughness: 0.85, side: DS });
      mesh(new THREE.CylinderGeometry(0.118, 0.118, 0.005, 36), black, g, [0, 0.068, -0.02], [-0.1, 0, 0]);
      const path = [[0, 0.066, -0.02, 0.058, 0.058], [0, 0.15, -0.036, 0.04, 0.04], [0, 0.22, -0.062, 0.025, 0.025], [0.016, 0.27, -0.1, 0.012, 0.012], [0.03, 0.282, -0.13, 0.003, 0.003]];
      mesh(loft(path.map(([x, y, z, w, h]) => ({ p: [x, y, z], w, h })), { ref: [0, 0, 1], seg: 20 }), black, g);
      mesh(new THREE.CylinderGeometry(0.056, 0.059, 0.02, 28, 1, true), std(0x7b3fa0, { roughness: 0.6, side: DS }), g, [0, 0.082, -0.022], [-0.1, 0, 0]);
      mesh(new THREE.BoxGeometry(0.022, 0.017, 0.004), std(0xe8c050, { metalness: 0.8, roughness: 0.3 }), g, [0, 0.082, 0.038], [-0.1, 0, 0]);
      return g;
    },
    'hd-party': d => {
      const g = grp(d.head, [0.012, 0.068, -0.022]); g.rotation.set(-0.1, 0, -0.22);
      mesh(new THREE.ConeGeometry(0.046, 0.13, 28, 1, true), std(0xffffff, { map: partyTex(), roughness: 0.6, side: DS }), g, [0, 0.065, 0]);
      mesh(SPH, std(0xffd23f, { roughness: 0.9 }), g, [0, 0.132, 0], null, [0.016, 0.016, 0.016]);
      return g;
    },
    'hd-flowers': d => {
      const g = grp(d.head, [0, 0.016, -0.03]); g.rotation.x = 0.28;
      const vine = std(0x3f7d3a, { roughness: 0.8 }), center = std(0xffd54a, { roughness: 0.7 });
      const petals = [0xff8fb1, 0xffffff, 0xc39bd3, 0xffb27a].map(c => std(c, { roughness: 0.75 }));
      mesh(new THREE.TorusGeometry(0.073, 0.006, 6, 24, Math.PI), vine, g);
      for (let i = 0; i < 9; i++) {
        const a = 0.12 + i / 8 * (Math.PI - 0.24), c = Math.cos(a), s = Math.sin(a), r = 0.076;
        const f = grp(g, [c * r, s * r, 0.004]); f.rotation.z = a - Math.PI / 2;
        const pm = petals[i % 4], sz = i % 2 ? 0.8 : 1;
        for (let k = 0; k < 5; k++) { const b = k / 5 * Math.PI * 2; mesh(SPH_LO, pm, f, [Math.cos(b) * 0.01 * sz, 0.004, Math.sin(b) * 0.01 * sz], [0, -b, 0], [0.009 * sz, 0.004, 0.006 * sz]); }
        mesh(SPH_LO, center, f, [0, 0.007, 0], null, [0.005, 0.004, 0.005]);
        if (i < 8) { const a2 = a + (Math.PI - 0.24) / 16; mesh(SPH_LO, vine, g, [Math.cos(a2) * 0.075, Math.sin(a2) * 0.075, 0.01], [0, 0, a2], [0.004, 0.011, 0.005]); }
      }
      return g;
    },
    'b-rain': d => {
      const g = grp(d.body), m = new THREE.MeshPhysicalMaterial({ color: 0xf2a600, roughness: 0.38, clearcoat: 0.35, clearcoatRoughness: 0.3, side: DS });
      const z0 = -0.4, z1 = 0.335, wrap = 0.42, k = 1.12;
      mesh(shell(d, z0, z1, wrap, k), m, g);
      mesh(hem(d, z0, z1, wrap, k, 0.008), std(0xe0a40e, { roughness: 0.4 }), g);
      mesh(shell(d, -0.3, -0.26, 0.25, k + 0.006, 2, 24), std(0xdfe3e8, { roughness: 0.3, metalness: 0.4, emissive: 0x2a2a2a, side: DS }), g); // reflective strip
      // the hood, folded down behind his neck
      mesh(new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), m, g, [0, topY(d, 0.25, k) - 0.012, 0.235], [-0.55, 0, 0], [0.074, 0.036, 0.062]);
      return g;
    },
    'b-vest': d => {
      const g = grp(d.body), m = std(0xff6d00, { roughness: 0.55, side: DS }), strap = std(0x1a1a1a, { roughness: 0.6, side: DS });
      const z0 = -0.07, z1 = 0.33, wrap = 0.95, k = 1.24;
      mesh(shell(d, z0, z1, wrap, k), m, g);
      mesh(hem(d, z0, z1, wrap, k, 0.016), m, g);
      [0.02, 0.2].forEach(z => mesh(girth(d, z, 0.013, k + 0.025, 1.06, wrap), strap, g));
      mesh(new THREE.TorusGeometry(0.034, 0.008, 8, 16, Math.PI), strap, g, [0, topY(d, 0.12, k) + 0.002, 0.12], [0, Math.PI / 2, 0]);
      const tape = std(0xdfe3e8, { roughness: 0.3, metalness: 0.4, emissive: 0x333333, side: DS }); // reflective patches on both sides
      [[0.3, 0.7], [Math.PI - 0.7, Math.PI - 0.3]].forEach(([a0, a1]) => mesh(shell(d, 0.08, 0.15, 0, k + 0.006, 2, 6, a0, a1), tape, g));
      return g;
    },
    'b-sweater': d => {
      const g = grp(d.body), m = std(0xffffff, { map: sweaterTex(), roughness: 0.95, side: DS }), rib = std(0xf3ede4, { roughness: 1 });
      const z0 = -0.36, z1 = 0.33, wrap = 0.46, k = 1.13;
      mesh(shell(d, z0, z1, wrap, k), m, g);
      mesh(hem(d, z0, z1, wrap, k, 0.011), rib, g);
      // turtleneck
      mesh(loft([{ p: [0, -0.078, -0.078], w: 0.104, h: 0.122 }, { p: [0, -0.02, -0.018], w: 0.1, h: 0.112 }, { p: [0, 0.028, 0.028], w: 0.095, h: 0.104 }], { seg: 24 }), m, d.neck).userData.wardrobe = true;
      return g;
    },
    'b-pumpkin': d => {
      const g = grp(d.body), m = std(0xffffff, { map: pumpkinTex(), roughness: 0.55, side: DS });
      // a round, ribbed pumpkin with the legs out the bottom
      const segZ = 22, segA = 40, wrap = 0.78, pos = [], uv = [], idx = [], zc = -0.03, rz = 0.45, yc = 0.0;
      for (let i = 0; i <= segZ; i++) {
        const t = i / segZ, z = zc - rz + 2 * rz * t, e = Math.sqrt(Math.max(0.02, 1 - ((z - zc) / rz) ** 2));
        for (let j = 0; j <= segA; j++) {
          const u = j / segA, a = -wrap + (Math.PI + 2 * wrap) * u, rib = 0.93 + 0.07 * Math.abs(Math.cos(a * 4.5));
          pos.push(Math.cos(a) * 0.2 * e * rib, yc + Math.sin(a) * 0.2 * e * rib, z); uv.push(u, t);
        }
      }
      for (let i = 0; i < segZ; i++) for (let j = 0; j < segA; j++) { const a = i * (segA + 1) + j, b = a + segA + 1; idx.push(a, b, a + 1, a + 1, b, b + 1); }
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(idx); geo.computeVertexNormals();
      mesh(geo, m, g);
      const green = std(0x3f7d3a, { roughness: 0.8 });
      mesh(new THREE.CylinderGeometry(0.012, 0.018, 0.05, 10), std(0x6b5a2a, { roughness: 0.9 }), g, [0, yc + 0.215, zc], [0.2, 0, 0.15]);
      mesh(SPH, green, g, [0.03, yc + 0.205, zc + 0.02], [0, 0.6, 0.35], [0.035, 0.004, 0.018]);
      return g;
    },
    'b-hotdog': d => {
      const g = grp(d.body), bun = std(0xdca15c, { roughness: 0.85 }), dog = std(0xb4432a, { roughness: 0.42 }), mustard = std(0xffd21a, { roughness: 0.5 });
      const zs = []; for (let i = 0; i <= 14; i++) zs.push(-0.46 + i / 14 * 0.84);
      [-1, 1].forEach(s => mesh(loft(zs.map((z, i) => { const [yc, w] = d.prof(Math.min(0.3, Math.max(-0.4, z))), e = Math.max(0.3, Math.sqrt(Math.sin(Math.PI * i / 14))); return { p: [s * (w * 0.98 + 0.03), yc + 0.01, z], w: 0.05 * e, h: 0.085 * e }; })), bun, g));
      const top = z => topY(d, Math.min(0.3, Math.max(-0.4, z)), 1.06) + 0.035;
      const zz = []; for (let i = 0; i <= 16; i++) zz.push(-0.54 + i / 16 * 1.02);
      mesh(loft(zz.map((z, i) => { const e = Math.max(0.25, Math.sqrt(Math.sin(Math.PI * i / 16))); return { p: [0, top(z), z], w: 0.056 * e, h: 0.046 * e }; })), dog, g);
      const pts = []; for (let i = 0; i <= 40; i++) { const t = i / 40, z = -0.42 + t * 0.78; pts.push(new V3(Math.sin(t * Math.PI * 9) * 0.032, top(z) + 0.043, z)); }
      mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 120, 0.0065, 6, false), mustard, g);
      return g;
    },
    'b-cape': d => {
      const g = grp(d.body), m = std(0xffffff, { map: capeTex(), roughness: 0.6, side: DS });
      const NU = 10, NV = 16, base = [], pos = [], uv = [], idx = [];
      for (let i = 0; i <= NV; i++) {
        const v = i / NV, z = 0.3 - v * 0.86, zp = Math.max(-0.38, z), [yc, w, h] = d.prof(zp), hang = Math.max(0, -0.38 - z);
        const W = Math.max(w, 0.1) * 1.1, H = Math.max(h, 0.1) * 1.1, spread = 0.55 + 0.7 * Math.min(1, v / 0.4);
        for (let j = 0; j <= NU; j++) {
          const u = j / NU * 2 - 1, a = Math.PI / 2 - u * spread;
          base.push(Math.cos(a) * W * (1 + clearance(zp) * Math.cos(a) ** 2), yc + Math.sin(a) * H, z, v, hang);
          pos.push(0, 0, 0); uv.push((u + 1) / 2, v);
        }
      }
      for (let i = 0; i < NV; i++) for (let j = 0; j < NU; j++) { const a = i * (NU + 1) + j, b = a + NU + 1; idx.push(a, b, a + 1, a + 1, b, b + 1); }
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(idx);
      const cape = mesh(geo, m, g); cape.name = 'cape'; cape.frustumCulled = false;
      const P = geo.attributes.position;
      let lift = 0;
      // the cloth falls behind him at rest and streams out when he runs
      const tick = dt => {
        lift += (Math.min(1, d.speed / 6) - lift) * Math.min(1, dt * 4);
        const t = d.t;
        for (let k = 0; k < P.count; k++) {
          const x = base[k * 5], y = base[k * 5 + 1], z = base[k * 5 + 2], v = base[k * 5 + 3], hg = base[k * 5 + 4];
          const wave = Math.sin(t * (6 + lift * 8) - v * 7) * (0.004 + 0.018 * lift) * v;
          P.setXYZ(k, x * (1 + 0.12 * lift * v), y - hg * (1.25 * (1 - lift) + 0.15) + hg * lift * 0.3 + wave, z - hg * lift * 0.35);
        }
        P.needsUpdate = true; geo.computeVertexNormals();
      };
      tick(0);
      // tied at the neck with a gold clasp
      const nk = grp(d.neck, [0, 0.0, 0.0]); nk.rotation.x = 0.78; nk.userData.wardrobe = true;
      mesh(strapRing(0.09, 0.1, 0.02, 0.004), m, nk);
      mesh(SPH, std(0xffcc33, { metalness: 0.8, roughness: 0.3 }), nk, [0, 0, 0.104], null, [0.012, 0.012, 0.008]);
      g.userData.tick = tick;
      return g;
    },
  };
  // a triangle scarf: a band just under the collar, and a point that hangs over his chest
  function bandana(d, mat) {
    const f = d.collarFit, th = f.tilt, cs = Math.cos(th), sn = Math.sin(th);
    const c = new V3(0, f.y - 0.022 * cs, f.z - 0.022 * sn), W = f.w + 0.008, H = f.h + 0.008;
    const toNeck = (x, z) => new V3(x, c.y - z * sn, c.z + z * cs);
    const g = grp(d.neck);
    mesh(strapRing(W, H, 0.024, 0.004), mat, g, [c.x, c.y, c.z], [th, 0, 0]);
    const apex = toNeck(0, H + 0.004).add(new V3(0, -0.088, 0.006));
    const NA = 16, NT = 8, pos = [], uv = [], idx = [];
    for (let i = 0; i <= NT; i++) {
      const t = i / NT;
      for (let j = 0; j <= NA; j++) {
        const u = j / NA, a = (0.06 + u * 0.88) * Math.PI;
        const p = toNeck(Math.cos(a) * (W + 0.004), Math.sin(a) * (H + 0.004)).lerp(apex, t);
        p.z += Math.sin(Math.PI * t) * 0.016 * Math.sin(a); // it billows out a little over the chest
        pos.push(p.x, p.y, p.z); uv.push(u, t);
      }
    }
    for (let i = 0; i < NT; i++) for (let j = 0; j < NA; j++) { const a = i * (NA + 1) + j, b = a + NA + 1; idx.push(a, b, a + 1, a + 1, b, b + 1); }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(idx); geo.computeVertexNormals();
    mesh(geo, mat, g);
    return g;
  }
  // with these on, the leash clips to the collar instead (or sits a little higher on the back)
  const RING = { 'b-rain': 0.014, 'b-vest': 0.044, 'b-sweater': 0.014, 'b-cape': 0.014, 'b-pumpkin': 'collar', 'b-hotdog': 'collar' };

  function dress(d, outfit) {
    const o = Object.assign({}, DEFAULT, outfit);
    // take off the old clothes
    const old = [];
    [d.body, d.neck, d.head].forEach(p => p.children.forEach(c => { if (c.userData.wardrobe) old.push(c); }));
    old.forEach(c => { c.parent.remove(c); c.traverse(m => { if (m.isMesh) { m.geometry.dispose(); m.material.dispose(); } }); });
    const ticks = [];
    // collar and harness are recolored in place
    const col = item(o.collar); if (col && col.color !== undefined) d.slots.collar.forEach(m => m.material.color.setHex(col.color));
    const har = item(o.harness), coat = o.body !== 'b-none', showH = !!(har && har.color !== undefined) && !coat;
    d.slots.harness.forEach(m => { m.visible = showH; if (showH && m.material.userData.slot === 'harness') m.material.color.setHex(har.color); });
    // leash ring: on the harness, or on the back of the collar
    const ring = d.body.getObjectByName('leashRing') || d.neck.getObjectByName('leashRing');
    if (ring && d.ringHome) {
      const r = RING[o.body], toCollar = r === 'collar' || (!showH && !coat), f = d.collarFit;
      ring.parent.remove(ring);
      if (toCollar) { d.neck.add(ring); ring.position.set(0, f.y + Math.sin(f.tilt) * (f.h + 0.012), f.z - Math.cos(f.tilt) * (f.h + 0.012)); ring.rotation.set(0, Math.PI / 2, 0); }
      else { d.body.add(ring); ring.position.copy(d.ringHome); ring.position.y += typeof r === 'number' ? r : 0; ring.rotation.set(0, 0, 0); }
    }
    d.collarFit.tag.visible = o.neck !== 'n-bowtie';
    ['neck', 'head', 'body'].forEach(s => {
      const b = BUILD[o[s]]; if (!b) return;
      const g = b(d); g.userData.wardrobe = true;
      if (g.userData.tick) ticks.push(g.userData.tick);
      mergeStatic(g);
    });
    d.outfitTick = ticks.length ? dt => ticks.forEach(t => t(dt)) : null;
    d.outfit = o;
    return o;
  }

  return { SLOTS, ITEMS, DEFAULT, BALL_CHAPTERS, item, unlocked, hint, unlockedIds, sanitize, dress };
})();
