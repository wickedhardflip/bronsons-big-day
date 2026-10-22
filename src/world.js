// The neighborhood: home, trail, dog park and the lake, with the Lake Haigler trail all the way around it.
// Rendering: physical sky (Preetham) with image-based lighting, planar-reflection water, splat-textured
// terrain, wind-blown instanced grass around the player, leaf-card trees and soft billboard clouds.
const World = (() => {
  const { std, mesh, grp, canvas, toTex, canvasTex, normalFrom } = Models;
  const V3 = THREE.Vector3;
  const WL = -0.35; // water level
  const P = {
    house: { x0: -7, x1: 7, z0: 70, z1: 80 },
    yard: { x0: -22, x1: 22, z0: 46, z1: 92 },
    bed: new V3(9, 0, 58),
    gate: new V3(0, 0, 46),
    park: { x0: 30, x1: 66, z0: -36, z1: -6, gateZ: -21 },
    dock: { x0: -1.7, x1: 1.7, z0: -110, z1: -82, y: 0.32 },
    lake: { cx: 0, cz: -142, rx: 82, rz: 56 },
    bounds: { x0: -112, x1: 112, z0: -134, z1: 108 },
    raceBounds: { x0: -116, x1: 96, z0: -234, z1: -58 },
    picnic: new V3(-26, 0, -30),
    blind: new V3(-17, 0, -81.6),
    duckStand: new V3(-14, 0, -84.2),
    // around Lake Haigler: the campground on the west shore, the kayak center and the Gateway Canteen by the start line
    camp: new V3(-88, 0, -86),
    kayak: new V3(59, 0, -99),
    kayakShed: new V3(65, 0, -87.5),
    canteen: new V3(51, 0, -70.5),
  };
  P.farHouses = [];
  P.dockEnd = new V3(0, P.dock.y, -107);
  P.parkGate = new V3(P.park.x0 + 2, 0, P.park.gateZ);
  P.parkThrow = new V3(37, 0, -21);

  // seeded random so the world looks the same every visit
  let seed = 20261021;
  const rand = () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const rnd = (a, b) => a + rand() * (b - a);
  // a second stream for everything added with the Lake Haigler trail, so the older scenery keeps its layout
  let seed2 = 70319;
  const rand2 = () => { seed2 |= 0; seed2 = seed2 + 0x6D2B79F5 | 0; let t = Math.imul(seed2 ^ seed2 >>> 15, 1 | seed2); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const rnd2 = (a, b) => a + rand2() * (b - a);

  const pathPts = [[0, 47], [-5, 32], [-13, 14], [-9, -6], [5, -22], [13, -38], [7, -58], [1, -72], [0, -81]].map(p => new V3(p[0], 0, p[1]));
  const branchPts = [[5, -22], [16, -21], [P.park.x0 + 1, -21]].map(p => new V3(p[0], 0, p[1]));
  const pathCurve = new THREE.CatmullRomCurve3(pathPts);
  const branchCurve = new THREE.CatmullRomCurve3(branchPts);
  const pathSamples = pathCurve.getSpacedPoints(220).concat(branchCurve.getSpacedPoints(40));

  const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  function distPath(x, z) {
    let best = 1e9;
    for (let i = 0; i < pathSamples.length; i++) { const p = pathSamples[i], dx = p.x - x, dz = p.z - z, d = dx * dx + dz * dz; if (d < best) best = d; }
    return Math.sqrt(best);
  }
  const rectDist = (r, x, z, pad = 0) => { const dx = Math.max(r.x0 - pad - x, 0, x - r.x1 - pad), dz = Math.max(r.z0 - pad - z, 0, z - r.z1 - pad); return Math.hypot(dx, dz); };
  const lakeE = (x, z) => Math.sqrt(((x - P.lake.cx) / P.lake.rx) ** 2 + ((z - P.lake.cz) / P.lake.rz) ** 2);
  // the shoreline field: the lake ellipse with its cove and arms, cut off by the dam on the east shore
  // (1 = the edge of the beach, below 1 is water); below the dam the ground is dry valley, not lake bed
  const D = Course.DAM, WATER_X1 = D.weir;
  function lakeField(x, z) {
    const e = Course.shoreE(x, z);
    if (x < D.x1 - 1 || e > 1.6) return e;
    const dz = Math.abs(z - D.cz), span = 1 - smooth(D.half, D.half + 8, dz);
    return span > 0 ? e + (1.4 - e) * span * smooth(D.x1 - 1, D.x1 + 1.5, x) : e;
  }
  const lerp = (a, b, k) => a + (b - a) * k;
  // where the lake's water is: the shoreline field, plus the spillway channel through the dam (which the field leaves dry)
  function waterE(x, z) {
    if (x >= WATER_X1) return 2;
    const e = lakeField(x, z);
    return Math.abs(z - D.cz) < D.notch && x > D.x0 - 4 ? Math.min(e, 0.9) : e;
  }
  // the water surface over a spot: the lake, the creek below the dam, or nothing (-1e9)
  const CREEK_WL = D.creekY + 0.13;
  function waterAt(x, z) {
    if (x < WATER_X1) return waterE(x, z) < 1.02 ? WL : -1e9;
    return Math.abs(z - D.cz) < D.creekHalf + 1.5 ? CREEK_WL : -1e9;
  }

  function terrainH(x, z, dp) {
    let h = Math.sin(x * 0.045) * Math.cos(z * 0.038) * 1.6 + Math.sin(x * 0.11 + z * 0.07) * 0.5 + Math.cos(z * 0.09 - x * 0.03) * 0.6;
    h += 0.6;
    if (dp === undefined) dp = distPath(x, z);
    const cn = Course.near(x, z), dc = cn.d;
    let flat = smooth(3, 14, dp);
    flat = Math.min(flat, smooth(2, 14, rectDist(P.yard, x, z)), smooth(2, 12, rectDist(P.park, x, z)), smooth(6, 18, Math.hypot(x - P.picnic.x, z - P.picnic.z)), smooth(2.5, 11, dc),
      smooth(7, 16, Math.hypot(x - P.canteen.x, z - P.canteen.z)), smooth(9, 18, Math.hypot(x - P.camp.x, z - P.camp.z)), smooth(5, 12, Math.hypot(x - P.kayakShed.x, z - P.kayakShed.z)));
    h *= flat;
    // rolling hills beyond the play bounds, and a ridge south of the lake; the trail cuts through them
    const ex = Math.max(0, Math.abs(x) - 100), ez = Math.max(0, z - 96), es = Math.max(0, -218 - z);
    h += (Math.min(14, (ex * ex + ez * ez) * 0.02) + 15 * smooth(0, 30, es)) * smooth(4, 26, dc);
    // the trail's own hills
    if (dc < 26) h += Course.lift(cn.s) * (1 - smooth(5, 24, dc));
    // lake basin (with the cove and the two arms)
    const e = lakeField(x, z);
    const shore = smooth(1.12, 0.92, e);
    h = h * (1 - shore) + (-0.1) * shore;
    h -= smooth(1.0, 0.6, e) * 2.6;
    // the dam: an earth embankment with a flat crest (the trail runs along it), the spillway notch through it,
    // and the creek valley below the weir
    const dz = Math.abs(z - D.cz);
    if (x > D.x0 - 4 && dz < D.half + 9) {
      const span = 1 - smooth(D.half, D.half + 8, dz);
      const prof = x < D.x1 ? D.crest - (D.x1 - x) * 0.27 : x <= D.x2 ? D.crest : D.crest - (x - D.x2) * 0.42;
      h = Math.max(h, prof - (1 - span) * 3);
      if (x < D.weir) { const k = smooth(D.notch + 0.4, D.notch, dz) * smooth(D.x0 - 3, D.x0, x); h = lerp(h, Math.min(h, D.notchY), k); }
      else h = Math.min(h, lerp(D.notchY, D.creekY, smooth(D.weir, D.weir + 0.3, x)) + Math.max(0, dz - D.creekHalf) * 0.9);
    }
    return h;
  }

  // sampled height grid for fast lookups
  const G = { n: 401, ox: -200, oz: -270, data: null };
  function buildGrid() {
    G.data = new Float32Array(G.n * G.n);
    for (let j = 0; j < G.n; j++) for (let i = 0; i < G.n; i++) G.data[j * G.n + i] = terrainH(G.ox + i, G.oz + j);
  }
  function groundH(x, z) {
    const fx = x - G.ox, fz = z - G.oz;
    const i = Math.max(0, Math.min(G.n - 2, Math.floor(fx))), j = Math.max(0, Math.min(G.n - 2, Math.floor(fz)));
    const tx = Math.min(1, Math.max(0, fx - i)), tz = Math.min(1, Math.max(0, fz - j));
    const a = G.data[j * G.n + i], b = G.data[j * G.n + i + 1], c = G.data[(j + 1) * G.n + i], d = G.data[(j + 1) * G.n + i + 1];
    let h = a + (b - a) * tx + (c - a) * tz + (a - b - c + d) * tx * tz;
    const K = P.dock;
    if (x > K.x0 && x < K.x1 && z > K.z0 && z < K.z1) h = Math.max(h, K.y);
    return Math.max(h, Course.deckH(x, z)); // the trail's bridges
  }

  const M = (x, y, z, sx = 1, sy = 1, sz = 1, ry = 0, rx = 0) => new THREE.Matrix4().compose(new V3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, 0)), new V3(sx, sy, sz));
  const colliders = { circles: [], segs: [], boxes: [] };
  let scene, renderer, camera, tier, sun, hemi, sky, envSky, envScene, pmrem, envRT, stars, water, clouds = [], lampGlows = [], windowMats = [], fireflyPts, motes, boat;
  const swayers = []; // grass-like materials that need the time uniform

  function glowTex() {
    return canvasTex(64, 64, (g) => { const r = g.createRadialGradient(32, 32, 0, 32, 32, 32); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.25, 'rgba(255,255,255,0.6)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 64, 64); });
  }

  // ================= procedural textures =================
  // draw at (x, y) and at the wrapped copies that overlap the canvas, so textures tile seamlessly
  function wrapDraw(w, h, x, y, m, fn) {
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      const X = x + dx * w, Y = y + dy * h;
      if (X < -m || X > w + m || Y < -m || Y > h + m) continue;
      fn(X, Y);
    }
  }
  // tileable value noise in 0..1
  function valueNoise(n, base, octaves) {
    const out = new Float32Array(n * n); let amp = 1, tot = 0;
    for (let o = 0; o < octaves; o++) {
      const g = base << o, lat = new Float32Array(g * g).map(() => rand());
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
        const fx = x / n * g, fy = y / n * g, ix = Math.floor(fx), iy = Math.floor(fy), tx = fx - ix, ty = fy - iy;
        const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
        const a = lat[iy * g + ix], b = lat[iy * g + (ix + 1) % g], c = lat[((iy + 1) % g) * g + ix], d = lat[((iy + 1) % g) * g + (ix + 1) % g];
        out[y * n + x] += amp * (a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy);
      }
      tot += amp; amp *= 0.5;
    }
    for (let i = 0; i < out.length; i++) out[i] /= tot;
    return out;
  }
  function noiseCanvas(n, base, oct, f) {
    const nz = valueNoise(n, base, oct);
    return canvas(n, n, (g) => { const img = g.createImageData(n, n), d = img.data; for (let i = 0; i < n * n; i++) { const [r, gg, b] = f(nz[i], i); d[i * 4] = r; d[i * 4 + 1] = gg; d[i * 4 + 2] = b; d[i * 4 + 3] = 255; } g.putImageData(img, 0, 0); });
  }
  function grassCanvas() {
    const n = 512;
    const c = noiseCanvas(n, 4, 4, v => [58 + v * 40, 92 + v * 48, 34 + v * 20]);
    const g = c.getContext('2d');
    for (let i = 0; i < 17000; i++) {
      const x = rand() * n, y = rand() * n, len = 5 + rand() * 12, a = -Math.PI / 2 + (rand() - 0.5) * 1.1;
      g.strokeStyle = `hsla(${72 + rand() * 42},${32 + rand() * 30}%,${20 + rand() * 26}%,0.8)`; g.lineWidth = 0.8 + rand() * 1.5;
      wrapDraw(n, n, x, y, len, (X, Y) => { g.beginPath(); g.moveTo(X, Y); g.lineTo(X + Math.cos(a) * len, Y + Math.sin(a) * len); g.stroke(); });
    }
    for (let i = 0; i < 260; i++) { const x = rand() * n, y = rand() * n; g.fillStyle = `hsla(${50 + rand() * 15},45%,${45 + rand() * 15}%,0.5)`; wrapDraw(n, n, x, y, 4, (X, Y) => { g.beginPath(); g.arc(X, Y, 1 + rand() * 2, 0, 7); g.fill(); }); }
    return c;
  }
  function dirtCanvas() {
    const n = 512;
    const c = noiseCanvas(n, 6, 5, v => [118 + v * 50, 92 + v * 40, 64 + v * 30]);
    const g = c.getContext('2d');
    for (let i = 0; i < 9000; i++) { const x = rand() * n, y = rand() * n, k = rand(); g.fillStyle = k < 0.5 ? `rgba(60,44,30,${0.25 + rand() * 0.3})` : `rgba(190,165,130,${0.2 + rand() * 0.3})`; g.fillRect(x, y, 1 + rand() * 1.5, 1 + rand() * 1.5); }
    for (let i = 0; i < 420; i++) {
      const x = rand() * n, y = rand() * n, r = 1.5 + rand() * 4.5, sh = 105 + rand() * 70;
      wrapDraw(n, n, x, y, r + 2, (X, Y) => {
        g.fillStyle = 'rgba(40,30,22,0.45)'; g.beginPath(); g.ellipse(X + 1, Y + 1.2, r, r * 0.75, 0, 0, 7); g.fill();
        g.fillStyle = `rgb(${sh},${sh * 0.92},${sh * 0.82})`; g.beginPath(); g.ellipse(X, Y, r, r * 0.75, 0, 0, 7); g.fill();
        g.fillStyle = 'rgba(255,255,255,0.25)'; g.beginPath(); g.ellipse(X - r * 0.3, Y - r * 0.3, r * 0.4, r * 0.25, 0, 0, 7); g.fill();
      });
    }
    return c;
  }
  function sandCanvas() {
    const n = 512;
    const c = noiseCanvas(n, 8, 4, v => [166 + v * 28, 147 + v * 26, 112 + v * 22]);
    const g = c.getContext('2d');
    for (let i = 0; i < 26000; i++) { const x = rand() * n, y = rand() * n; g.fillStyle = rand() < 0.5 ? 'rgba(105,88,62,0.35)' : 'rgba(236,226,204,0.35)'; g.fillRect(x, y, 1, 1); }
    for (let i = 0; i < 70; i++) { const x = rand() * n, y = rand() * n; g.fillStyle = 'rgba(245,240,228,0.8)'; g.beginPath(); g.ellipse(x, y, 2 + rand() * 2, 1 + rand(), rand() * 3, 0, 7); g.fill(); }
    return c;
  }
  function mudCanvas() {
    return noiseCanvas(256, 6, 4, v => [92 + v * 34, 80 + v * 28, 58 + v * 22]);
  }

  // ================= terrain =================
  const TER = { x0: -200, z0: -270, size: 400 };
  let mask = null; // { n, d } splat weights: r dirt, g sand, b mud
  function buildMask(n) {
    const k = n / TER.size, X = x => (x - TER.x0) * k, Z = z => (z - TER.z0) * k;
    const c = canvas(n, n, (g) => {
      g.fillStyle = '#000'; g.fillRect(0, 0, n, n);
      g.globalCompositeOperation = 'lighter'; g.lineCap = 'round'; g.lineJoin = 'round';
      const stroke = (pts, width, a) => { g.strokeStyle = `rgba(255,0,0,${a})`; g.lineWidth = width * k; g.beginPath(); pts.forEach((p, i) => i ? g.lineTo(X(p.x), Z(p.z)) : g.moveTo(X(p.x), Z(p.z))); g.stroke(); };
      const trail = pathCurve.getSpacedPoints(400), branch = branchCurve.getSpacedPoints(60);
      [[4.2, 0.18], [3.4, 0.25], [2.8, 0.35], [2.2, 0.5]].forEach(([w, a]) => { stroke(trail, w, a); stroke(branch, w * 0.9, a); });
      // walkway from the gate to the porch, house footprint, worn spots in the park and at the picnic spot
      stroke([new V3(0, 0, P.yard.z0), new V3(0, 0, P.house.z0 - 3)], 1.8, 0.85);
      g.fillStyle = 'rgba(255,0,0,1)'; g.fillRect(X(P.house.x0 - 0.3), Z(P.house.z0 - 3.2), (P.house.x1 - P.house.x0 + 0.6) * k, (P.house.z1 - P.house.z0 + 3.5) * k);
      const blot = (x, z, r, a) => { const gr = g.createRadialGradient(X(x), Z(z), 0, X(x), Z(z), r * k); gr.addColorStop(0, `rgba(255,0,0,${a})`); gr.addColorStop(1, 'rgba(255,0,0,0)'); g.fillStyle = gr; g.beginPath(); g.arc(X(x), Z(z), r * k, 0, 7); g.fill(); };
      blot(P.parkThrow.x, P.parkThrow.z, 4, 0.7); blot(P.parkGate.x + 2, P.parkGate.z, 3.5, 0.6); blot(58, -30, 3, 0.5); blot(P.park.x1 - 3, -8, 2.5, 0.6); blot(P.bed.x, P.bed.z, 2.2, 0.6);
      blot(P.blind.x + 1, P.blind.z - 1, 4, 0.5);
      // the Lake Haigler trail, a worn patch at the start line, the campground and the kayak center
      const lap = Course.S.concat([Course.S[0]]);
      [[4.0, 0.18], [3.2, 0.25], [2.6, 0.35], [2.0, 0.5]].forEach(([w, a]) => stroke(lap, w, a));
      blot(Course.START.x + 2, Course.START.z + 5, 9, 0.55); blot(P.camp.x, P.camp.z, 8, 0.5); blot(P.kayak.x, P.kayak.z, 6, 0.45);
    });
    const g = c.getContext('2d'), img = g.getImageData(0, 0, n, n), d = img.data;
    // shore sand and underwater mud from the shoreline field (lake, cove, arms); the creek bed below the dam is mud too
    const i0 = Math.max(0, Math.floor(X(-112))), i1 = n, j0 = Math.max(0, Math.floor(Z(-215))), j1 = Math.min(n, Math.ceil(Z(-72)));
    for (let j = j0; j < j1; j++) for (let i = i0; i < i1; i++) {
      const x = TER.x0 + (i + 0.5) / k, z = TER.z0 + (j + 0.5) / k, w = Math.sin(x * 0.7) * Math.cos(z * 0.6) * 0.012;
      let sand, mud;
      if (x > D.weir) { const dz = Math.abs(z - D.cz); mud = smooth(D.creekHalf + 1.2, D.creekHalf - 0.5, dz); sand = smooth(D.creekHalf + 3, D.creekHalf + 1, dz) * (1 - mud) * 0.7; }
      else { const e = lakeField(x, z), top = 1.03 + 0.14 * smooth(-116, -100, z); sand = smooth(top, top - 0.1, e + w) * (1 - smooth(0.95, 0.88, e)); mud = smooth(0.95, 0.86, e + w); } // the wide swim beach is on the north shore; elsewhere the woods come close
      const o = (j * n + i) * 4;
      d[o + 1] = Math.max(d[o + 1], sand * 255); d[o + 2] = Math.max(d[o + 2], mud * 255);
      if (mud > 0) d[o] = d[o] * (1 - mud);
    }
    g.putImageData(img, 0, 0);
    const t = toTex(c, null, false); t.anisotropy = 4;
    mask = { n, d, k, c, t, img };
    return t;
  }
  // leaf litter under the lake woods: soft patches of the dirt layer around each tree, which also thins the grass there
  function forestFloor(list) {
    const { n, k, d } = mask;
    list.forEach(([x, z, sc]) => {
      const X = (x - TER.x0) * k, Z = (z - TER.z0) * k, r = 3.8 * sc * k;
      for (let j = Math.max(0, Math.floor(Z - r)); j <= Math.min(n - 1, Math.ceil(Z + r)); j++) for (let i = Math.max(0, Math.floor(X - r)); i <= Math.min(n - 1, Math.ceil(X + r)); i++) {
        const q = 1 - Math.hypot(i - X, j - Z) / r; if (q > 0) { const o = (j * n + i) * 4; d[o] = Math.min(255, d[o] + 115 * Math.min(1, q * 1.6) * (1 - d[o + 2] / 255)); }
      }
    });
    mask.c.getContext('2d').putImageData(mask.img, 0, 0); mask.t.needsUpdate = true;
  }
  function maskAt(x, z) {
    const i = Math.floor((x - TER.x0) * mask.k), j = Math.floor((z - TER.z0) * mask.k);
    if (i < 0 || j < 0 || i >= mask.n || j >= mask.n) return [0, 0, 0];
    const o = (j * mask.n + i) * 4, d = mask.d; return [d[o] / 255, d[o + 1] / 255, d[o + 2] / 255];
  }

  function buildTerrain() {
    const maskTex = buildMask(tier === 'high' ? 2048 : 1024);
    const gC = grassCanvas(), dC = dirtCanvas(), sC = sandCanvas(), mC = mudCanvas();
    const rep = t => { t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; };
    const tex = { grass: rep(toTex(gC)), dirt: rep(toTex(dC)), sand: rep(toTex(sC)), mud: rep(toTex(mC)) };
    const macro = rep(toTex(noiseCanvas(256, 4, 5, v => [v * 255, v * 255, v * 255]), null, false));
    const nrm = normalFrom(dC, 2.2, [72, 72]);
    const W = TER.size, N = tier === 'high' ? 320 : 220;
    const tg = new THREE.PlaneGeometry(W, W, N, N); tg.rotateX(-Math.PI / 2); tg.translate(TER.x0 + W / 2, 0, TER.z0 + W / 2);
    const tp = tg.attributes.position;
    for (let i = 0; i < tp.count; i++) tp.setY(i, terrainH(tp.getX(i), tp.getZ(i)));
    tg.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.94, metalness: 0, normalMap: nrm, normalScale: new THREE.Vector2(0.7, 0.7) });
    mat.onBeforeCompile = sh => {
      Object.assign(sh.uniforms, { tMask: { value: maskTex }, tGrass: { value: tex.grass }, tDirt: { value: tex.dirt }, tSand: { value: tex.sand }, tMud: { value: tex.mud }, tMacro: { value: macro }, uTer: { value: new V3(TER.x0, TER.z0, TER.size) }, uYard: { value: new THREE.Vector4(P.yard.x0, P.yard.z0, P.yard.x1, P.yard.z1) } });
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP;').replace('#include <fog_vertex>', '#include <fog_vertex>\nvWP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP; uniform sampler2D tMask, tGrass, tDirt, tSand, tMud, tMacro; uniform vec3 uTer; uniform vec4 uYard;')
        .replace('#include <map_fragment>', `
          vec2 tuv = vec2((vWP.x - uTer.x) / uTer.z, 1.0 - (vWP.z - uTer.y) / uTer.z);
          vec3 msk = texture2D(tMask, tuv).rgb;
          vec2 wuv = vWP.xz * 0.25;
          float mac = texture2D(tMacro, vWP.xz * 0.013).r * 0.6 + texture2D(tMacro, vWP.xz * 0.0021).r * 0.4;
          vec3 cg = mix(sRGBToLinear(texture2D(tGrass, wuv)).rgb, sRGBToLinear(texture2D(tGrass, wuv * 0.21 + 0.37)).rgb, 0.4);
          cg *= mix(vec3(0.78, 0.74, 0.7), vec3(1.12, 1.12, 1.0), mac);
          float yard = step(uYard.x, vWP.x) * step(vWP.x, uYard.z) * step(uYard.y, vWP.z) * step(vWP.z, uYard.w);
          cg *= mix(1.0, 1.1 - 0.09 * step(0.5, fract(vWP.z / 6.0)), yard);
          vec3 cd = sRGBToLinear(texture2D(tDirt, wuv * 0.8)).rgb * mix(0.85, 1.1, mac);
          vec3 cs = sRGBToLinear(texture2D(tSand, wuv * 0.9)).rgb * mix(0.92, 1.05, mac);
          vec3 cm = sRGBToLinear(texture2D(tMud, wuv * 0.7)).rgb;
          vec3 tcol = mix(cg, cd, smoothstep(0.12, 0.8, msk.r + (mac - 0.5) * 0.35));
          tcol = mix(tcol, cs, smoothstep(0.08, 0.85, msk.g + (mac - 0.5) * 0.2));
          tcol = mix(tcol, cm, smoothstep(0.1, 0.9, msk.b));
          diffuseColor.rgb *= tcol;`)
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.55, msk.b);');
    };
    const ground = new THREE.Mesh(tg, mat); ground.receiveShadow = true; scene.add(ground);
    return { macro };
  }

  // ================= grass =================
  // A clump of curved, tapered blades. aH is the normalized blade height used for bending.
  function clumpGeo(blades, hMin, hMax, spread, wBase) {
    const pos = [], nor = [], hh = [], idx = [];
    for (let b = 0; b < blades; b++) {
      const a = rand() * Math.PI * 2, r = Math.sqrt(rand()) * spread, bx = Math.cos(a) * r, bz = Math.sin(a) * r;
      const h = hMin + rand() * (hMax - hMin), w = wBase * (0.8 + rand() * 0.5), face = rand() * Math.PI, lean = 0.15 + rand() * 0.35;
      const fx = Math.cos(face), fz = Math.sin(face), lx = -fz, lz = fx, segs = 4, base = pos.length / 3;
      for (let i = 0; i <= segs; i++) {
        const t = i / segs, ww = w * (1 - t * 0.92), off = lean * h * t * t, y = h * t * (1 - lean * 0.25 * t);
        const nx = lx * 0.6, nz = lz * 0.6;
        [-1, 1].forEach(s => { pos.push(bx + lx * off + fx * ww * s, y, bz + lz * off + fz * ww * s); nor.push(nx, 0.8, nz); hh.push(t); });
        if (i < segs) { const q = base + i * 2; idx.push(q, q + 1, q + 2, q + 1, q + 3, q + 2); }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('aH', new THREE.Float32BufferAttribute(hh, 1));
    g.setIndex(idx);
    return g;
  }
  // instanced field: aInst = (x, y, z, scale), aRot = rotation; wind and push are done in the vertex shader
  function grassField(base, count, colors, macro, opt = {}) {
    const g = new THREE.InstancedBufferGeometry();
    g.setIndex(base.index); ['position', 'normal', 'aH'].forEach(k => g.setAttribute(k, base.attributes[k]));
    const inst = new THREE.InstancedBufferAttribute(new Float32Array(count * 4), 4), rot = new THREE.InstancedBufferAttribute(new Float32Array(count), 1);
    if (opt.dynamic) inst.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < count; i++) rot.array[i] = rand() * Math.PI * 2;
    g.setAttribute('aInst', inst); g.setAttribute('aRot', rot); g.instanceCount = count;
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.82, side: THREE.DoubleSide });
    const U = { uTime: { value: 0 }, uCam: { value: new V3() }, uR: { value: opt.radius || 1e5 }, uPush: { value: new V3(1e5, 0, 1e5) }, uWind: { value: new THREE.Vector2(0.8, 0.6) }, uBase: { value: new THREE.Color(colors[0]) }, uTip: { value: new THREE.Color(colors[1]) }, tMacro: { value: macro }, uSway: { value: opt.sway || 1 }, uClear: { value: new THREE.Vector4(1e5, 1e5, 1e5, 1e5) } };
    mat.onBeforeCompile = sh => {
      Object.assign(sh.uniforms, U);
      sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>
        attribute vec4 aInst; attribute float aRot; attribute float aH;
        uniform float uTime, uR, uSway; uniform vec3 uCam, uPush, uBase, uTip; uniform vec2 uWind; uniform sampler2D tMacro; uniform vec4 uClear;
        varying vec3 vGC;`)
        .replace('#include <beginnormal_vertex>', `
          float gc = cos(aRot), gs = sin(aRot); mat2 gRot = mat2(gc, gs, -gs, gc);
          vec3 objectNormal = normal; objectNormal.xz = gRot * objectNormal.xz;
          objectNormal = normalize(mix(objectNormal, vec3(0.0, 1.0, 0.0), 0.5));`)
        .replace('#include <begin_vertex>', `
          vec3 transformed = position; transformed.xz = gRot * transformed.xz;
          float gd = distance(aInst.xz, uCam.xz);
          float gsc = aInst.w * (1.0 - smoothstep(uR * 0.7, uR * 0.97, gd));
          if (aInst.x > uClear.x && aInst.x < uClear.z && aInst.z > uClear.y && aInst.z < uClear.w) gsc = 0.0; // e.g. under the picnic blanket
          transformed.y *= gsc; transformed.xz *= mix(0.5, 1.0, clamp(gsc, 0.0, 1.0));
          float ht = aH * aH;
          float wv = sin(uTime * 1.6 + aInst.x * 0.21 + aInst.z * 0.13) * 0.55 + sin(uTime * 2.9 + aInst.x * 0.8 - aInst.z * 0.55) * 0.2 + 0.4;
          vec2 bendV = uWind * wv * 0.2 * uSway * ht * max(gsc, 0.3);
          vec2 pd = aInst.xz - uPush.xz; float pl = length(pd);
          bendV += pl < 0.95 ? pd / max(pl, 0.05) * (0.95 - pl) * 0.75 * ht : vec2(0.0);
          transformed.xz += bendV; transformed.y -= length(bendV) * 0.4 * aH;
          transformed += aInst.xyz;
          float mac = texture2D(tMacro, aInst.xz * 0.013).r;
          vGC = mix(uBase, uTip, aH) * mix(0.72, 1.22, mac) * (0.88 + fract(aRot * 7.31) * 0.24);`);
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vGC;')
        .replace('vec4 diffuseColor = vec4( diffuse, opacity );', 'vec4 diffuseColor = vec4( vGC, opacity );')
        .replace('#include <normal_fragment_begin>', 'vec3 normal = normalize( vNormal ); vec3 geometryNormal = normal;');
    };
    mat.customProgramCacheKey = () => 'grassfield';
    const m = new THREE.Mesh(g, mat); m.frustumCulled = false; m.receiveShadow = true; m.castShadow = false;
    m.layers.set(1); scene.add(m);
    swayers.push(U);
    return { mesh: m, inst, U, count };
  }
  let field = null;
  const reedOK = (x, z) => { const g = groundH(x, z); return g > WL - 0.4 && g < WL + 0.3 && Course.near(x, z).d > 3; };
  function buildGrass(macro) {
    const side = tier === 'high' ? 74 : 46, R = tier === 'high' ? 26 : 18, count = side * side;
    field = grassField(clumpGeo(tier === 'high' ? 9 : 8, 0.22, 0.5, 0.24, 0.018), count, [0x2c4a1a, 0x8db35a], macro, { radius: R, dynamic: true });
    field.R = R; field.base = new Float32Array(count * 2); field.amt = new Float32Array(count); field.cx = 1e9; field.cz = 1e9;
    const cell = 2 * R / side;
    for (let j = 0; j < side; j++) for (let i = 0; i < side; i++) { const k = j * side + i; field.base[k * 2] = (i + rand()) * cell; field.base[k * 2 + 1] = (j + rand()) * cell; field.amt[k] = 0.75 + rand() * 0.55; }
    // shoreline reeds and cattails (static, swaying)
    const reeds = [], reedG = clumpGeo(7, 0.8, 1.5, 0.18, 0.02);
    for (let i = 0; i < 2600 && reeds.length < 260; i++) {
      const a = rand() * Math.PI * 2, e = 0.93 + rand() * 0.07, x = P.lake.cx + Math.cos(a) * P.lake.rx * e, z = P.lake.cz + Math.sin(a) * P.lake.rz * e;
      if (z > -60 || (Math.abs(x) < 4.5 && z > -112) || (x > 4 && x < 9 && z > -105 && z < -95)) continue;
      if (x > 66 || !reedOK(x, z)) continue; // none on the dam, the trail or in deep water
      reeds.push([x, groundH(x, z) - 0.05, z, 0.8 + rand() * 0.5]);
    }
    // more along the banks of the cove and the two arms
    for (let i = 0; i < 1600 && reeds.length < 360; i++) {
      const I = Course.INLETS[i % 3], s = rnd2(0.15, 1) * I.len, k = s / I.len, q = (I.w0 + (I.w1 - I.w0) * k) * rnd2(0.8, 1.0) * (rand2() < 0.5 ? -1 : 1);
      const x = I.a.x + I.dir.x * s + I.n.x * q, z = I.a.z + I.dir.z * s + I.n.z * q;
      if (reedOK(x, z)) reeds.push([x, groundH(x, z) - 0.05, z, 0.8 + rand2() * 0.5]);
    }
    // a dense reed screen in front of Andy's duck blind
    for (let i = 0; i < 26; i++) { const x = P.blind.x - 2 + rand() * 4.5, z = P.blind.z - 1.6 - rand() * 0.8; reeds.push([x, groundH(x, z), z, 0.9 + rand() * 0.3]); }
    const rf = grassField(reedG, reeds.length, [0x3a4a22, 0x9a9a58], macro, { sway: 0.7 });
    reeds.forEach((r, i) => rf.inst.array.set(r, i * 4)); rf.inst.needsUpdate = true; rf.mesh.layers.set(0);
    // cattail heads on some reeds
    const heads = reeds.filter((r, i) => i % 3 === 0);
    const hm = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.035, 0.035, 0.22, 8), std(0x5a3a22, { roughness: 0.9 }), heads.length);
    heads.forEach((r, i) => hm.setMatrixAt(i, M(r[0] + 0.05, r[1] + 1.15 * r[3], r[2], 1, 1, 1)));
    hm.castShadow = true; hm.frustumCulled = false; scene.add(hm);
  }
  function updateGrass(focus) {
    if (!field) return;
    // centre the field a little ahead of the camera so blades are not wasted behind it
    const fx = focus.x + (focus.x - camera.position.x) * 0.9, fz = focus.z + (focus.z - camera.position.z) * 0.9;
    field.U.uCam.value.set(fx, 0, fz); field.U.uPush.value.copy(focus);
    if (Math.abs(fx - field.cx) < 0.6 && Math.abs(fz - field.cz) < 0.6) return;
    field.cx = fx; field.cz = fz;
    const R = field.R, R2 = 2 * R, a = field.inst.array, b = field.base, Y = P.yard, K = P.park;
    for (let i = 0; i < field.count; i++) {
      const x = fx + ((((b[i * 2] - fx + R) % R2) + R2) % R2) - R, z = fz + ((((b[i * 2 + 1] - fz + R) % R2) + R2) % R2) - R;
      const [md, ms, mm] = maskAt(x, z);
      let s = field.amt[i] * Math.max(0, 1 - md * 1.6 - ms * 2 - mm * 3);
      if (x > Y.x0 && x < Y.x1 && z > Y.z0 && z < Y.z1) s *= 0.5; // mowed lawn
      else if (x > K.x0 && x < K.x1 && z > K.z0 && z < K.z1) s *= 0.72;
      a[i * 4] = x; a[i * 4 + 1] = groundH(x, z) - 0.02; a[i * 4 + 2] = z; a[i * 4 + 3] = s;
    }
    field.inst.needsUpdate = true;
  }

  // ================= sky, light, water =================
  function buildSky() {
    hemi = new THREE.HemisphereLight(0xbfd6ff, 0x4d5a36, 0.25); scene.add(hemi);
    sun = new THREE.DirectionalLight(0xfff1d6, 2.2);
    sun.castShadow = true; const ms = tier === 'high' ? 4096 : 2048; sun.shadow.mapSize.set(ms, ms);
    const S = 28, sc = sun.shadow.camera; sc.left = -S; sc.right = S; sc.top = S; sc.bottom = -S; sc.near = 1; sc.far = 200;
    sun.shadow.bias = -0.00025; sun.shadow.normalBias = 0.025; sun.userData.texel = 2 * S / ms;
    scene.add(sun); scene.add(sun.target);
    sky = new THREE.Sky(); sky.scale.setScalar(1000); sky.renderOrder = -2; sky.frustumCulled = false; scene.add(sky);
    envScene = new THREE.Scene(); envSky = new THREE.Mesh(sky.geometry, sky.material); envSky.scale.setScalar(10); envScene.add(envSky);
    pmrem = new THREE.PMREMGenerator(renderer);
    // stars
    const sg = new THREE.BufferGeometry(), sp = [];
    for (let i = 0; i < 1600; i++) { const u = rand() * 2 * Math.PI, v = rand() * 0.9 + 0.08, r = 650; sp.push(Math.cos(u) * Math.sqrt(1 - v * v) * r, v * r, Math.sin(u) * Math.sqrt(1 - v * v) * r); }
    sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
    stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 2.0, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false }));
    stars.renderOrder = -1; scene.add(stars);
    scene.fog = new THREE.Fog(0xcfe2f5, 80, 380);
    // soft billboard clouds
    const puff = canvasTex(256, 256, (g) => {
      for (let i = 0; i < 28; i++) {
        const x = 128 + (rand() - 0.5) * 120, y = 140 + (rand() - 0.5) * 50 - Math.abs(x - 128) * 0.15, r = 30 + rand() * 45;
        const gr = g.createRadialGradient(x, y - r * 0.2, 0, x, y, r); gr.addColorStop(0, 'rgba(255,255,255,0.55)'); gr.addColorStop(0.6, 'rgba(244,246,250,0.25)'); gr.addColorStop(1, 'rgba(230,234,242,0)');
        g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
      }
    });
    // a few pre-composited cloud banks, one sprite each (one draw call per cloud)
    const banks = [0, 1, 2].map(() => canvasTex(512, 256, (g) => {
      for (let k = 0; k < 5; k++) { const cx = 90 + k * 82 + (rand() - 0.5) * 40, cy = 150 + (rand() - 0.5) * 30, sc = 0.8 + rand() * 0.6; g.save(); g.translate(cx, cy); g.scale(sc, sc * 0.8); g.drawImage(puff.image, -128, -140); g.restore(); }
    }));
    for (let i = 0; i < 22; i++) {
      const mat = new THREE.SpriteMaterial({ map: banks[i % 3], color: 0xffffff, transparent: true, opacity: 0.9, fog: false, depthWrite: false });
      const c = new THREE.Sprite(mat), w = rnd(170, 260); c.scale.set(w, w * rnd(0.42, 0.52), 1); c.position.set(rnd(-420, 420), rnd(90, 150), rnd(-460, 300)); scene.add(c);
      c.userData.v = rnd(1.2, 3); c.userData.mat = mat; clouds.push(c);
    }
  }
  function waterNormalsTex() {
    const n = 256, hgt = new Float32Array(n * n), waves = [];
    for (let i = 0; i < 14; i++) waves.push([Math.round(rnd(-9, 9)) || 1, Math.round(rnd(-9, 9)), rnd(0, 6.28), 1 / (1 + i * 0.35)]);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { let h = 0; waves.forEach(([a, b, ph, amp]) => { h += Math.sin((a * x + b * y) / n * Math.PI * 2 + ph) * amp; }); hgt[y * n + x] = h; }
    let lo = 1e9, hi = -1e9; hgt.forEach(v => { lo = Math.min(lo, v); hi = Math.max(hi, v); });
    const c = canvas(n, n, (g) => { const img = g.createImageData(n, n); for (let i = 0; i < n * n; i++) { const v = (hgt[i] - lo) / (hi - lo) * 255; img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v; img.data[i * 4 + 3] = 255; } g.putImageData(img, 0, 0); });
    return normalFrom(c, 6, [1, 1]);
  }
  function buildWater() {
    const size = tier === 'high' ? 1024 : 512;
    // the plane stops at the weir: below the dam is the creek, which has its own water
    const LB = { x0: -122, z0: -216, w: WATER_X1 + 122, h: 140 };
    const geo = new THREE.PlaneGeometry(LB.w, LB.h);
    water = new THREE.Water(geo, { textureWidth: size, textureHeight: size, waterNormals: waterNormalsTex(), sunDirection: new V3(0.5, 0.6, 0.3).normalize(), sunColor: 0xffffff, waterColor: 0x1f3a33, distortionScale: 1.6, fog: true, alpha: 0.97 });
    water.rotation.x = -Math.PI / 2; water.position.set(LB.x0 + LB.w / 2, WL, LB.z0 + LB.h / 2);
    const u = water.material.uniforms; u.size.value = 5.5; u.lake.value.set(P.lake.cx, P.lake.cz, P.lake.rx, P.lake.rz); u.shallowColor.value.set(0x8a7a55);
    // bake the shoreline (with the cove, the arms and the spillway channel) into a small map for the shader
    const mw = 512, mh = Math.round(mw * LB.h / LB.w), md = new Uint8Array(mw * mh * 4);
    for (let j = 0; j < mh; j++) for (let i = 0; i < mw; i++) {
      const e = waterE(LB.x0 + (i + 0.5) / mw * LB.w, LB.z0 + (j + 0.5) / mh * LB.h), o = (j * mw + i) * 4;
      md[o] = md[o + 1] = md[o + 2] = Math.round(Math.max(0, Math.min(1, (e - 0.7) / 0.5)) * 255); md[o + 3] = 255;
    }
    const lm = new THREE.DataTexture(md, mw, mh, THREE.RGBAFormat); lm.magFilter = lm.minFilter = THREE.LinearFilter; lm.needsUpdate = true;
    u.lakeMap.value = lm; u.lakeBox.value.set(LB.x0, LB.z0, LB.w, LB.h);
    water.material.transparent = true; water.receiveShadow = true;
    scene.add(water);
  }

  // ================= trees, bushes, rocks, flowers =================
  function leafCanvas(hue0, light0) {
    return canvas(512, 512, (g) => {
      g.strokeStyle = 'rgba(80,60,40,0.9)'; g.lineWidth = 3;
      for (let i = 0; i < 7; i++) { const a = rand() * 6.28; g.beginPath(); g.moveTo(256, 256); g.quadraticCurveTo(256 + Math.cos(a + 0.4) * 90, 256 + Math.sin(a + 0.4) * 90, 256 + Math.cos(a) * 200, 256 + Math.sin(a) * 200); g.stroke(); }
      for (let i = 0; i < 620; i++) {
        const a = rand() * Math.PI * 2, r = Math.pow(rand(), 0.55) * 225, x = 256 + Math.cos(a) * r, y = 256 + Math.sin(a) * r * 0.92;
        const L = 18 + rand() * 18, W = L * (0.4 + rand() * 0.16), rot = rand() * Math.PI * 2;
        const light = light0 + (1 - r / 230) * -6 + rand() * 18;
        g.save(); g.translate(x, y); g.rotate(rot);
        g.fillStyle = `hsl(${hue0 + rand() * 22},${38 + rand() * 22}%,${light}%)`;
        g.beginPath(); g.moveTo(-L / 2, 0); g.quadraticCurveTo(0, -W, L / 2, 0); g.quadraticCurveTo(0, W, -L / 2, 0); g.fill();
        g.strokeStyle = `hsla(${hue0 + 10},40%,${light + 14}%,0.6)`; g.lineWidth = 1; g.beginPath(); g.moveTo(-L / 2, 0); g.lineTo(L / 2, 0); g.stroke();
        g.restore();
      }
    });
  }
  function needleCanvas() {
    return canvas(512, 256, (g) => {
      for (let pass = 0; pass < 3; pass++) {
        const y0 = 128 + (pass - 1) * 34, x1 = 500 - pass * 60;
        g.strokeStyle = '#4a3624'; g.lineWidth = 4 - pass; g.beginPath(); g.moveTo(8, 128); g.quadraticCurveTo(200, y0, x1, y0 + (pass - 1) * 20); g.stroke();
        for (let t = 0.04; t < 1; t += 0.006) {
          const x = 8 + (x1 - 8) * t, y = 128 + (y0 - 128) * Math.min(1, t * 2) + (pass - 1) * 20 * t * t, len = (52 - t * 30) * (0.7 + rand() * 0.5), side = rand() < 0.5 ? -1 : 1, a = side * (0.7 + rand() * 0.5) + 0.25;
          g.strokeStyle = `hsl(${105 + rand() * 25},${30 + rand() * 20}%,${14 + rand() * 18}%)`; g.lineWidth = 1.6 + rand();
          g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * len * 0.6, y + Math.sin(a) * len); g.stroke();
        }
      }
    });
  }
  function barkTextures() {
    const c = noiseCanvas(256, 4, 4, v => [92 + v * 50, 80 + v * 40, 66 + v * 30]);
    const g = c.getContext('2d');
    for (let i = 0; i < 70; i++) { let x = rand() * 256, y = 0; g.strokeStyle = `rgba(30,22,16,${0.4 + rand() * 0.4})`; g.lineWidth = 1 + rand() * 2.5; g.beginPath(); g.moveTo(x, y); while (y < 256) { y += 6 + rand() * 10; x += (rand() - 0.5) * 6; g.lineTo(x, y); } g.stroke(); }
    const map = toTex(c); map.wrapS = map.wrapT = THREE.RepeatWrapping; map.repeat.set(2, 3);
    return { map, normalMap: normalFrom(c, 4, [2, 3]) };
  }
  // quads ("cards") with normals pointing away from the canopy centre: soft, volumetric foliage lighting
  function cardsGeo(cards) {
    const pos = [], nor = [], uv = [], idx = [];
    cards.forEach(({ c, size, n, q, u0 = 0, v0 = 0, us = 1, vs = 1, w = 1 }) => {
      const b = pos.length / 3, hx = new V3(size * w / 2, 0, 0).applyQuaternion(q), hy = new V3(0, size / 2, 0).applyQuaternion(q);
      [[-1, -1, 0, 0], [1, -1, 1, 0], [1, 1, 1, 1], [-1, 1, 0, 1]].forEach(([sx, sy, a, bb]) => { pos.push(c.x + hx.x * sx + hy.x * sy, c.y + hx.y * sx + hy.y * sy, c.z + hx.z * sx + hy.z * sy); nor.push(n.x, n.y, n.z); uv.push(u0 + a * us, v0 + bb * vs); });
      idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
    });
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
    return g;
  }
  // a lighter copy of a leaf-card geometry: every nth card, each grown a little to cover the gaps
  function thinCards(g, every, grow) {
    const P = g.attributes.position.array, Nn = g.attributes.normal.array, U = g.attributes.uv.array, pos = [], nor = [], uv = [], idx = [];
    for (let c = 0; c < P.length / 12; c += every) {
      let cx = 0, cy = 0, cz = 0; for (let k = 0; k < 4; k++) { cx += P[c * 12 + k * 3] / 4; cy += P[c * 12 + k * 3 + 1] / 4; cz += P[c * 12 + k * 3 + 2] / 4; }
      const b = pos.length / 3;
      for (let k = 0; k < 4; k++) { const o = c * 12 + k * 3; pos.push(cx + (P[o] - cx) * grow, cy + (P[o + 1] - cy) * grow, cz + (P[o + 2] - cz) * grow); nor.push(Nn[o], Nn[o + 1], Nn[o + 2]); uv.push(U[c * 8 + k * 2], U[c * 8 + k * 2 + 1]); }
      idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
    }
    const out = new THREE.BufferGeometry(); out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); out.setIndex(idx);
    return out;
  }
  const randQ = () => new THREE.Quaternion().setFromEuler(new THREE.Euler(rand() * 6.28, rand() * 6.28, rand() * 6.28));
  function canopyCards(blobs, center, cardSize, density) {
    const cards = [];
    blobs.forEach(([x, y, z, r]) => {
      const n = Math.round(density * r * r);
      for (let i = 0; i < n; i++) {
        const d = new V3(rand() - 0.5, rand() - 0.5, rand() - 0.5).normalize(), c = new V3(x, y, z).addScaledVector(d, r * (0.45 + 0.55 * Math.sqrt(rand())));
        const nn = c.clone().sub(center).normalize().add(new V3(0, 0.35, 0)).normalize();
        cards.push({ c, size: cardSize * (0.8 + rand() * 0.45), n: nn, q: randQ() });
      }
    });
    return cardsGeo(cards);
  }
  function trunkGeo(pts, r0, r1) {
    return Models.loft(pts.map((p, i) => { const t = i / (pts.length - 1), r = r0 + (r1 - r0) * t + (i === 0 ? r0 * 0.35 : 0); return { p: p.toArray(), w: r, h: r }; }), { seg: 10, ref: [0, 0, 1] });
  }
  function mergeGeos(list) {
    let pos = [], nor = [], uv = [], idx = [], off = 0;
    list.forEach(g => { const ng = g.index ? g : g; const p = ng.attributes.position.array, n = ng.attributes.normal.array, u = ng.attributes.uv ? ng.attributes.uv.array : new Float32Array(p.length / 3 * 2); pos.push(...p); nor.push(...n); uv.push(...u); (ng.index ? Array.from(ng.index.array) : [...Array(p.length / 3).keys()]).forEach(i => idx.push(i + off)); off += p.length / 3; });
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
    return g;
  }
  function foliageMat(tex) {
    const m = new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.42, side: THREE.DoubleSide, roughness: 0.78, alphaToCoverage: true });
    m.onBeforeCompile = sh => { sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>', 'vec3 normal = normalize( vNormal ); vec3 geometryNormal = normal;'); };
    m.customProgramCacheKey = () => 'foliage';
    return m;
  }
  function foliageDepth(tex) { return new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: tex, alphaTest: 0.42, side: THREE.DoubleSide }); }
  function instanced(geo, mat, list, colors, depthMat, shadow = true) {
    const im = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach((m, i) => { im.setMatrixAt(i, m); if (colors) im.setColorAt(i, colors(i)); });
    im.castShadow = shadow; im.receiveShadow = true; im.frustumCulled = false;
    if (depthMat) im.customDepthMaterial = depthMat;
    scene.add(im); return im;
  }
  // the same, split into ~150 m tiles so the camera (and the sun's shadow camera) only draws the tiles it can see
  function instancedTiles(geo, mat, list, colors, depthMat, tile = 150) {
    const out = [];
    geo.computeBoundingSphere();
    const r0 = geo.boundingSphere.radius + geo.boundingSphere.center.length(), buckets = new Map(), v = new V3(), sc = new V3();
    list.forEach((m, i) => { v.setFromMatrixPosition(m); const k = Math.floor(v.x / tile) * 1000 + Math.floor(v.z / tile); if (!buckets.has(k)) buckets.set(k, []); buckets.get(k).push(i); });
    buckets.forEach(ix => {
      const g = new THREE.BufferGeometry(); g.setIndex(geo.index); Object.keys(geo.attributes).forEach(k => g.setAttribute(k, geo.attributes[k]));
      const c = new V3(); ix.forEach(i => c.add(v.setFromMatrixPosition(list[i]))); c.divideScalar(ix.length);
      let r = 0; ix.forEach(i => { v.setFromMatrixPosition(list[i]); sc.setFromMatrixScale(list[i]); r = Math.max(r, v.distanceTo(c) + r0 * Math.max(sc.x, sc.y, sc.z)); });
      g.boundingSphere = new THREE.Sphere(c, r);
      const im = new THREE.InstancedMesh(g, mat, ix.length);
      ix.forEach((i, n) => { im.setMatrixAt(n, list[i]); if (colors) im.setColorAt(n, colors[i]); });
      im.castShadow = true; im.receiveShadow = true; im.frustumCulled = true;
      if (depthMat) im.customDepthMaterial = depthMat;
      scene.add(im); out.push(im);
    });
    return out;
  }
  // small things left out of the lake's reflection (layer 2: drawn by the main and shadow cameras, not the mirror)
  const noMirror = [];
  const skipMirror = (...o) => { o.flat().forEach(x => x && noMirror.push(x)); return o[0]; };

  function blocked(x, z, pad = 0) {
    if (rectDist(P.yard, x, z, 3 + pad) === 0 || rectDist(P.park, x, z, 3 + pad) === 0) return true;
    if (distPath(x, z) < 3.5 + pad) return true;
    if (lakeE(x, z) < 1.12) return true;
    if (Math.abs(x) < 4 && z < -76 && z > -112) return true;
    if (Math.hypot(x - P.picnic.x, z - P.picnic.z) < 15 + pad) return true;
    if (Math.hypot(x - P.blind.x, z - P.blind.z) < 8) return true;
    return false;
  }

  // places trees must stay out of around the lake: the trail and its bridges, the water and beaches, the dam and creek, the landmarks
  function offTrail(x, z, pad = 0) {
    if (Course.near(x, z).d < 3.4 + pad) return true;
    if (lakeField(x, z) < 1.12) return true;
    const dz = Math.abs(z - D.cz);
    if ((x > D.x0 - 2 && x < D.x2 + 10 && dz < D.half + 6) || (x > D.x2 && dz < D.creekHalf + 7)) return true;
    if (Math.hypot(x - P.camp.x, z - P.camp.z) < 13 || Math.hypot(x - P.kayak.x, z - P.kayak.z) < 10 || Math.hypot(x - P.canteen.x, z - P.canteen.z) < 13) return true;
    if (Math.hypot(x - P.kayakShed.x, z - P.kayakShed.z) < 7 || P.farHouses.some(([hx, hz, r]) => Math.hypot(x - hx, z - hz) < r)) return true;
    return Math.hypot(x - Course.START.x, z - Course.START.z) < 8;
  }

  function buildNature(macro) {
    const leafA = toTex(leafCanvas(88, 24)), leafB = toTex(leafCanvas(100, 20)), leafBush = toTex(leafCanvas(95, 18)), needles = toTex(needleCanvas());
    const bark = barkTextures(), barkMat = std(0xffffff, { map: bark.map, normalMap: bark.normalMap, roughness: 0.95 });
    // broadleaf tree: trunk with two limbs and a clustered canopy
    const broad = (v) => {
      const lean = v * 0.3;
      const trunk = mergeGeos([
        trunkGeo([new V3(0, 0, 0), new V3(0.05, 1.2, 0), new V3(lean * 0.4, 2.4, 0.05), new V3(lean, 3.5, 0)], 0.3, 0.15),
        trunkGeo([new V3(lean * 0.4, 2.3, 0.05), new V3(1.0, 3.2, 0.3), new V3(1.5, 3.9, 0.4)], 0.12, 0.05),
        trunkGeo([new V3(lean * 0.6, 2.7, 0), new V3(-0.9, 3.6, -0.4), new V3(-1.3, 4.3, -0.5)], 0.11, 0.05),
      ]);
      const blobs = [[lean, 4.6, 0, 2.0], [1.3, 4.0, 0.5, 1.5], [-1.2, 4.2, -0.5, 1.5], [0.3, 5.6, -0.2, 1.4], [-0.3, 3.7, 1.0, 1.2]];
      return { trunk, leaves: canopyCards(blobs, new V3(lean, 4.4, 0), 1.35, 15) };
    };
    const pineG = () => {
      const trunk = trunkGeo([new V3(0, 0, 0), new V3(0, 3, 0), new V3(0, 6.5, 0), new V3(0, 7.6, 0)], 0.26, 0.04);
      const cards = [];
      for (let t = 0; t < 8; t++) {
        const y = 1.4 + t * 0.78, R = 2.3 * (1 - t / 8.6) + 0.25, n = 11 - t;
        for (let i = 0; i < n; i++) {
          const a = i / n * Math.PI * 2 + rand() * 0.5 + t, dir = new V3(Math.cos(a), -0.32, Math.sin(a)).normalize();
          const c = new V3(Math.cos(a) * R * 0.5, y - 0.25, Math.sin(a) * R * 0.5);
          const q = new THREE.Quaternion().setFromUnitVectors(new V3(1, 0, 0), dir);
          const q1 = q.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new V3(1, 0, 0), Math.PI / 2 + (rand() - 0.5) * 0.6));
          const q2 = q.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new V3(1, 0, 0), (rand() - 0.5) * 0.5));
          const nn = new V3(Math.cos(a), 0.7, Math.sin(a)).normalize();
          cards.push({ c, size: R * 0.5, w: 2.0, n: nn, q: q1 }, { c: c.clone().add(new V3(0, 0.05, 0)), size: R * 0.42, w: 2.0, n: nn, q: q2 });
        }
      }
      cards.push({ c: new V3(0, 7.7, 0), size: 1.0, w: 1.0, n: new V3(0, 1, 0), q: new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, Math.PI / 2)) });
      return { trunk, leaves: cardsGeo(cards) };
    };
    const bushG = () => canopyCards([[0, 0.55, 0, 0.75], [0.6, 0.45, 0.2, 0.55], [-0.5, 0.45, -0.2, 0.55]], new V3(0, 0.35, 0), 0.7, 22);

    const trees = [[], []], pines = [], bushes = [], rocks = [];
    const tryPlace = (list, count, minR, maxR, pad, col, scale = [0.85, 1.3]) => {
      let tries = 0, n = 0;
      while (n < count && tries++ < count * 50) {
        const a = rand() * Math.PI * 2, r = Math.sqrt(rand()) * maxR;
        const x = Math.cos(a) * r, z = Math.sin(a) * r - 15;
        if (r < minR || blocked(x, z, pad)) continue;
        if (x < P.bounds.x0 - 40 || x > P.bounds.x1 + 40 || z > P.bounds.z1 + 40 || z < -260) continue;
        const s = rnd(scale[0], scale[1]), m = M(x, groundH(x, z) - 0.08, z, s, s * rnd(0.9, 1.15), s, rand() * 6); n++;
        if (offTrail(x, z, pad)) continue; // made room for the lake trail (same random sequence, so the rest stays put)
        list.push(m); if (col) colliders.circles.push([x, z, col * s]);
      }
    };
    tryPlace(trees[0], 80, 0, 150, 1, 0.45); tryPlace(trees[1], 70, 0, 150, 1, 0.45);
    tryPlace(pines, 120, 25, 165, 1, 0.4);
    tryPlace(bushes, 140, 0, 125, 0, 0.55, [0.8, 1.4]);
    tryPlace(rocks, 45, 0, 115, 0, 0.6, [0.6, 1.4]);
    [[-15, 56], [16, 86], [-17, 86]].forEach(([x, z]) => { trees[0].push(M(x, groundH(x, z) - 0.08, z, 1.25, 1.3, 1.25, z)); colliders.circles.push([x, z, 0.6]); });
    [[40, -31], [62, -24], [44, -9]].forEach(([x, z]) => { trees[1].push(M(x, groundH(x, z) - 0.08, z, 1.15, 1.2, 1.15, x)); colliders.circles.push([x, z, 0.55]); });
    // a few shade trees at the edge of the picnic meadow
    [[-38, -22], [-14, -40], [-36, -42]].forEach(([x, z]) => { trees[0].push(M(x, groundH(x, z) - 0.08, z, 1.2, 1.25, 1.2, x)); colliders.circles.push([x, z, 0.55]); });
    P.treeSpots = trees[0].concat(trees[1]).map(m => new V3().setFromMatrixPosition(m)).filter(v => distPath(v.x, v.z) < 12 && v.z < 44 && v.z > -76);
    const old = [trees[0].length, trees[1].length, pines.length, bushes.length];
    // the woods around Lake Haigler: thick along the trail and the west, south and east shores, light on the north shore by home.
    // Trees well back from the trail use a lighter canopy (fewer, bigger leaf cards), which reads the same from the trail.
    const lite = tier === 'high' ? 1 : 0.6, back = [[], [], []]; // back[0] and back[1] share one light broadleaf canopy
    const forest = (list, backList, count, pad, col, scale) => {
      let tries = 0, n = 0;
      while (n < count && tries++ < count * 80) {
        let x, z;
        if (rand2() < 0.62) { const s = rand2() * Course.LEN, p = Course.at(s), t = Course.tanAt(s), d = (3.8 + rand2() * 26) * (rand2() < 0.5 ? -1 : 1); x = p.x - t.z * d; z = p.z + t.x * d; }
        else { x = rnd2(-175, 150); z = rnd2(-266, -66); }
        const e = lakeField(x, z);
        let keep = 1 - smooth(1.5, 1.95, e);
        if (z < -212) keep = Math.max(keep, 0.85);
        if (z > -104 && x > -64 && x < 64) keep *= 0.12;
        if (rand2() > keep || offTrail(x, z, pad) || blocked(x, z, pad)) continue;
        const sc = rnd2(scale[0], scale[1]), m = M(x, groundH(x, z) - 0.08, z, sc, sc * rnd2(0.9, 1.15), sc, rand2() * 6); n++;
        (backList && Course.near(x, z).d > 16 ? backList : list).push(m);
        if (col) colliders.circles.push([x, z, col * sc]);
      }
    };
    forest(trees[0], back[0], Math.round(330 * lite), 0.6, 0.45, [0.95, 1.45]); forest(trees[1], back[1], Math.round(300 * lite), 0.6, 0.45, [0.95, 1.4]);
    forest(pines, back[2], Math.round(400 * lite), 0.6, 0.4, [1.0, 1.5]);
    forest(bushes, null, Math.round(330 * lite), 0, 0.55, [0.8, 1.5]);
    P.mapTrees = trees[0].concat(trees[1], pines, ...back).map(m => { const v = new V3().setFromMatrixPosition(m); return [v.x, v.z, new V3().setFromMatrixScale(m).x]; }); // for the mini map
    forestFloor(P.mapTrees.filter(([x, z]) => z < -60));
    const tint = (base, spread, r) => () => new THREE.Color().setHSL(base[0] + (r() - 0.5) * spread, base[1], base[2] + (r() - 0.5) * 0.12).convertSRGBToLinear();
    const tints = (list, n0, base, spread) => { const a = tint(base, spread, rand), b = tint(base, spread, rand2); return list.map((m, i) => i < n0 ? a() : b()); };
    const bt = [broad(0.4), broad(-0.5)], bfm = [foliageMat(leafA), foliageMat(leafB)], bfd = [foliageDepth(leafA), foliageDepth(leafB)];
    bt.forEach((g, k) => {
      instancedTiles(g.trunk, barkMat, trees[k].concat(back[k]), null);
      instancedTiles(g.leaves, bfm[k], trees[k], tints(trees[k], old[k], [0.22, 0.3, 0.72], 0.05), bfd[k]);
    });
    const backBroad = back[0].concat(back[1]);
    skipMirror(instancedTiles(thinCards(bt[0].leaves, 3, 1.55), bfm[0], backBroad, tints(backBroad, 0, [0.22, 0.3, 0.72], 0.05), bfd[0]));
    const pg = pineG();
    instancedTiles(pg.trunk, barkMat, pines.concat(back[2]), null);
    const pm = foliageMat(needles), pd = foliageDepth(needles);
    instancedTiles(pg.leaves, pm, pines, tints(pines, old[2], [0.3, 0.25, 0.62], 0.04), pd);
    skipMirror(instancedTiles(thinCards(pg.leaves, 2, 1.3), pm, back[2], tints(back[2], 0, [0.3, 0.25, 0.62], 0.04), pd));
    skipMirror(instancedTiles(bushG(), foliageMat(leafBush), bushes, tints(bushes, old[3], [0.25, 0.3, 0.66], 0.06), foliageDepth(leafBush)));
    // rocks: displaced, textured
    const rg = new THREE.IcosahedronGeometry(0.7, 2), rp = rg.attributes.position;
    for (let i = 0; i < rp.count; i++) { const v = new V3().fromBufferAttribute(rp, i), k = 1 + Math.sin(v.x * 5.1) * 0.08 + Math.cos(v.y * 6.3 + v.z * 3) * 0.08 + Math.sin(v.z * 7.7) * 0.05; v.multiplyScalar(k); v.y *= 0.62; rp.setXYZ(i, v.x, v.y + 0.12, v.z); }
    rg.computeVertexNormals();
    const rockC = noiseCanvas(256, 8, 5, v => [118 + v * 60, 116 + v * 58, 110 + v * 54]);
    const rcg = rockC.getContext('2d'); for (let i = 0; i < 90; i++) { rcg.fillStyle = `rgba(${150 + rand() * 40},${160 + rand() * 30},${90 + rand() * 30},0.35)`; rcg.beginPath(); rcg.arc(rand() * 256, rand() * 256, 3 + rand() * 9, 0, 7); rcg.fill(); }
    skipMirror(instanced(rg, std(0xffffff, { map: toTex(rockC), normalMap: normalFrom(rockC, 3), roughness: 0.9 }), rocks, null));
    // flowers: five-petal heads on thin stems
    const petals = new THREE.Shape(); for (let i = 0; i <= 60; i++) { const a = i / 60 * Math.PI * 2, r = 0.05 + 0.03 * Math.abs(Math.cos(a * 2.5)); i ? petals.lineTo(Math.cos(a) * r, Math.sin(a) * r) : petals.moveTo(Math.cos(a) * r, Math.sin(a) * r); }
    const head = new THREE.ShapeGeometry(petals); head.rotateX(-Math.PI / 2 + 0.3); head.translate(0, 0.3, 0);
    const stem = new THREE.CylinderGeometry(0.008, 0.01, 0.3, 4); stem.translate(0, 0.15, 0);
    const fl = [], fc = [], fcol = [0xffffff, 0xffd84a, 0xff7aa8, 0xb48cff, 0x7fc4ff, 0xff9e4a];
    for (let i = 0; i < 1800; i++) {
      const x = rnd(-110, 110), z = rnd(-125, 105);
      if (lakeField(x, z) < 1.14 || distPath(x, z) < 2.2 || rectDist(P.house, x, z, 3) === 0 || Math.hypot(x - P.picnic.x, z - P.picnic.z) < 3 || Course.near(x, z).d < 2.4) continue;
      const s = rnd(0.8, 1.3); fl.push(M(x, groundH(x, z), z, s, s, s, rand() * 6)); fc.push(new THREE.Color(fcol[i % fcol.length]));
    }
    const ped = std(0xffffff, { side: THREE.DoubleSide, roughness: 0.6 });
    skipMirror(instanced(head, ped, fl, i => fc[i], null, false), instanced(stem, std(0x3f7a35), fl, null, null, false));
    // lamp posts and benches along the trail
    const lampTex = glowTex();
    const metal = std(0x23272d, { metalness: 0.7, roughness: 0.35 });
    pathCurve.getSpacedPoints(10).forEach((p, i) => {
      if (i === 0 || i === 10) return;
      const t = pathCurve.getTangent(i / 10), x = p.x + t.z * 2.4, z = p.z - t.x * 2.4;
      const l = skipMirror(grp(scene, [x, groundH(x, z), z]));
      mesh(new THREE.CylinderGeometry(0.06, 0.1, 3.4, 12), metal, l, [0, 1.7, 0]);
      mesh(new THREE.CylinderGeometry(0.16, 0.12, 0.12, 12), metal, l, [0, 0.06, 0]);
      mesh(new THREE.ConeGeometry(0.3, 0.22, 12, 1, true), metal, l, [0, 3.62, 0]);
      const bulbM = std(0xfff1c2, { emissive: 0xffc56b, emissiveIntensity: 0.1 }); windowMats.push(bulbM);
      mesh(new THREE.SphereGeometry(0.16, 16, 10), bulbM, l, [0, 3.45, 0]);
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: lampTex, color: 0xffcf7a, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
      glow.position.set(0, 3.45, 0); glow.scale.setScalar(3.2); l.add(glow); lampGlows.push(glow);
      colliders.circles.push([x, z, 0.25]);
      if (i % 3 === 1) bench(p.x - t.z * 3, p.z + t.x * 3, Math.atan2(t.x, t.z) + Math.PI / 2);
    });
  }

  // ================= buildings and props =================
  function addShadow(o) { o.traverse(m => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } }); return o; }
  function texPair(w, h, draw, repeat, strength = 2) { const c = canvas(w, h, draw), map = toTex(c, repeat); return { map, normalMap: normalFrom(c, strength, repeat) }; }

  function buildHouse() {
    const H = P.house, cx = (H.x0 + H.x1) / 2, cz = (H.z0 + H.z1) / 2, w = H.x1 - H.x0, d = H.z1 - H.z0, y0 = groundH(cx, cz);
    const siding = texPair(512, 512, (g, W, Hh) => {
      for (let y = 0; y < Hh; y += 32) {
        const gr = g.createLinearGradient(0, y, 0, y + 32); gr.addColorStop(0, '#f1ece0'); gr.addColorStop(0.85, '#e2dccd'); gr.addColorStop(1, '#a9a395');
        g.fillStyle = gr; g.fillRect(0, y, W, 32);
        for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(120,110,95,${rand() * 0.06})`; g.fillRect(rand() * W, y + rand() * 28, 20 + rand() * 80, 1); }
      }
    }, [3, 1], 1.6);
    const house = grp(scene, [cx, y0, cz]);
    mesh(new THREE.BoxGeometry(w, 4.2, d), std(0xffffff, { map: siding.map, normalMap: siding.normalMap, roughness: 0.7 }), house, [0, 2.1, 0]);
    const stone = texPair(256, 128, (g, W, Hh) => { g.fillStyle = '#6d6a64'; g.fillRect(0, 0, W, Hh); for (let y = 0; y < Hh; y += 24) for (let x = (y / 24 % 2) * 20; x < W; x += 40) { const s = 110 + rand() * 50; g.fillStyle = `rgb(${s},${s * 0.97},${s * 0.92})`; g.fillRect(x + 2, y + 2, 36, 20); } }, [6, 1], 3);
    mesh(new THREE.BoxGeometry(w + 0.3, 0.55, d + 0.3), std(0xffffff, { map: stone.map, normalMap: stone.normalMap, roughness: 0.92 }), house, [0, 0.27, 0]);
    // trim
    const trim = std(0xfbfaf6, { roughness: 0.5 });
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => mesh(new THREE.BoxGeometry(0.22, 4.2, 0.22), trim, house, [sx * w / 2, 2.1, sz * d / 2]));
    mesh(new THREE.BoxGeometry(w + 0.25, 0.25, d + 0.25), trim, house, [0, 4.1, 0]);
    // shingle roof
    const shingles = texPair(512, 512, (g, W, Hh) => {
      g.fillStyle = '#2f3138'; g.fillRect(0, 0, W, Hh);
      for (let y = 0; y < Hh; y += 24) for (let x = (y / 24 % 2) * 21; x < W + 42; x += 42) { const s = 62 + rand() * 30; g.fillStyle = `rgb(${s},${s * 1.02},${s * 1.1})`; g.fillRect(x + 1, y + 1, 40, 21); g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(x + 1, y + 19, 40, 3); }
      for (let i = 0; i < 4000; i++) { g.fillStyle = `rgba(255,255,255,${rand() * 0.08})`; g.fillRect(rand() * W, rand() * Hh, 1, 1); }
    }, [1, 1], 3);
    const shape = new THREE.Shape(); shape.moveTo(-d / 2 - 0.8, 0); shape.lineTo(0, 3.2); shape.lineTo(d / 2 + 0.8, 0); shape.lineTo(-d / 2 - 0.8, 0);
    const rg = new THREE.ExtrudeGeometry(shape, { depth: w + 1.2, bevelEnabled: false }); rg.translate(0, 0, -(w + 1.2) / 2); rg.rotateY(Math.PI / 2);
    // world-scaled UVs so shingles keep their size on every face
    const ru = rg.attributes.uv, rpos = rg.attributes.position, rn = (rg.computeVertexNormals(), rg.attributes.normal);
    for (let i = 0; i < ru.count; i++) { const x = rpos.getX(i), y = rpos.getY(i), z = rpos.getZ(i), ny = Math.abs(rn.getY(i)); ru.setXY(i, x * 0.3, (ny > 0.2 ? Math.hypot(y, z) : y) * 0.3); }
    shingles.map.repeat.set(1, 1); shingles.normalMap.repeat.set(1, 1);
    mesh(rg, std(0xffffff, { map: shingles.map, normalMap: shingles.normalMap, roughness: 0.85 }), house, [0, 4.2, 0]);
    const brick = texPair(256, 256, (g, W, Hh) => { g.fillStyle = '#8f8a84'; g.fillRect(0, 0, W, Hh); for (let y = 0; y < Hh; y += 16) for (let x = (y / 16 % 2) * 16; x < W; x += 32) { const s = rand() * 30; g.fillStyle = `rgb(${130 + s},${62 + s * 0.6},${48 + s * 0.4})`; g.fillRect(x + 1, y + 1, 30, 14); } }, [1, 2], 3);
    mesh(new THREE.BoxGeometry(1, 2.5, 1), std(0xffffff, { map: brick.map, normalMap: brick.normalMap }), house, [3.5, 6.2, 1.5]);
    // door, windows (reflective glass that glows at night), shutters
    const door = texPair(128, 256, (g, W, Hh) => { g.fillStyle = '#2b4c76'; g.fillRect(0, 0, W, Hh); g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 4; [[16, 20, 40, 90], [72, 20, 40, 90], [16, 140, 40, 96], [72, 140, 40, 96]].forEach(r => g.strokeRect(...r)); }, null, 3);
    mesh(new THREE.BoxGeometry(1.2, 2.2, 0.1), std(0xffffff, { map: door.map, normalMap: door.normalMap, roughness: 0.5 }), house, [0, 1.65, -d / 2 - 0.05]);
    mesh(new THREE.BoxGeometry(1.45, 2.4, 0.08), trim, house, [0, 1.7, -d / 2 - 0.02]);
    mesh(new THREE.SphereGeometry(0.05, 12, 8), std(0xd9b44a, { metalness: 0.9, roughness: 0.25 }), house, [0.4, 1.6, -d / 2 - 0.13]);
    const glassFor = () => { const m = new THREE.MeshPhysicalMaterial({ color: 0x1b2836, roughness: 0.04, metalness: 0.1, clearcoat: 1, emissive: 0xffc56b, emissiveIntensity: 0, envMapIntensity: 1.6 }); windowMats.push(m); return m; };
    const windowAt = (x, y, z, ry) => {
      const g = grp(house, [x, y, z]); g.rotation.y = ry;
      mesh(new THREE.BoxGeometry(1.8, 1.4, 0.06), glassFor(), g, [0, 0, 0]);
      mesh(new THREE.BoxGeometry(2.0, 0.12, 0.14), trim, g, [0, 0.76, -0.02]); mesh(new THREE.BoxGeometry(2.1, 0.12, 0.24), trim, g, [0, -0.76, -0.06]);
      [-0.95, 0.95].forEach(s => mesh(new THREE.BoxGeometry(0.1, 1.5, 0.14), trim, g, [s, 0, -0.02]));
      mesh(new THREE.BoxGeometry(0.05, 1.4, 0.08), trim, g, [0, 0, -0.03]); mesh(new THREE.BoxGeometry(1.8, 0.05, 0.08), trim, g, [0, 0, -0.03]);
      [-1.3, 1.3].forEach(s => mesh(new THREE.BoxGeometry(0.48, 1.6, 0.05), std(0x2b4c76, { roughness: 0.6 }), g, [s, 0, 0]));
    };
    [-4.2, 4.2].forEach(x => windowAt(x, 2.35, -d / 2 - 0.04, 0));
    [-2.5, 2.5].forEach(z => { windowAt(-w / 2 - 0.04, 2.35, z, -Math.PI / 2); windowAt(w / 2 + 0.04, 2.35, z, Math.PI / 2); });
    // porch with plank floor, columns and a lamp
    const planks = texPair(256, 256, (g, W, Hh) => { for (let x = 0; x < W; x += 32) { const s = 140 + rand() * 30; g.fillStyle = `rgb(${s},${s * 0.78},${s * 0.56})`; g.fillRect(x, 0, 31, Hh); g.fillStyle = 'rgba(60,40,20,0.6)'; g.fillRect(x + 31, 0, 1, Hh); for (let i = 0; i < 30; i++) { g.fillStyle = `rgba(80,55,30,${rand() * 0.25})`; g.fillRect(x + rand() * 30, rand() * Hh, 1, 10 + rand() * 40); } } }, [3, 1.5], 2);
    const porch = grp(house, [0, 0, -d / 2 - 1.4]);
    mesh(new THREE.BoxGeometry(6, 0.4, 2.8), std(0xffffff, { map: planks.map, normalMap: planks.normalMap, roughness: 0.8 }), porch, [0, 0.2, 0]);
    mesh(new THREE.BoxGeometry(2.4, 0.2, 0.6), std(0xffffff, { map: planks.map, roughness: 0.8 }), porch, [0, 0.1, -1.6]);
    [-2.8, 2.8].forEach(x => mesh(new THREE.CylinderGeometry(0.1, 0.12, 3.4, 16), trim, porch, [x, 2.1, -1.2]));
    mesh(new THREE.BoxGeometry(6.4, 0.25, 3.2), std(0xffffff, { map: shingles.map, roughness: 0.85 }), porch, [0, 3.9, -0.1]);
    const lampM = std(0xfff2c8, { emissive: 0xffd27a, emissiveIntensity: 0.2 }); windowMats.push(lampM);
    mesh(new THREE.SphereGeometry(0.15, 16, 10), lampM, porch, [0, 3.6, -0.6]);
    addShadow(house);
    colliders.boxes.push({ x0: H.x0 - 0.2, x1: H.x1 + 0.2, z0: H.z0 - 0.2, z1: H.z1 + 0.2 });
    colliders.boxes.push({ x0: -3, x1: 3, z0: H.z0 - 2.9, z1: H.z0, h: 0.4 }); // porch is a low step (walkable)
    // flower beds along the front
    const bedSoil = std(0x4a3626, { roughness: 1 });
    [-1, 1].forEach(s => mesh(new THREE.BoxGeometry(3.4, 0.16, 0.9), bedSoil, scene, [s * 5.2, groundH(s * 5.2, H.z0 - 0.6) + 0.05, H.z0 - 0.6]));
    const shrubTex = toTex(leafCanvas(98, 22)), shrubs = [];
    for (let i = 0; i < 8; i++) { const x = (i < 4 ? -1 : 1) * (3.8 + (i % 4) * 0.95), z = H.z0 - 0.6; shrubs.push(M(x, groundH(x, z), z, 0.55, 0.55, 0.55, i)); }
    instanced(canopyCards([[0, 0.55, 0, 0.6], [0.35, 0.45, 0.1, 0.45], [-0.3, 0.42, -0.1, 0.45]], new V3(0, 0.4, 0), 0.6, 26), foliageMat(shrubTex), shrubs, () => new THREE.Color(0x9ac46a), foliageDepth(shrubTex));
    const bloom = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.06, 1), std(0xffffff, { roughness: 0.5 }), 60);
    for (let i = 0; i < 60; i++) { const x = (i < 30 ? -1 : 1) * (3.6 + rand() * 3.2), z = H.z0 - 0.6 + (rand() - 0.5) * 0.7; bloom.setMatrixAt(i, M(x, groundH(x, z) + 0.45 + rand() * 0.35, z)); bloom.setColorAt(i, new THREE.Color([0xff6f91, 0xffd166, 0xffffff, 0xc77dff][i % 4])); }
    bloom.frustumCulled = false; scene.add(bloom);
  }

  function picketFence(segs) {
    const pick = [], post = [], rail = [];
    segs.forEach(([ax, az, bx, bz]) => {
      const len = Math.hypot(bx - ax, bz - az), ang = Math.atan2(bx - ax, bz - az);
      for (let t = 0.14; t <= len; t += 0.26) { const x = ax + (bx - ax) * t / len, z = az + (bz - az) * t / len; pick.push(M(x, groundH(x, z) + 0.02, z, 1, 1, 1, ang)); }
      for (let t = 0; t <= len + 0.01; t += 2.4) { const x = ax + (bx - ax) * Math.min(t, len) / len, z = az + (bz - az) * Math.min(t, len) / len; post.push(M(x, groundH(x, z) + 0.62, z, 1, 1, 1, ang)); }
      const mx = (ax + bx) / 2, mz = (az + bz) / 2, gy = groundH(mx, mz);
      rail.push(M(mx, gy + 0.32, mz, 1, 1, len, ang)); rail.push(M(mx, gy + 0.78, mz, 1, 1, len, ang));
      colliders.segs.push([ax, az, bx, bz]);
    });
    const ps = new THREE.Shape(); ps.moveTo(-0.045, 0); ps.lineTo(0.045, 0); ps.lineTo(0.045, 0.92); ps.lineTo(0, 1.0); ps.lineTo(-0.045, 0.92); ps.lineTo(-0.045, 0);
    const pg = new THREE.ExtrudeGeometry(ps, { depth: 0.025, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.004, bevelSegments: 1 }); pg.rotateY(Math.PI / 2); pg.translate(0, 0, 0);
    const white = std(0xf4f1ea, { roughness: 0.55 });
    instanced(pg, white, pick, null); instanced(new THREE.BoxGeometry(0.14, 1.24, 0.14), white, post, null); instanced(new THREE.BoxGeometry(0.05, 0.08, 1), white, rail, null);
    instanced(new THREE.ConeGeometry(0.11, 0.12, 4), white, post.map(m => m.clone().multiply(new THREE.Matrix4().makeTranslation(0, 0.68, 0)).multiply(new THREE.Matrix4().makeRotationY(Math.PI / 4))), null);
  }

  function buildYard() {
    const Y = P.yard;
    picketFence([[Y.x0, Y.z0, -2.6, Y.z0], [2.6, Y.z0, Y.x1, Y.z0], [Y.x1, Y.z0, Y.x1, Y.z1], [Y.x1, Y.z1, Y.x0, Y.z1], [Y.x0, Y.z1, Y.x0, Y.z0]]);
    const ga = grp(scene, [0, groundH(0, Y.z0), Y.z0]);
    const white = std(0xf4f1ea, { roughness: 0.55 });
    [-2.6, 2.6].forEach(x => mesh(new THREE.BoxGeometry(0.25, 2.4, 0.25), white, ga, [x, 1.2, 0]));
    const arch = mesh(new THREE.TorusGeometry(2.6, 0.1, 10, 40, Math.PI), white, ga, [0, 2.4, 0]); arch.scale.y = 0.35;
    // dog bed with a plaid cushion and a name sign
    const bed = grp(scene, [P.bed.x, groundH(P.bed.x, P.bed.z), P.bed.z]);
    const plaid = canvasTex(256, 256, (g, w, h) => { g.fillStyle = '#9c2f2f'; g.fillRect(0, 0, w, h); g.fillStyle = 'rgba(30,30,60,0.45)'; for (let i = 0; i < w; i += 64) { g.fillRect(i, 0, 24, h); g.fillRect(0, i, w, 24); } g.fillStyle = 'rgba(255,220,120,0.4)'; for (let i = 32; i < w; i += 64) { g.fillRect(i, 0, 4, h); g.fillRect(0, i, w, 4); } for (let i = 0; i < 3000; i++) { g.fillStyle = `rgba(0,0,0,${rand() * 0.12})`; g.fillRect(rand() * w, rand() * h, 2, 1); } }, [3, 1]);
    mesh(new THREE.CylinderGeometry(0.95, 1.0, 0.18, 40), std(0x6b4e3a, { roughness: 0.8 }), bed, [0, 0.09, 0]);
    mesh(new THREE.TorusGeometry(0.85, 0.22, 16, 48), std(0xffffff, { map: plaid, roughness: 0.95 }), bed, [0, 0.25, 0], [Math.PI / 2, 0, 0]);
    mesh(new THREE.CylinderGeometry(0.75, 0.75, 0.12, 40), std(0xe7dccb, { roughness: 1 }), bed, [0, 0.22, 0]);
    const sign = canvasTex(256, 96, (g, w, h) => { g.fillStyle = '#f6e7c8'; g.beginPath(); g.roundRect ? g.roundRect(8, 16, w - 16, h - 32, 30) : g.rect(8, 16, w - 16, h - 32); g.fill(); g.fillStyle = '#5a3420'; g.font = 'bold 44px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('BRONSON', w / 2, h / 2 + 2); });
    mesh(new THREE.PlaneGeometry(1.4, 0.52), std(0xffffff, { map: sign, transparent: true }), bed, [0, 0.6, 1.1], [0, Math.PI, 0]).castShadow = false;
    mesh(new THREE.BoxGeometry(0.06, 0.6, 0.06), std(0x6b4e3a), bed, [0, 0.3, 1.12]);
    mesh(new THREE.CylinderGeometry(0.22, 0.17, 0.12, 24), std(0x2f6fd6, { metalness: 0.5, roughness: 0.25 }), scene, [P.bed.x + 1.8, groundH(P.bed.x + 1.8, P.bed.z) + 0.06, P.bed.z + 0.4]);
    // mailbox
    const mb = grp(scene, [4.2, groundH(4.2, Y.z0 - 1.2), Y.z0 - 1.2]);
    mesh(new THREE.BoxGeometry(0.1, 1.1, 0.1), std(0x6b4e3a), mb, [0, 0.55, 0]);
    mesh(new THREE.BoxGeometry(0.3, 0.3, 0.55), std(0x2b2f36, { metalness: 0.6, roughness: 0.35 }), mb, [0, 1.2, 0]);
    mesh(new THREE.BoxGeometry(0.03, 0.18, 0.06), std(0xd23b3b), mb, [0.17, 1.3, 0.1]);
    colliders.circles.push([4.2, Y.z0 - 1.2, 0.3]);
  }

  function buildPark() {
    const K = P.park;
    const segs = [[K.x0, K.z0, K.x1, K.z0], [K.x1, K.z0, K.x1, K.z1], [K.x1, K.z1, K.x0, K.z1], [K.x0, K.z1, K.x0, K.gateZ + 2.4], [K.x0, K.gateZ - 2.4, K.x0, K.z0]];
    const linkTex = canvasTex(64, 64, (g, w, h) => { g.clearRect(0, 0, w, h); g.strokeStyle = 'rgba(200,205,210,0.95)'; g.lineWidth = 2; for (let i = -64; i < 128; i += 12) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 64, 64); g.stroke(); g.beginPath(); g.moveTo(i + 64, 0); g.lineTo(i, 64); g.stroke(); } });
    linkTex.wrapS = linkTex.wrapT = THREE.RepeatWrapping;
    const postM = std(0x8f969c, { metalness: 0.8, roughness: 0.3 });
    segs.forEach(([ax, az, bx, bz]) => {
      const len = Math.hypot(bx - ax, bz - az), ang = Math.atan2(bx - ax, bz - az), mx = (ax + bx) / 2, mz = (az + bz) / 2;
      const t = linkTex.clone(); t.needsUpdate = true; t.repeat.set(len / 1.2, 1.4);
      const panel = mesh(new THREE.PlaneGeometry(len, 1.6), std(0xffffff, { map: t, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide, metalness: 0.6, roughness: 0.4 }), scene, [mx, groundH(mx, mz) + 0.8, mz], [0, ang + Math.PI / 2, 0]);
      panel.castShadow = true; panel.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: t, alphaTest: 0.3 });
      mesh(new THREE.CylinderGeometry(0.03, 0.03, len, 6), postM, scene, [mx, groundH(mx, mz) + 1.62, mz]).rotation.set(Math.PI / 2, ang, 0, 'YXZ');
      for (let s = 0; s <= len; s += 3) { const x = ax + (bx - ax) * s / len, z = az + (bz - az) * s / len; mesh(new THREE.CylinderGeometry(0.045, 0.05, 1.75, 10), postM, scene, [x, groundH(x, z) + 0.87, z]); }
      colliders.segs.push([ax, az, bx, bz]);
    });
    const sg = canvasTex(512, 160, (g, w, h) => { g.fillStyle = '#2f5d3a'; g.fillRect(0, 0, w, h); g.strokeStyle = '#f2e6c9'; g.lineWidth = 8; g.strokeRect(10, 10, w - 20, h - 20); g.fillStyle = '#f2e6c9'; g.font = 'bold 64px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('BARK PARK', w / 2, h / 2 + 4); });
    const sgn = grp(scene, [K.x0 - 0.6, groundH(K.x0, K.gateZ + 6), K.gateZ + 6.5]);
    mesh(new THREE.PlaneGeometry(2.6, 0.8), std(0xffffff, { map: sg }), sgn, [0, 2.2, 0], [0, -Math.PI / 2, 0]);
    [-1.1, 1.1].forEach(z => mesh(new THREE.BoxGeometry(0.12, 2.6, 0.12), std(0x6b4e3a), sgn, [0, 1.3, z]));
    [[50, -12], [56, -12], [62, -12]].forEach(([x, z]) => {
      const h = grp(scene, [x, groundH(x, z), z]);
      [-0.7, 0.7].forEach(s => mesh(new THREE.CylinderGeometry(0.04, 0.04, 1, 10), std(0xffffff), h, [s, 0.5, 0]));
      mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.5, 10), std(0xe0483e), h, [0, 0.55, 0], [0, 0, Math.PI / 2]);
    });
    for (let i = -2; i <= 2; i++) mesh(new THREE.TorusGeometry(0.7, 0.06, 8, 24, Math.PI), std(0x2d7fd6, { roughness: 0.5 }), scene, [58 + i * 0.5, groundH(58, -30), -30], [0, Math.PI / 2, 0]);
    bench(33, -9, Math.PI); bench(33, -33, 0);
    mesh(new THREE.CylinderGeometry(0.15, 0.18, 1, 14), std(0x4b6a88, { metalness: 0.6, roughness: 0.35 }), scene, [K.x1 - 3, groundH(K.x1 - 3, -8) + 0.5, -8]);
    colliders.circles.push([K.x1 - 3, -8, 0.4]);
  }
  let woodTex = null;
  const woodPair = () => woodTex || (woodTex = texPair(256, 64, (g, W, Hh) => { g.fillStyle = '#8a5a36'; g.fillRect(0, 0, W, Hh); for (let i = 0; i < 60; i++) { g.strokeStyle = `rgba(60,35,18,${0.2 + rand() * 0.3})`; g.lineWidth = 1; g.beginPath(); const y = rand() * Hh; g.moveTo(0, y); g.bezierCurveTo(W * 0.3, y + rand() * 6 - 3, W * 0.6, y + rand() * 6 - 3, W, y); g.stroke(); } }, null, 2));
  function bench(x, z, ry) {
    woodPair();
    const b = skipMirror(grp(scene, [x, groundH(x, z), z])); b.rotation.y = ry;
    const wood = std(0xffffff, { map: woodTex.map, normalMap: woodTex.normalMap, roughness: 0.75 });
    [0, 0.17, 0.34].forEach(o => mesh(new THREE.BoxGeometry(2, 0.05, 0.14), wood, b, [0, 0.48, -0.17 + o]));
    [0.68, 0.88].forEach(y => mesh(new THREE.BoxGeometry(2, 0.14, 0.04), wood, b, [0, y, -0.25], [-0.12, 0, 0]));
    [-0.85, 0.85].forEach(s => { mesh(new THREE.BoxGeometry(0.06, 0.48, 0.45), std(0x23272d, { metalness: 0.7, roughness: 0.4 }), b, [s, 0.24, 0]); mesh(new THREE.BoxGeometry(0.05, 0.5, 0.05), std(0x23272d, { metalness: 0.7, roughness: 0.4 }), b, [s, 0.72, -0.26]); });
    colliders.circles.push([x, z, 0.9]);
    return b;
  }

  function buildDock() {
    const D = P.dock, len = D.z1 - D.z0;
    const plank = texPair(512, 64, (g, W, Hh) => { g.fillStyle = '#b9b1a2'; g.fillRect(0, 0, W, Hh); for (let i = 0; i < 90; i++) { g.strokeStyle = `rgba(${90 + rand() * 40},${80 + rand() * 30},${70 + rand() * 25},${0.25 + rand() * 0.35})`; g.lineWidth = 1 + rand(); g.beginPath(); const y = rand() * Hh; g.moveTo(0, y); g.bezierCurveTo(W * 0.3, y + rand() * 8 - 4, W * 0.7, y + rand() * 8 - 4, W, y + rand() * 4 - 2); g.stroke(); } for (let i = 0; i < 6; i++) { g.fillStyle = 'rgba(60,55,50,0.6)'; g.beginPath(); g.ellipse(rand() * W, rand() * Hh, 3, 2, 0, 0, 7); g.fill(); } }, null, 2.5);
    const boards = [], cols = [];
    for (let z = D.z0 + 0.08; z < D.z1; z += 0.16) { boards.push(M(0, D.y - 0.03, z, 1, 1, 1, rand() * 0.004)); const s = 0.85 + rand() * 0.25; cols.push(new THREE.Color(s, s, s * 0.97)); }
    instanced(new THREE.BoxGeometry(D.x1 - D.x0, 0.05, 0.145), std(0xffffff, { map: plank.map, normalMap: plank.normalMap, roughness: 0.85 }), boards, i => cols[i]);
    const frame = std(0x7b7466, { roughness: 0.95 });
    [D.x0 + 0.05, D.x1 - 0.05].forEach(x => mesh(new THREE.BoxGeometry(0.1, 0.22, len), frame, scene, [x, D.y - 0.16, (D.z0 + D.z1) / 2]));
    const postTex = barkTextures();
    const postM = std(0x8f8676, { map: postTex.map, roughness: 1 });
    for (let z = D.z1 - 2; z > D.z0; z -= 6) {
      [D.x0 - 0.15, D.x1 + 0.15].forEach(x => {
        const tall = z < D.z0 + 14;
        mesh(new THREE.CylinderGeometry(0.16, 0.17, tall ? 4.6 : 2.4, 14), postM, scene, [x, tall ? 0.6 : -0.3, z]);
        mesh(new THREE.ConeGeometry(0.19, 0.22, 14), std(0x2a2a2a, { roughness: 0.6 }), scene, [x, tall ? 3.0 : 1.0, z]);
        if (tall) colliders.circles.push([x, z, 0.25]);
      });
      mesh(new THREE.BoxGeometry(0.22, 0.05, 0.06), std(0xc9ccd2, { metalness: 0.9, roughness: 0.3 }), scene, [D.x1 - 0.2, D.y + 0.02, z + 3]);
    }
    // pontoon boat
    boat = grp(scene, [6.5, WL, -100]);
    const alu = std(0xd3d7dc, { metalness: 0.85, roughness: 0.28 });
    [-1, 1].forEach(s => { mesh(new THREE.CylinderGeometry(0.35, 0.35, 6.2, 24), alu, boat, [s * 1.0, 0.1, 0], [Math.PI / 2, 0, 0]); mesh(new THREE.SphereGeometry(0.35, 20, 12), alu, boat, [s * 1.0, 0.1, 3.1], null, [1, 1, 1.6]); });
    mesh(new THREE.BoxGeometry(2.8, 0.15, 6.4), std(0x7f868c, { roughness: 0.7 }), boat, [0, 0.5, 0]);
    const fence = std(0xf2f2f2, { roughness: 0.4 });
    mesh(new THREE.BoxGeometry(2.8, 0.7, 0.08), fence, boat, [0, 0.9, 3.15]);
    [-1.38, 1.38].forEach(x => mesh(new THREE.BoxGeometry(0.08, 0.7, 6.3), fence, boat, [x, 0.9, 0]));
    mesh(new THREE.BoxGeometry(2.2, 0.5, 1.2), std(0x2e7d6b, { roughness: 0.6 }), boat, [0, 0.8, -1.5]);
    mesh(new THREE.BoxGeometry(2.9, 0.06, 3.2), std(0x2f6f6a, { roughness: 0.7 }), boat, [0, 2.3, 0.3]);
    [[-1.3, 1.6], [1.3, 1.6], [-1.3, -1.2], [1.3, -1.2]].forEach(([x, z]) => mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.8, 8), alu, boat, [x, 1.4, z]));
    addShadow(boat);
    colliders.boxes.push({ x0: 5, x1: 8, z0: -103.5, z1: -96.5 });
    const s = canvasTex(256, 160, (g, w) => { g.fillStyle = '#f2d23c'; g.fillRect(0, 0, w, 160); g.fillStyle = '#222'; g.font = 'bold 34px sans-serif'; g.textAlign = 'center'; g.fillText('GOOD DOGS', w / 2, 60); g.fillText('SWIM FREE', w / 2, 110); });
    mesh(new THREE.PlaneGeometry(0.9, 0.56), std(0xffffff, { map: s }), scene, [D.x1 + 0.32, 2.2, D.z0 + 8], [0, -Math.PI / 2, 0]);
  }

  // Andy's duck blind on the shore: a low plank stand with a reed screen
  function buildBlind() {
    const b = grp(scene, [P.blind.x, groundH(P.blind.x, P.blind.z), P.blind.z]);
    const wood = std(0x6e5a42, { roughness: 0.95 });
    mesh(new THREE.BoxGeometry(4, 0.12, 2.2), wood, b, [0, 0.06, 0.2]);
    [[-1.9, -0.8], [1.9, -0.8], [-1.9, 1.2], [1.9, 1.2]].forEach(([x, z]) => mesh(new THREE.BoxGeometry(0.1, 1.3, 0.1), wood, b, [x, 0.65, z]));
    const reedTex = canvasTex(256, 128, (g, w, h) => { for (let i = 0; i < 500; i++) { const x = rand() * w, top = rand() * 40; g.strokeStyle = `hsl(${45 + rand() * 30},${30 + rand() * 20}%,${30 + rand() * 25}%)`; g.lineWidth = 1.5 + rand() * 2; g.beginPath(); g.moveTo(x, h); g.quadraticCurveTo(x + (rand() - 0.5) * 10, h / 2, x + (rand() - 0.5) * 16, top); g.stroke(); } });
    reedTex.wrapS = THREE.RepeatWrapping;
    const reedM = std(0xffffff, { map: reedTex, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.9 });
    const reedDepth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: reedTex, alphaTest: 0.4 });
    const pole = std(0x5a4630, { roughness: 0.9 }), stalkM = std(0x9a8a52, { roughness: 0.85 }), headM = std(0x4a3020, { roughness: 0.95 });
    // each wall is three staggered reed layers with ragged tops, lashed to two poles, with loose stalks and cattails poking out
    [[0, -0.85, 0, 4], [-1.95, 0.2, Math.PI / 2, 2.1], [1.95, 0.2, Math.PI / 2, 2.1]].forEach(([x, z, r, w]) => {
      const nx = Math.sin(r), nz = Math.cos(r), tx = Math.cos(r), tz = -Math.sin(r);
      [[-0.08, 1.22, 0.1], [0, 1.42, 0.43], [0.08, 1.3, 0.77]].forEach(([off, h, u]) => {
        const g = new THREE.PlaneGeometry(w, h), uv = g.attributes.uv;
        for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * w / 2.2 + u);
        const m = mesh(g, reedM, b, [x + nx * off, h / 2 + 0.06, z + nz * off], [0, r + (rand() - 0.5) * 0.05, 0]); m.customDepthMaterial = reedDepth;
      });
      [0.38, 0.98].forEach(y => mesh(new THREE.CylinderGeometry(0.025, 0.025, w + 0.1, 8), pole, b, [x + nx * 0.13, y, z + nz * 0.13], [0, r, Math.PI / 2]));
      for (let i = 0; i < Math.round(w * 6); i++) {
        const along = (rand() - 0.5) * w, side = (rand() - 0.5) * 0.24, h = 1.25 + rand() * 0.55, lean = (rand() - 0.5) * 0.25;
        const px = x + tx * along + nx * side, pz = z + tz * along + nz * side;
        mesh(new THREE.CylinderGeometry(0.006, 0.01, h, 5), stalkM, b, [px, h / 2 + 0.06, pz], [lean * nz, 0, -lean * nx]);
        if (rand() < 0.35) mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.16, 7), headM, b, [px + lean * nx * h * 0.5, h + 0.02, pz + lean * nz * h * 0.5], [lean * nz, 0, -lean * nx]);
      }
    });
    colliders.boxes.push({ x0: P.blind.x - 2, x1: P.blind.x + 2, z0: P.blind.z - 0.95, z1: P.blind.z - 0.75 });
  }

  function buildFar() {
    const cols = [0xd8d2c4, 0xa9b8c4, 0xe6ddc9, 0x8f6b55, 0xcfd6dd].map(c => std(c, { roughness: 0.8 })), roofM = std(0x4a4e57);
    const wm = std(0x2a3340, { emissive: 0xffc56b, emissiveIntensity: 0, roughness: 0.2 }); windowMats.push(wm);
    const row = grp(scene, [0, 0, 0]); // one group with shared materials, so the whole row bakes into a few draw calls
    // a row of houses up on the ridge beyond the south shore, above the woods
    for (let i = 0; i < 14; i++) {
      const x = -90 + i * 14, z = -251 - (i % 3) * 4, y = terrainH(x, z) - 0.3;
      const w = rnd(5, 9), d = rnd(5, 7), h = rnd(3.5, 6);
      P.farHouses.push([x, z, Math.max(w, d) * 0.75 + 1.5]);
      mesh(new THREE.BoxGeometry(w, h, d), cols[i % 5], row, [x, y + h / 2, z]);
      mesh(new THREE.ConeGeometry(Math.max(w, d) * 0.75, 2.6, 4), roofM, row, [x, y + h + 1.3, z], [0, Math.PI / 4, 0]);
      mesh(new THREE.BoxGeometry(w * 0.6, 0.8, 0.1), wm, row, [x, y + h * 0.55, z + d / 2 + 0.05]);
    }
  }

  // ================= Lake Haigler: start arch, Gateway Canteen, campground, bridges, dam and spillway, kayak center =================
  let lakeFx = null;
  // a point in a frame at (x, z) turned by ry: a across (local x), b along (local z)
  const local = (x, z, ry, a, b) => [x + a * Math.cos(ry) + b * Math.sin(ry), z - a * Math.sin(ry) + b * Math.cos(ry)];
  function signTex(lines, o = {}) {
    const w = o.w || 512, h = o.h || 256;
    return canvasTex(w, h, (g) => {
      g.fillStyle = o.bg || '#4b3321'; g.fillRect(0, 0, w, h);
      g.strokeStyle = o.edge || '#e8d9b8'; g.lineWidth = 8; g.strokeRect(16, 16, w - 32, h - 32);
      g.fillStyle = o.ink || '#f5ecd4'; g.textAlign = 'center'; g.textBaseline = 'middle';
      lines.forEach(([t, px], i) => { g.font = `bold ${px}px sans-serif`; g.fillText(t, w / 2, h * (i + 1) / (lines.length + 1)); });
    });
  }
  // a two-post trail sign, readable from both sides
  function trailSign(x, z, ry, lines, o = {}) {
    const W = o.width || 1.7, H = W * (o.h || 256) / (o.w || 512), top = o.top || 1.9, post = std(0x5b4128, { roughness: 0.95 });
    const s = skipMirror(grp(scene, [x, groundH(x, z), z])); s.rotation.y = ry;
    [-1, 1].forEach(k => { mesh(new THREE.BoxGeometry(0.11, top + 0.4, 0.11), post, s, [k * (W / 2 - 0.08), top / 2 - 0.2, 0]); const [cx, cz] = local(x, z, ry, k * (W / 2 - 0.08), 0); colliders.circles.push([cx, cz, 0.12]); });
    mesh(new THREE.BoxGeometry(W + 0.08, H + 0.08, 0.05), post, s, [0, top - H / 2 - 0.05, 0]);
    const face = std(0xffffff, { map: signTex(lines, o), roughness: 0.8 });
    [1, -1].forEach(k => mesh(new THREE.PlaneGeometry(W, H), face, s, [0, top - H / 2 - 0.05, k * 0.027], [0, k > 0 ? 0 : Math.PI, 0]));
    return s;
  }
  // the trail point nearest (x, z) and the unit direction from it to (x, z)
  function fromTrail(x, z) { const n = Course.near(x, z), p = Course.S[n.i], d = Math.hypot(x - p.x, z - p.z) || 1; return { p, s: n.s, dx: (x - p.x) / d, dz: (z - p.z) / d }; }
  // a spot beside the trail at distance s, off to the lake side (side 1) or the woods side (side -1)
  function besideTrail(s, off, side) {
    const p = Course.at(s), t = Course.tanAt(s), nx = -t.z, nz = t.x, k = lakeField(p.x + nx * 4, p.z + nz * 4) < lakeField(p.x - nx * 4, p.z - nz * 4) ? 1 : -1;
    return { x: p.x + nx * off * k * side, z: p.z + nz * off * k * side, nx: nx * k * side, nz: nz * k * side };
  }
  function picnicTable(x, z, ry, wood) {
    const t = skipMirror(grp(scene, [x, groundH(x, z), z])); t.rotation.y = ry;
    mesh(new THREE.BoxGeometry(1.9, 0.06, 0.78), wood, t, [0, 0.76, 0]);
    [-1, 1].forEach(k => {
      mesh(new THREE.BoxGeometry(1.9, 0.05, 0.26), wood, t, [0, 0.45, k * 0.62]);
      [-0.72, 0.72].forEach(xx => mesh(new THREE.BoxGeometry(0.07, 0.86, 0.08), wood, t, [xx, 0.4, k * 0.38], [-k * 0.5, 0, 0]));
    });
    [-0.72, 0.72].forEach(xx => mesh(new THREE.BoxGeometry(0.07, 0.06, 1.5), wood, t, [xx, 0.42, 0]));
    colliders.circles.push([x, z, 1.05]);
  }
  const tri = (w, h) => new THREE.Shape([new THREE.Vector2(-w / 2, 0), new THREE.Vector2(w / 2, 0), new THREE.Vector2(0, h)]);
  function prism(w, h, len) { const g = new THREE.ExtrudeGeometry(tri(w, h), { depth: len, bevelEnabled: false }); g.translate(0, 0, -len / 2); return g; }
  function tent(x, z, ry, col, sc = 1) {
    const t = skipMirror(grp(scene, [x, groundH(x, z), z])); t.rotation.y = ry; t.scale.setScalar(sc);
    mesh(prism(2.1, 1.35, 2.4), std(col, { roughness: 0.85 }), t);
    mesh(new THREE.ShapeGeometry(tri(0.95, 1.0)), std(0x2a2622, { roughness: 1 }), t, [0, 0.01, 1.215]);
    mesh(prism(2.5, 1.5, 1.6), std(new THREE.Color(col).multiplyScalar(0.8).getHex(), { roughness: 0.85, side: THREE.DoubleSide }), t, [0, -0.02, -0.25], null, [1, 1, 1]); // rain fly over the back half
    const peg = std(0xb0b0b0, { metalness: 0.6, roughness: 0.4 });
    [-1, 1].forEach(k => mesh(new THREE.CylinderGeometry(0.015, 0.015, 1.9, 5), peg, t, [k * 1.55, 0.62, -0.25], [0, 0, k * 0.95]));
    colliders.circles.push([x, z, 1.35 * sc]);
  }
  function fireRing(x, z) {
    const f = skipMirror(grp(scene, [x, groundH(x, z), z]));
    const stone = std(0x8a8580, { roughness: 0.95 }), sg = new THREE.IcosahedronGeometry(0.17, 0);
    for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; mesh(sg, stone, f, [Math.cos(a) * 0.75, 0.07, Math.sin(a) * 0.75], [rand2() * 3, rand2() * 3, 0], [1, 0.7, 1]); }
    mesh(new THREE.CircleGeometry(0.64, 18), std(0x2b2724, { roughness: 1 }), f, [0, 0.03, 0], [-Math.PI / 2, 0, 0]);
    const logM = std(0x5a3c24, { roughness: 0.9 });
    [0, 2.1, 4.2].forEach(a => { const l = mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.9, 7), logM, f, [-0.378 * Math.sin(a), 0.26, -0.378 * Math.cos(a)]); l.rotation.order = 'YXZ'; l.rotation.set(1.0, a, 0); });
    colliders.circles.push([x, z, 0.85]);
  }
  function kayak(par, x, y, z, ry, col) {
    const k = skipMirror(grp(par, [x, y, z])); k.rotation.y = ry;
    mesh(new THREE.SphereGeometry(1, 18, 10), std(col, { roughness: 0.35 }), k, [0, 0.12, 0], null, [0.34, 0.17, 1.65]);
    mesh(new THREE.CircleGeometry(1, 16), std(0x1d1d1d, { roughness: 0.8 }), k, [0, 0.29, -0.15], [-Math.PI / 2, 0, 0], [0.22, 0.42, 1]);
    return k;
  }

  function buildLake() {
    const wp = woodPair(), wood = std(0xffffff, { map: wp.map, normalMap: wp.normalMap, roughness: 0.78 });
    const deckWood = std(0xb69a78, { map: wp.map, normalMap: wp.normalMap, roughness: 0.85 });
    const metal = std(0x2a2e33, { metalness: 0.7, roughness: 0.4 });
    const concC = noiseCanvas(256, 8, 5, v => [150 + v * 40, 148 + v * 38, 140 + v * 36]);
    const conc = std(0xffffff, { map: toTex(concC, [3, 1]), normalMap: normalFrom(concC, 2, [3, 1]), roughness: 0.92 });

    // ---- start and finish arch, with the checkered line ----
    {
      const S = Course.START, ry = S.ang, a = grp(scene, [S.x, groundH(S.x, S.z), S.z]); a.rotation.y = ry;
      const bk = barkTextures(), logM = std(0xb08a64, { map: bk.map, normalMap: bk.normalMap, roughness: 0.9 });
      [-1, 1].forEach(k => { mesh(new THREE.CylinderGeometry(0.2, 0.25, 5.1, 12), logM, a, [k * 3.3, 2.05, 0]); const [px, pz] = local(S.x, S.z, ry, k * 3.3, 0); colliders.circles.push([px, pz, 0.3]); });
      mesh(new THREE.CylinderGeometry(0.18, 0.18, 7.4, 12), logM, a, [0, 4.42, 0], [0, 0, Math.PI / 2]);
      const ban = canvasTex(1024, 200, (g, w, h) => {
        const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#2f7a57'); gr.addColorStop(1, '#205c41'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
        g.strokeStyle = '#f6e7b8'; g.lineWidth = 8; g.strokeRect(10, 10, w - 20, h - 20);
        for (let i = 0; i < 2; i++) for (let y = 0; y < 4; y++) for (let x = 0; x < 3; x++) { g.fillStyle = (x + y) % 2 ? '#111' : '#fff'; g.fillRect((i ? w - 96 : 36) + x * 20, 60 + y * 20, 20, 20); }
        g.fillStyle = '#fff8e4'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = 'bold 92px sans-serif'; g.fillText('LAKE HAIGLER DASH', w / 2, h / 2 + 4);
      });
      const banM = std(0xffffff, { map: ban, roughness: 0.8, side: THREE.DoubleSide });
      mesh(new THREE.BoxGeometry(6.0, 1.2, 0.04), std(0x205c41, { roughness: 0.8 }), a, [0, 3.62, 0]);
      [1, -1].forEach(k => mesh(new THREE.PlaneGeometry(5.9, 1.15), banM, a, [0, 3.62, k * 0.025], [0, k > 0 ? 0 : Math.PI, 0]));
      [-2.6, 2.6].forEach(x => mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.6, 4), metal, a, [x, 4.0, 0]));
      const chk = canvasTex(256, 32, (g, w, h) => { for (let x = 0; x < 16; x++) for (let y = 0; y < 2; y++) { g.fillStyle = (x + y) % 2 ? '#1a1a1a' : '#f4f4f0'; g.fillRect(x * 16, y * 16, 16, 16); } });
      mesh(new THREE.PlaneGeometry(6.2, 0.78), std(0xffffff, { map: chk, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -2 }), a, [0, 0.035, 0], [-Math.PI / 2, 0, 0]).castShadow = false;
    }

    // ---- the Gateway Canteen: a little snack shop by the start line, with picnic tables out front ----
    {
      const c = P.canteen, b = skipMirror(grp(scene, [c.x, groundH(c.x, c.z), c.z])); // the front faces the trail (south)
      const sd = texPair(256, 256, (g, W, H) => { g.fillStyle = '#6f8a62'; g.fillRect(0, 0, W, H); for (let x = 0; x < W; x += 16) { g.fillStyle = 'rgba(30,40,25,0.4)'; g.fillRect(x, 0, 3, H); g.fillStyle = 'rgba(255,255,255,0.08)'; g.fillRect(x + 4, 0, 2, H); } for (let i = 0; i < 400; i++) { g.fillStyle = `rgba(0,0,0,${rand2() * 0.08})`; g.fillRect(rand2() * W, rand2() * H, 2, 6); } }, [3, 1.5], 1.5);
      const wall = std(0xffffff, { map: sd.map, normalMap: sd.normalMap, roughness: 0.85 }), trim = std(0xf1ead8, { roughness: 0.7 });
      mesh(new THREE.BoxGeometry(8.2, 0.9, 5.2), std(0x8d8478, { roughness: 0.95 }), b, [0, -0.3, 0]);
      mesh(new THREE.BoxGeometry(8, 3, 5), wall, b, [0, 1.65, 0]);
      mesh(prism(6.4, 1.7, 9), std(0x3f4f47, { roughness: 0.5, metalness: 0.35 }), b, [0, 3.13, 0], [0, Math.PI / 2, 0]);
      [-1, 1].forEach(k => mesh(new THREE.BoxGeometry(0.14, 3, 0.14), trim, b, [k * 4, 1.65, -2.5]));
      const glass = std(0x2a3340, { emissive: 0xffc56b, emissiveIntensity: 0, roughness: 0.15 }); windowMats.push(glass);
      mesh(new THREE.BoxGeometry(2.8, 1.15, 0.06), glass, b, [-1.4, 1.75, -2.52]);
      mesh(new THREE.BoxGeometry(3.1, 0.08, 0.5), trim, b, [-1.4, 1.12, -2.72]);
      const stripe = canvasTex(128, 64, (g) => { for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#f4efe4' : '#c8402f'; g.fillRect(i * 16, 0, 16, 64); } });
      mesh(new THREE.BoxGeometry(3.4, 0.05, 1.1), std(0xffffff, { map: stripe, roughness: 0.8 }), b, [-1.4, 2.62, -3.0], [-0.35, 0, 0]);
      mesh(new THREE.BoxGeometry(1.05, 2.15, 0.06), std(0x7a4b2a, { roughness: 0.7 }), b, [2.3, 1.22, -2.52]);
      mesh(new THREE.BoxGeometry(1.2, 0.08, 0.08), trim, b, [2.3, 2.34, -2.53]);
      [-1, 1].forEach(k => mesh(new THREE.BoxGeometry(0.06, 1.0, 1.4), glass, b, [k * 4.02, 1.8, 0]));
      const sg = std(0xffffff, { map: signTex([['GATEWAY CANTEEN', 66], ['snacks  ·  drinks  ·  ice cream', 30]], { w: 768, h: 160, bg: '#f3ead2', ink: '#2c4a3a', edge: '#2c4a3a' }), roughness: 0.75 });
      mesh(new THREE.PlaneGeometry(4.8, 1.0), sg, b, [0.1, 2.72, -2.53], [0, Math.PI, 0]);
      colliders.boxes.push({ x0: c.x - 4.1, x1: c.x + 4.1, z0: c.z - 2.6, z1: c.z + 2.6 });
      picnicTable(c.x - 4.2, c.z - 6.6, 0.15, wood); picnicTable(c.x + 0.8, c.z - 7.2, -0.1, wood);
      const can = skipMirror(grp(scene, [c.x + 4.6, groundH(c.x + 4.6, c.z - 3.4), c.z - 3.4]));
      mesh(new THREE.CylinderGeometry(0.32, 0.28, 0.95, 14), std(0x2f5d45, { roughness: 0.6 }), can, [0, 0.47, 0]);
      colliders.circles.push([c.x + 4.6, c.z - 3.4, 0.35]);
    }

    // ---- the campground on the west shore ----
    {
      const c = P.camp;
      tent(c.x - 5, c.z + 3.5, 2.6, 0xd8742f); tent(c.x + 3.5, c.z + 5.5, -2.7, 0x3f7f5a, 0.9); tent(c.x - 4.5, c.z - 5, 1.2, 0x3f6aa8, 1.1);
      fireRing(c.x + 0.5, c.z - 0.5);
      const lg = std(0x6a4a2e, { roughness: 0.9 });
      [[c.x + 2.2, c.z - 1.6, 0.6], [c.x - 1.4, c.z + 1.0, 2.2]].forEach(([x, z, r]) => { const l = skipMirror(grp(scene, [x, groundH(x, z), z])); l.rotation.y = r; mesh(new THREE.CylinderGeometry(0.2, 0.22, 1.8, 10), lg, l, [0, 0.2, 0], [0, 0, Math.PI / 2]); colliders.circles.push([x, z, 0.5]); });
      picnicTable(c.x + 5.5, c.z - 4, 0.4, wood);
      const f = fromTrail(c.x, c.z), sp = { x: f.p.x + f.dx * 4, z: f.p.z + f.dz * 4 };
      trailSign(sp.x, sp.z, Math.atan2(f.dx, f.dz), [['HAIGLER', 54], ['CAMPGROUND', 54]]);
    }

    // ---- the two wooden bridges over the arms ----
    Course.BRIDGES.forEach(Bd => {
      const b = grp(scene, [Bd.x, 0, Bd.z]); b.rotation.y = Bd.ang;
      const deck = a => Bd.y + Bd.arch * (1 - (a / Bd.hl) ** 2), slope = a => -2 * Bd.arch * a / (Bd.hl * Bd.hl);
      const plank = new THREE.BoxGeometry(2 * Bd.hw, 0.06, 0.15);
      for (let a = -Bd.hl + 0.08; a < Bd.hl; a += 0.17) mesh(plank, deckWood, b, [0, deck(a) - 0.03, a], [-Math.atan(slope(a)), (rand2() - 0.5) * 0.02, 0]);
      const n = Math.max(4, Math.round(Bd.hl * 2 / 1.7)), step = 2 * Bd.hl / n;
      const beam = (x, y0, w, h, mat) => { for (let i = 0; i < n; i++) { const a0 = -Bd.hl + i * step, a1 = a0 + step, y1 = deck(a0) + y0, y2 = deck(a1) + y0; mesh(new THREE.BoxGeometry(w, h, Math.hypot(step, y2 - y1) + 0.02), mat, b, [x, (y1 + y2) / 2, (a0 + a1) / 2], [-Math.atan2(y2 - y1, step), 0, 0]); } };
      [-1, 1].forEach(k => {
        const x = k * (Bd.hw - 0.06);
        beam(k * (Bd.hw - 0.2), -0.2, 0.16, 0.24, wood); // stringers
        beam(x, 0.95, 0.09, 0.09, wood); beam(x, 0.5, 0.06, 0.06, wood); // rails
        for (let i = 0; i <= n; i++) { const a = -Bd.hl + i * step; mesh(new THREE.BoxGeometry(0.1, 1.05, 0.1), wood, b, [x, deck(a) + 0.47, a]); }
        [-0.5, 0, 0.5].forEach(f => { const a = f * Bd.hl; mesh(new THREE.CylinderGeometry(0.13, 0.13, 3.2, 10), wood, b, [k * (Bd.hw - 0.15), deck(a) - 1.75, a]); });
        const [ax, az] = local(Bd.x, Bd.z, Bd.ang, x, -Bd.hl), [bx, bz] = local(Bd.x, Bd.z, Bd.ang, x, Bd.hl);
        colliders.segs.push([ax, az, bx, bz]);
      });
    });

    // ---- the dam: spillway walls, the weir and its waterfall, a footbridge, the crest railing and the creek ----
    {
      const dm = grp(scene, [0, 0, 0]);
      const wallH = D.crest - (D.creekY - 0.3), wallY = (D.crest + D.creekY - 0.3) / 2;
      [-1, 1].forEach(k => {
        mesh(new THREE.BoxGeometry(82 - 74.5, wallH, 0.4), conc, dm, [(82 + 74.5) / 2, wallY, D.cz + k * (D.notch + 0.2)]); // training walls along the spillway
        const z0 = D.notch + 0.4, z1 = D.creekHalf + 3.5; // the headwall below the crest, either side of the notch
        mesh(new THREE.BoxGeometry(0.45, wallH, z1 - z0), conc, dm, [D.weir + 0.22, wallY, D.cz + k * (z0 + z1) / 2]);
      });
      mesh(new THREE.BoxGeometry(0.3, D.notchY - D.creekY + 0.25, 2 * D.notch), conc, dm, [D.weir - 0.15, (D.notchY + D.creekY - 0.25) / 2, D.cz]); // the weir, just behind the lip
      mesh(new THREE.BoxGeometry(4, 0.2, 2 * D.creekHalf), conc, dm, [D.weir + 2.2, D.creekY - 0.08, D.cz]); // splash apron
      // the railing along the downstream edge of the crest (it is also the footbridge's east rail)
      const RX = D.x2, rz0 = D.cz - D.half + 1, rz1 = D.cz + D.half - 1, nP = Math.round((rz1 - rz0) / 2.2);
      for (let i = 0; i <= nP; i++) mesh(new THREE.CylinderGeometry(0.045, 0.05, 1.05, 8), metal, dm, [RX, D.crest + 0.52, rz0 + i * (rz1 - rz0) / nP]);
      [0.55, 1.02].forEach(y => mesh(new THREE.CylinderGeometry(0.035, 0.035, rz1 - rz0, 8), metal, dm, [RX, D.crest + y, (rz0 + rz1) / 2], [Math.PI / 2, 0, 0]));
      colliders.segs.push([RX, rz0, RX, rz1]);
      // the footbridge over the spillway
      const F = Course.FOOT, fb = grp(scene, [F.x, 0, F.z]);
      const fdeck = a => F.y + F.arch * (1 - (a / F.hl) ** 2), fpl = new THREE.BoxGeometry(2 * F.hw, 0.06, 0.15);
      for (let a = -F.hl + 0.08; a < F.hl; a += 0.17) mesh(fpl, deckWood, fb, [0, fdeck(a) - 0.03, a], [-Math.atan(-2 * F.arch * a / (F.hl * F.hl)), 0, 0]);
      [-1, 1].forEach(k => mesh(new THREE.BoxGeometry(0.18, 0.22, 2 * F.hl), wood, fb, [k * (F.hw - 0.12), F.y - 0.12, 0]));
      const wx = -F.hw + 0.05;
      for (let a = -F.hl; a <= F.hl + 0.01; a += F.hl / 2) mesh(new THREE.CylinderGeometry(0.045, 0.05, 1.05, 8), metal, fb, [wx, fdeck(a) + 0.5, a]);
      [0.55, 1.02].forEach(y => mesh(new THREE.CylinderGeometry(0.035, 0.035, 2 * F.hl, 8), metal, fb, [wx, F.y + F.arch * 0.6 + y, 0], [Math.PI / 2, 0, 0]));
      colliders.segs.push([F.x + wx, F.z - F.hl, F.x + wx, F.z + F.hl]);
      // the waterfall: a sheet that leaves the weir and falls to the creek
      const H = WL - CREEK_WL, fg = new THREE.PlaneGeometry(2 * D.notch, 1, 1, 14), fp = fg.attributes.position;
      for (let i = 0; i < fp.count; i++) { const t = 0.5 - fp.getY(i); fp.setXYZ(i, D.weir + 0.04 + 0.8 * t, WL + 0.02 - H * t * t, D.cz + fp.getX(i)); }
      fg.computeVertexNormals();
      const streak = canvasTex(128, 256, (g, w, h) => { g.fillStyle = 'rgba(150,185,185,0.72)'; g.fillRect(0, 0, w, h); for (let i = 0; i < 220; i++) { const x = rand2() * w, y = rand2() * h, l = 20 + rand2() * 90; g.fillStyle = `rgba(255,255,255,${0.35 + rand2() * 0.6})`; g.fillRect(x, y, 1 + rand2() * 3, l); g.fillRect(x, y - h, 1 + rand2() * 3, l); } });
      streak.wrapS = streak.wrapT = THREE.RepeatWrapping; streak.repeat.set(2.5, 1.2);
      const fall = mesh(fg, std(0xffffff, { map: streak, transparent: true, opacity: 0.95, roughness: 0.2, side: THREE.DoubleSide, depthWrite: false, emissive: 0x6f8c8c, emissiveIntensity: 0.45 }), scene);
      fall.name = 'waterfall'; fall.castShadow = false;
      const foamT = canvasTex(256, 128, (g, w, h) => { for (let i = 0; i < 260; i++) { const x = rand2() * w, y = rand2() * h, r = 4 + rand2() * 14; wrapDraw(w, h, x, y, r, (X, Y) => { const gr = g.createRadialGradient(X, Y, 0, X, Y, r); gr.addColorStop(0, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.beginPath(); g.arc(X, Y, r, 0, 7); g.fill(); }); } });
      foamT.wrapS = foamT.wrapT = THREE.RepeatWrapping;
      const foam = mesh(new THREE.PlaneGeometry(3.6, 2 * D.creekHalf - 0.4), std(0xffffff, { map: foamT, transparent: true, depthWrite: false, roughness: 0.6 }), scene, [D.weir + 2.4, CREEK_WL + 0.03, D.cz], [-Math.PI / 2, 0, 0]);
      foam.name = 'foam'; foam.castShadow = false;
      // the creek below the dam, flowing east
      const cn = waterNormalsTex(); cn.wrapS = cn.wrapT = THREE.RepeatWrapping; cn.repeat.set(24, 2);
      const cw = mesh(new THREE.PlaneGeometry(200 - D.weir, 2 * D.creekHalf + 1), std(0x24413b, { roughness: 0.06, metalness: 0.1, normalMap: cn, normalScale: new THREE.Vector2(0.35, 0.35), transparent: true, opacity: 0.86 }), scene, [(200 + D.weir) / 2 + 0.15, CREEK_WL, D.cz], [-Math.PI / 2, 0, 0]);
      cw.name = 'creek'; cw.castShadow = false;
      lakeFx = { streak, foamT, cn };
      // signs at both ends of the dam
      [[D.cz + D.half + 4, 'north'], [D.cz - D.half - 3, 'south']].forEach(([z]) => { const p = besideTrail(Course.sOf(78.5, z), 3.6, -1); trailSign(p.x, p.z, Math.atan2(p.nx, p.nz), [['HAIGLER DAM', 50], ['spillway ahead', 34]]); });
    }

    // ---- the kayak center: a boathouse up the bank and boats on the beach ----
    {
      const k = P.kayakShed, f = fromTrail(k.x, k.z), ry = Math.atan2(-f.dx, -f.dz); // its doors face the trail and the lake
      const b = skipMirror(grp(scene, [k.x, groundH(k.x, k.z), k.z])); b.rotation.y = ry;
      const sd = texPair(256, 256, (g, W, H) => { g.fillStyle = '#8e3b2e'; g.fillRect(0, 0, W, H); for (let x = 0; x < W; x += 21) { g.fillStyle = 'rgba(40,10,5,0.4)'; g.fillRect(x, 0, 3, H); } }, [2, 1], 1.5);
      mesh(new THREE.BoxGeometry(5.4, 0.6, 3.8), std(0x8d8478, { roughness: 0.95 }), b, [0, -0.15, 0]);
      mesh(new THREE.BoxGeometry(5.2, 2.6, 3.6), std(0xffffff, { map: sd.map, normalMap: sd.normalMap, roughness: 0.85 }), b, [0, 1.45, 0]);
      mesh(prism(4.4, 1.2, 6.0), std(0x4a4f55, { roughness: 0.5, metalness: 0.4 }), b, [0, 2.75, 0], [0, Math.PI / 2, 0]);
      mesh(new THREE.BoxGeometry(3.2, 2.1, 0.05), std(0x3a2a1e, { roughness: 0.8 }), b, [0, 1.2, 1.81]);
      const sg = std(0xffffff, { map: signTex([['KAYAK CENTER', 60]], { w: 512, h: 128, bg: '#f3ead2', ink: '#7a2a20', edge: '#7a2a20' }), roughness: 0.75 });
      mesh(new THREE.PlaneGeometry(3.0, 0.75), sg, b, [0, 2.48, 1.83]);
      [[1.1, 0xd23b2e], [-1.1, 0xf2c23a]].forEach(([x, col]) => kayak(b, x, 0.02, 2.9, 0.05, col));
      const [c0x, c0z] = local(k.x, k.z, ry, -1.4, 0), [c1x, c1z] = local(k.x, k.z, ry, 1.4, 0);
      colliders.circles.push([c0x, c0z, 1.9], [c1x, c1z, 1.9]);
      // boats pulled up on the sand, noses to the water
      const L = P.kayak, toLake = Math.atan2(P.lake.cx - L.x, P.lake.cz - L.z), cols = [0xe0522b, 0x2f9ad0, 0xf2c23a, 0x39a36b];
      cols.forEach((col, i) => { const o = (i - 1.5) * 1.5, x = L.x + Math.cos(toLake) * o, z = L.z - Math.sin(toLake) * o; kayak(scene, x, groundH(x, z), z, toLake + (i - 1.5) * 0.08, col); colliders.circles.push([x, z, 0.5]); });
      trailSign(f.p.x + f.dx * 3.8, f.p.z + f.dz * 3.8, Math.atan2(f.dx, f.dz), [['KAYAK CENTER', 50], ['rentals  ·  launch', 34]]);
    }

    // ---- benches looking out over the water ----
    [0.33, 0.555, 0.68].forEach(u => { const p = besideTrail(u * Course.LEN, 3.4, 1); bench(p.x, p.z, Math.atan2(p.nx, p.nz)); });
  }

  function buildFx() {
    const glow = glowTex();
    const fg = new THREE.BufferGeometry(); fg.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(3 * 120), 3));
    fireflyPts = new THREE.Points(fg, new THREE.PointsMaterial({ color: 0xfff39a, size: 0.35, map: glow, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
    fireflyPts.userData.seeds = Array.from({ length: 120 }, () => [-60 + rand() * 130, -90 + rand() * 170, rand() * 6]);
    fireflyPts.frustumCulled = false; scene.add(fireflyPts);
    // drifting pollen motes that catch the sunlight around the player
    const mg = new THREE.BufferGeometry(); mg.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(3 * 160), 3));
    motes = new THREE.Points(mg, new THREE.PointsMaterial({ color: 0xfff6d8, size: 0.07, map: glow, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.55 }));
    motes.userData.seeds = Array.from({ length: 160 }, () => [rand() * 24 - 12, rand() * 4, rand() * 24 - 12, rand() * 6]);
    motes.frustumCulled = false; motes.layers.set(1); scene.add(motes);
  }

  // the world is built in steps so the loading screen can show real progress between them
  function buildSteps(sc, opt = {}) {
    let macro;
    return [
      ['Rolling out the sky', () => { scene = sc; renderer = opt.renderer; camera = opt.camera; tier = opt.tier || 'high'; camera.layers.enable(1); camera.layers.enable(2); buildGrid(); buildSky(); sun.shadow.camera.layers.enable(1); sun.shadow.camera.layers.enable(2); }],
      ['Shaping the hills', () => { macro = buildTerrain().macro; }],
      ['Filling the lake', () => buildWater()],
      ['Building the house', () => { buildHouse(); buildYard(); }],
      ['Opening the dog park', () => { buildPark(); buildDock(); buildBlind(); buildFar(); }],
      ['Building the bridges', () => buildLake()],
      ['Planting trees', () => buildNature(macro)],
      ['Growing the grass', () => buildGrass(macro)],
      // bake static props (house trim, fences, benches, boat) into fewer draw calls; materials stay shared by reference
      ['Finishing touches', () => { buildFx(); scene.children.forEach(c => { if (c.isGroup || c.isObject3D && c.children.length) Models.mergeStatic(c, true); }); noMirror.forEach(o => o.traverse(c => c.layers.set(2))); }],
    ];
  }
  function build(sc, opt = {}) { buildSteps(sc, opt).forEach(st => st[1]()); }

  // ================= time of day =================
  // el/az: sun (or moon) elevation and azimuth. Sky: Preetham turbidity, rayleigh, mie; exp = sky exposure.
  const TOD = {
    morning: { el: 0.24, az: -2.2, turb: 3.2, ray: 1.6, mie: 0.006, mieG: 0.82, exp: 0.62, night: 0, sun: 0xffd2a0, si: 2.6, hi: 0.22, fog: 0xd8d4cc, fogN: 90, fogF: 420, star: 0, lamps: 0, tone: 0.95, cloud: 0xfff0e2, water: 0xffe0b8 },
    noon: { el: 1.0, az: -0.8, turb: 2.4, ray: 1.0, mie: 0.005, mieG: 0.8, exp: 0.55, night: 0, sun: 0xfff4e2, si: 3.0, hi: 0.25, fog: 0xc6d8ea, fogN: 100, fogF: 460, star: 0, lamps: 0, tone: 0.85, cloud: 0xffffff, water: 0xfff6e8 },
    afternoon: { el: 0.6, az: 0.9, turb: 3.0, ray: 1.3, mie: 0.006, mieG: 0.82, exp: 0.58, night: 0, sun: 0xffe6bc, si: 2.8, hi: 0.24, fog: 0xd2d8d6, fogN: 95, fogF: 440, star: 0, lamps: 0, tone: 0.9, cloud: 0xfff8ee, water: 0xffeccc },
    golden: { el: 0.26, az: 1.35, turb: 4.5, ray: 2.0, mie: 0.007, mieG: 0.86, exp: 0.62, night: 0, sun: 0xffc27a, si: 2.6, hi: 0.2, fog: 0xe0c6a4, fogN: 85, fogF: 400, star: 0, lamps: 0, tone: 0.95, cloud: 0xffe0bc, water: 0xffcf8f },
    sunset: { el: 0.06, az: 1.6, turb: 6.5, ray: 2.8, mie: 0.009, mieG: 0.9, exp: 0.72, night: 0, sun: 0xff9a4d, si: 2.0, hi: 0.18, fog: 0xd59a72, fogN: 70, fogF: 360, star: 0.1, lamps: 0.6, tone: 1.05, cloud: 0xffa77a, water: 0xffa060 },
    night: { el: -0.1, az: 1.75, turb: 2.0, ray: 1.0, mie: 0.005, mieG: 0.8, exp: 0.5, night: 1, sun: 0x9fb6ff, si: 0.55, hi: 0.18, fog: 0x141c34, fogN: 40, fogF: 260, star: 1, lamps: 1, tone: 1.15, cloud: 0x3a4466, water: 0x8fa6e0 },
  };
  const cur = {}; let todKey = '', envT = 0;
  const MOON = new V3(Math.cos(2.4) * Math.cos(0.75), Math.sin(0.75), Math.sin(2.4) * Math.cos(0.75));
  function applyTOD(a, b, k) {
    const A = TOD[a], B = TOD[b || a]; k = b ? k : 0;
    const key = a + (b || '') + Math.round(k * 50);
    if (key === todKey) return; todKey = key;
    const c = (x, y) => new THREE.Color(x).lerp(new THREE.Color(y), k);
    const l = f => A[f] + (B[f] - A[f]) * k;
    cur.el = l('el'); cur.az = l('az');
    const sunDir = new V3(Math.cos(cur.az) * Math.cos(cur.el), Math.sin(cur.el), Math.sin(cur.az) * Math.cos(cur.el));
    // at night the key light is the moon
    const nt = l('night'), dir = sunDir.clone().lerp(MOON, nt).normalize(); cur.dir = dir;
    const u = sky.material.uniforms; u.moonDir.value.copy(MOON);
    u.turbidity.value = l('turb'); u.rayleigh.value = l('ray'); u.mieCoefficient.value = l('mie'); u.mieDirectionalG.value = l('mieG');
    u.skyExposure.value = l('exp'); u.night.value = nt; u.sunPosition.value.copy(sunDir).multiplyScalar(4000);
    const fogC = c(A.fog, B.fog); u.groundCol.value.copy(new THREE.Color(0x46553a).lerp(fogC, 0.25)).multiplyScalar(0.25 + 0.75 * (1 - l('night')));
    sun.color.copy(c(A.sun, B.sun)); sun.intensity = l('si');
    hemi.intensity = l('hi'); hemi.color.copy(fogC).lerp(new THREE.Color(0xbcd4ff), 0.5);
    scene.fog.color.copy(fogC); scene.fog.near = l('fogN'); scene.fog.far = l('fogF');
    renderer.toneMappingExposure = l('tone');
    stars.material.opacity = l('star');
    const lamps = l('lamps');
    windowMats.forEach(m => m.emissiveIntensity = lamps * 1.4);
    lampGlows.forEach(g => g.material.opacity = lamps * 0.85);
    fireflyPts.material.opacity = Math.max(0, lamps - 0.3) * 1.4;
    motes.material.opacity = 0.5 * (1 - lamps);
    const cc = c(A.cloud, B.cloud); clouds.forEach(cl => cl.userData.mat.color.copy(cc));
    const wu = water.material.uniforms; wu.sunColor.value.copy(c(A.water, B.water)); wu.sunDirection.value.copy(dir);
    wu.waterColor.value.copy(new THREE.Color(0x1f3a33).multiplyScalar(0.35 + 0.65 * (1 - l('night'))));
    // re-light the scene from the new sky (throttled during smooth transitions)
    const now = performance.now();
    if (!b || now - envT > 400 || k >= 1) { envT = now; const rt = pmrem.fromScene(envScene, 0, 0.1, 100); if (envRT) envRT.dispose(); envRT = rt; scene.environment = rt.texture; }
  }

  const snapV = new V3(), lx = new V3(), ly = new V3();
  function update(t, dt, focus) {
    water.material.uniforms.time.value = t * 0.6;
    swayers.forEach(U => U.uTime.value = t);
    updateGrass(focus);
    if (boat) { boat.position.y = WL + Math.sin(t * 1.2) * 0.05; boat.rotation.z = Math.sin(t * 0.9) * 0.02; boat.rotation.x = Math.cos(t * 0.7) * 0.012; }
    if (lakeFx) { lakeFx.streak.offset.y = t * 1.3; lakeFx.foamT.offset.set(t * 0.09, Math.sin(t * 0.7) * 0.05); lakeFx.cn.offset.x = -t * 0.05; }
    clouds.forEach(c => { c.position.x += c.userData.v * dt; if (c.position.x > 460) c.position.x = -460; });
    // the shadow camera follows the player, snapped to whole shadow-map texels so edges don't shimmer
    if (cur.dir) {
      const d = cur.dir, tx = sun.userData.texel;
      lx.set(0, 1, 0).cross(d).normalize(); ly.copy(d).cross(lx);
      const a = Math.round(focus.dot(lx) / tx) * tx, b = Math.round(focus.dot(ly) / tx) * tx, cz = focus.dot(d);
      snapV.copy(lx).multiplyScalar(a).addScaledVector(ly, b).addScaledVector(d, cz);
      sun.target.position.copy(snapV); sun.position.copy(snapV).addScaledVector(d, 100);
    }
    sky.position.copy(camera.position); stars.position.copy(camera.position);
    if (fireflyPts.material.opacity > 0) {
      const fp = fireflyPts.geometry.attributes.position, s = fireflyPts.userData.seeds;
      for (let i = 0; i < s.length; i++) { const [x, z, o] = s[i]; fp.setXYZ(i, x + Math.sin(t * 0.5 + o) * 2, groundH(x, z) + 1 + Math.sin(t * 1.3 + o * 3) * 0.6, z + Math.cos(t * 0.4 + o) * 2); }
      fp.needsUpdate = true;
    }
    if (motes.material.opacity > 0.01) {
      const mp = motes.geometry.attributes.position, s = motes.userData.seeds;
      for (let i = 0; i < s.length; i++) {
        const q = s[i]; let x = q[0] + Math.sin(t * 0.3 + q[3]) * 1.5 + t * 0.25, z = q[2] + Math.cos(t * 0.25 + q[3]) * 1.5;
        x = focus.x + ((((x - focus.x + 12) % 24) + 24) % 24) - 12; z = focus.z + ((((z - focus.z + 12) % 24) + 24) % 24) - 12;
        mp.setXYZ(i, x, groundH(x, z) + 0.3 + q[1] + Math.sin(t * 0.7 + q[3] * 2) * 0.3, z);
      }
      mp.needsUpdate = true;
    }
  }

  // flatten grass inside a rectangle (x0, z0, x1, z1), or pass nothing to clear it
  function setClearing(x0, z0, x1, z1) { swayers.forEach(U => { if (U.uClear) x0 === undefined ? U.uClear.value.set(1e5, 1e5, 1e5, 1e5) : U.uClear.value.set(x0, z0, x1, z1); }); }
  return { setClearing, P, WL, build, buildSteps, groundH, colliders, applyTOD, update, pathCurve, distPath, lakeE, lakeField, waterAt, WATER_X1, offTrail, glowTex, TOD };
})();
