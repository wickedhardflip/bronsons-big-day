// Lake Haigler: the dirt trail around the lake, its cove and two arms, the bridges, the dam and
// spillway, the hills and the race checkpoints. Pure geometry (no scene objects), so the world, the
// race and the tools all share one definition.
const Course = (() => {
  const V3 = THREE.Vector3, DEG = Math.PI / 180;
  const LK = { cx: 0, cz: -142, rx: 82, rz: 56 }; // same ellipse as World.P.lake
  const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const ellE = (x, z) => Math.hypot((x - LK.cx) / LK.rx, (z - LK.cz) / LK.rz);
  const ellPt = (th, e) => new V3(LK.cx + Math.cos(th) * LK.rx * e, 0, LK.cz + Math.sin(th) * LK.rz * e);

  // inlets: a wide cove on the west shore (the trail runs around it, a swim across it is a shortcut)
  // and two narrow arms in the southwest that the trail crosses on wooden bridges
  const INLETS = [
    { id: 'cove', th: 151 * DEG, e0: 0.9, e1: 1.3, w0: 9, w1: 6.5, ph: 0.7 },
    { id: 'arm1', th: 199 * DEG, e0: 0.92, e1: 1.42, w0: 4.2, w1: 2.4, ph: 2.1 },
    { id: 'arm2', th: 233 * DEG, e0: 0.92, e1: 1.4, w0: 4, w1: 2.3, ph: 4.4 },
  ];
  INLETS.forEach(I => {
    I.a = ellPt(I.th, I.e0); I.b = ellPt(I.th, I.e1); I.len = I.a.distanceTo(I.b);
    I.dir = I.b.clone().sub(I.a).divideScalar(I.len); I.n = new V3(-I.dir.z, 0, I.dir.x);
  });
  // an inlet's half width at distance s from its mouth: narrowing toward the tip, with a gentle wobble so the banks aren't straight
  const inletW = (I, s) => (I.w0 + (I.w1 - I.w0) * Math.min(1, s / I.len)) * (1 + 0.13 * Math.sin(s * 0.42 + I.ph) + 0.07 * Math.sin(s * 1.07 + I.ph * 2.3));
  // effective "how far out from the lake centre" for an inlet: 1.0 at its waterline banks, below 1 in the water
  function inletE(I, x, z) {
    const px = x - I.a.x, pz = z - I.a.z;
    const s = Math.max(0, Math.min(I.len, px * I.dir.x + pz * I.dir.z)), k = s / I.len;
    const q = Math.hypot(px - I.dir.x * s, pz - I.dir.z * s), w = inletW(I, s);
    const ec = 0.72 + 0.16 * k * k; // shallower toward the tip
    return ec + (1 - ec) * q / w;
  }
  // the shoreline field the terrain, the water and the map all use: the lake ellipse joined with the inlets
  function shoreE(x, z) {
    let e = ellE(x, z);
    if (e > 1.6) return e;
    for (let i = 0; i < INLETS.length; i++) e = Math.min(e, inletE(INLETS[i], x, z));
    return e;
  }

  // the dam runs north-south along the east shore; the trail is on its crest and a footbridge carries it over
  // the spillway notch, where the lake pours over a weir into the creek below
  const DAM = { x0: 69, x1: 76.5, x2: 80.5, cz: -142, half: 27, crest: 0.62, notch: 2.8, weir: 80.2, notchY: -0.47, creekY: -2.55, creekHalf: 4.5 };

  // ---------- the trail ----------
  // (angle on the lake ellipse in degrees, how far out): mostly just above the shore, wandering inland over the hills
  const ring = [[62, 1.17], [68, 1.17], [74, 1.17], [80, 1.17], [86, 1.17], [92, 1.17], [98, 1.18], [104, 1.19], [110, 1.2], [116, 1.21], [122, 1.21], [128, 1.2], [134, 1.2], [139, 1.2]];
  const ring2 = [[163, 1.21], [169, 1.22], [175, 1.23], [181, 1.23], [187, 1.22], [193, 1.2], [199, 1.19], [205, 1.2], [211, 1.21], [217, 1.22], [223, 1.21], [228, 1.2], [233, 1.19], [238, 1.2],
    [244, 1.21], [250, 1.22], [256, 1.23], [262, 1.23], [268, 1.22], [274, 1.22], [280, 1.23], [286, 1.22], [292, 1.21], [298, 1.2], [304, 1.18]];
  const COVE_M = 4.2, COVE_IN = 0.75, pts = [];
  ring.forEach(([a, e]) => pts.push(ellPt(a * DEG, e)));
  { // around the cove, a few metres up the bank from the water's edge
    const I = INLETS[0], at = (s, o) => I.a.clone().addScaledVector(I.dir, s).addScaledVector(I.n, o);
    const p0 = pts[pts.length - 1], side = Math.sign((p0.x - I.a.x) * I.n.x + (p0.z - I.a.z) * I.n.z);
    const edge = s => { const k = Math.min(1, s / I.len), w = inletW(I, Math.min(s, I.len)), ec = 0.72 + 0.16 * k * k; return w * (0.97 - ec) / (1 - ec) + COVE_M; };
    // up the north bank, round the tip on a half circle, then off south into the woods
    const sIn = I.len * COVE_IN, r = edge(I.len);
    pts.push(at(sIn, side * edge(sIn)), at(I.len * 0.93, side * r));
    [62, 31, 0, -31, -62].forEach(d => { const a = d * DEG; pts.push(at(I.len + Math.cos(a) * r * 0.95, side * Math.sin(a) * r)); });
  }
  ring2.forEach(([a, e]) => pts.push(ellPt(a * DEG, e)));
  [[62, -192], [71.5, -181], [78.5, -169], [78.5, -158], [78.5, -148], [78.5, -142], [78.5, -136], [78.5, -126], [78.5, -116], [75.5, -105.5], [67, -96], [56, -88.6]]
    .forEach(([x, z]) => pts.push(new V3(x, 0, z)));
  const curve = new THREE.CatmullRomCurve3(pts, true, 'centripetal');
  const N = 1400, S = curve.getSpacedPoints(N); S.pop(); // closed: the last point repeats the first
  const LEN = curve.getLength(), DS = LEN / N;
  const T = S.map((p, i) => { const a = S[(i + 1) % N], b = S[(i - 1 + N) % N]; return new V3(a.x - b.x, 0, a.z - b.z).normalize(); });
  const at = s => { s = ((s % LEN) + LEN) % LEN; const f = s / DS, i = Math.floor(f) % N, j = (i + 1) % N, k = f - Math.floor(f); return new V3(S[i].x + (S[j].x - S[i].x) * k, 0, S[i].z + (S[j].z - S[i].z) * k); };
  const tanAt = s => T[Math.round(((s % LEN) + LEN) % LEN / DS) % N];
  // spatial hash of the samples for fast nearest-point lookups
  const CELL = 12, hash = new Map(), key = (i, j) => i * 4096 + j;
  S.forEach((p, i) => { const k = key(Math.floor(p.x / CELL), Math.floor(p.z / CELL)); if (!hash.has(k)) hash.set(k, []); hash.get(k).push(i); });
  // nearest trail point: {d: distance, s: distance along the trail from the start line, i: sample}; d is 99 if it's far away
  function near(x, z) {
    const ci = Math.floor(x / CELL), cj = Math.floor(z / CELL); let best = 1e9, bi = -1;
    for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
      const l = hash.get(key(ci + di, cj + dj)); if (!l) continue;
      for (let n = 0; n < l.length; n++) { const p = S[l[n]], d = (p.x - x) ** 2 + (p.z - z) ** 2; if (d < best) { best = d; bi = l[n]; } }
    }
    if (bi < 0) return { d: 99, s: 0, i: -1 };
    // refine between the neighbouring samples
    const p = S[bi], t = T[bi], o = (x - p.x) * t.x + (z - p.z) * t.z, s = ((bi * DS + Math.max(-DS, Math.min(DS, o))) + LEN) % LEN;
    return { d: Math.sqrt(best), s, i: bi };
  }
  const sOf = (x, z) => near(x, z).s;
  const sOfPt = p => sOf(p.x, p.z);

  // the dam, the start line and the two bridges, measured along the trail
  const sDam0 = sOf(78.5, -168), sDam1 = sOf(78.5, -116), sSpill = sOf(78.5, -142);
  const BRIDGES = INLETS.slice(1).map(I => {
    // where the trail crosses the arm's centre line
    let bs = 0, bd = 1e9;
    for (let i = 0; i < N; i++) { const p = S[i], px = p.x - I.a.x, pz = p.z - I.a.z, o = Math.abs(px * I.n.x + pz * I.n.z), al = px * I.dir.x + pz * I.dir.z; if (al > 0 && al < I.len && o < bd) { bd = o; bs = i * DS; } }
    const c = at(bs), t = tanAt(bs), al = (c.x - I.a.x) * I.dir.x + (c.z - I.a.z) * I.dir.z, w = inletW(I, al);
    const cosA = Math.abs(t.x * I.n.x + t.z * I.n.z) || 1; // the trail crosses at a slant: the span is longer
    return { id: I.id, s: bs, x: c.x, z: c.z, ang: Math.atan2(t.x, t.z), hl: w * 1.25 / cosA + 2.2, hw: 1.35, y: 0.1, arch: 0.55 };
  });
  // a short footbridge over the spillway notch (along the trail on the dam crest)
  const FOOT = { id: 'spill', s: sSpill, x: 78.9, z: -142, ang: 0, hl: 4.6, hw: 1.7, y: DAM.crest + 0.04, arch: 0.08 }; // its east edge lines up with the crest railing
  const DECKS = BRIDGES.concat([FOOT]);
  function deckH(x, z) {
    for (let i = 0; i < DECKS.length; i++) {
      const D = DECKS[i], dx = x - D.x, dz = z - D.z, sa = Math.sin(D.ang), ca = Math.cos(D.ang);
      const a = dx * sa + dz * ca, b = dx * ca - dz * sa; // along, across
      if (Math.abs(a) < D.hl && Math.abs(b) < D.hw) return D.y + D.arch * (1 - (a / D.hl) ** 2);
    }
    return -1e9;
  }

  // hills along the trail: [centre s as a fraction of the lap, half width in metres, height]
  const HILLS = [[0.18, 15, 2.4], [0.39, 10, 2], [0.466, 13, 2.6], [0.585, 20, 3.2], [0.655, 17, 2.8], [0.74, 16, 2.2]];
  const lift = s => {
    let h = 0; const u = s / LEN;
    for (let i = 0; i < HILLS.length; i++) {
      const [c, w, a] = HILLS[i]; let d = Math.abs(u - c) * LEN; d = Math.min(d, LEN - d);
      if (d < w) h += a * (0.5 + 0.5 * Math.cos(Math.PI * d / w));
    }
    return h;
  };

  // race checkpoints, in order. Two of them bracket the cove (none on its detour), so the swim across it stays legal.
  const cove = INLETS[0]; let c0 = -1, c1 = -1;
  for (let i = 0; i < N; i++) if (inletE(cove, S[i].x, S[i].z) < 1.3) { if (c0 < 0) c0 = i; c1 = i; }
  const COVE_S = [c0 * DS, c1 * DS];
  const GATE_S = [0.06, 0.13].map(u => u * LEN).concat([COVE_S[0] - 6, COVE_S[1] + 6], [0.445, 0.535, 0.62, 0.7, 0.78, sSpill / LEN, 0.935].map(u => u * LEN));
  const GATES = GATE_S.map(s => { const p = at(s), t = tanAt(s); return { s, x: p.x, z: p.z, ang: Math.atan2(t.x, t.z) }; });
  const GATE_R = 9;
  const START = { s: 0, x: S[0].x, z: S[0].z, ang: Math.atan2(T[0].x, T[0].z) };

  return { LK, INLETS, inletW, COVE_S, DAM, BRIDGES, FOOT, DECKS, HILLS, GATES, GATE_R, START, curve, S, T, N, LEN, DS, at, tanAt, near, sOf, sOfPt, shoreE, ellE, inletE, deckH, lift, smooth, sDam0, sDam1, sSpill };
})();
if (typeof module !== 'undefined') module.exports = Course;
