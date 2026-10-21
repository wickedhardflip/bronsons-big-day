// The neighborhood: home, trail, dog park and the lake.
const World = (() => {
  const { std, mesh, grp, canvasTex } = Models;
  const WL = -0.35; // water level
  const P = {
    house: { x0: -7, x1: 7, z0: 70, z1: 80 },
    yard: { x0: -22, x1: 22, z0: 46, z1: 92 },
    bed: new THREE.Vector3(9, 0, 58),
    gate: new THREE.Vector3(0, 0, 46),
    park: { x0: 30, x1: 66, z0: -36, z1: -6, gateZ: -21 },
    dock: { x0: -1.7, x1: 1.7, z0: -110, z1: -82, y: 0.32 },
    lake: { cx: 0, cz: -142, rx: 82, rz: 56 },
    bounds: { x0: -112, x1: 112, z0: -134, z1: 108 },
  };
  P.dockEnd = new THREE.Vector3(0, P.dock.y, -107);
  P.parkGate = new THREE.Vector3(P.park.x0 + 2, 0, P.park.gateZ);
  P.parkThrow = new THREE.Vector3(37, 0, -21);

  const pathPts = [[0, 47], [-5, 32], [-13, 14], [-9, -6], [5, -22], [13, -38], [7, -58], [1, -72], [0, -81]].map(p => new THREE.Vector3(p[0], 0, p[1]));
  const branchPts = [[5, -22], [16, -21], [P.park.x0 + 1, -21]].map(p => new THREE.Vector3(p[0], 0, p[1]));
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

  function terrainH(x, z, dp) {
    let h = Math.sin(x * 0.045) * Math.cos(z * 0.038) * 1.6 + Math.sin(x * 0.11 + z * 0.07) * 0.5 + Math.cos(z * 0.09 - x * 0.03) * 0.6;
    h += 0.6;
    if (dp === undefined) dp = distPath(x, z);
    let flat = smooth(3, 14, dp);
    flat = Math.min(flat, smooth(2, 14, rectDist(P.yard, x, z)), smooth(2, 12, rectDist(P.park, x, z)));
    h *= flat;
    // rising rim beyond play bounds
    const ex = Math.max(0, Math.abs(x) - 100), ez = Math.max(0, z - 96);
    h += Math.min(14, (ex * ex + ez * ez) * 0.02);
    // lake basin
    const e = lakeE(x, z);
    const shore = smooth(1.12, 0.92, e);
    h = h * (1 - shore) + (-0.1) * shore;
    h -= smooth(1.0, 0.6, e) * 2.6;
    return h;
  }

  // sampled height grid for fast lookups
  const G = { size: 360, res: 1, n: 361, ox: -180, oz: -230, data: null };
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
    const D = P.dock;
    if (x > D.x0 && x < D.x1 && z > D.z0 && z < D.z1) h = Math.max(h, D.y);
    return h;
  }

  // geometry merge helper (non-indexed, vertex colored)
  function merge(parts) {
    const pos = [], nor = [], col = [];
    parts.forEach(([geo, m, color]) => {
      const g = geo.index ? geo.toNonIndexed() : geo.clone();
      g.applyMatrix4(m); g.computeVertexNormals();
      const c = new THREE.Color(color), p = g.attributes.position.array, n = g.attributes.normal.array;
      for (let i = 0; i < p.length; i++) { pos.push(p[i]); nor.push(n[i]); }
      for (let i = 0; i < p.length / 3; i++) col.push(c.r, c.g, c.b);
    });
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    return out;
  }
  const M = (x, y, z, sx = 1, sy = 1, sz = 1, ry = 0, rx = 0) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, 0)), new THREE.Vector3(sx, sy, sz));

  const colliders = { circles: [], segs: [], boxes: [] };
  let scene, sun, hemi, sky, stars, water, waterBase, clouds = [], lampGlows = [], windowMats = [], fireflyPts, boat;

  function glowTex() {
    return canvasTex(64, 64, (g, w, h) => { const r = g.createRadialGradient(32, 32, 0, 32, 32, 32); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.25, 'rgba(255,255,255,0.6)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, w, h); });
  }

  function build(sc) {
    scene = sc;
    buildGrid();
    // ---- lights ----
    hemi = new THREE.HemisphereLight(0xbfdcff, 0x5a6b3a, 0.65); scene.add(hemi);
    sun = new THREE.DirectionalLight(0xfff1d6, 1.6);
    sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
    const sc2 = sun.shadow.camera; sc2.left = -32; sc2.right = 32; sc2.top = 32; sc2.bottom = -32; sc2.near = 1; sc2.far = 160;
    sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
    scene.add(sun); scene.add(sun.target);

    // ---- sky ----
    sky = new THREE.Mesh(new THREE.SphereGeometry(700, 32, 16), new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { top: { value: new THREE.Color(0x4a8fe0) }, hor: { value: new THREE.Color(0xcfe6ff) }, sunDir: { value: new THREE.Vector3(0, 1, 0) }, sunCol: { value: new THREE.Color(0xfff2c0) } },
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0);} ',
      fragmentShader: 'uniform vec3 top; uniform vec3 hor; uniform vec3 sunDir; uniform vec3 sunCol; varying vec3 vP; void main(){ float h = max(vP.y,0.0); vec3 c = mix(hor, top, pow(h,0.55)); if(vP.y<0.0) c = hor*0.9; float s = max(dot(normalize(vP), normalize(sunDir)),0.0); c += sunCol*pow(s,600.0)*2.0 + sunCol*pow(s,8.0)*0.25; gl_FragColor = linearToOutputTexel(vec4(c,1.0));} ',
    }));
    sky.renderOrder = -1; scene.add(sky);
    // stars
    const sg = new THREE.BufferGeometry(), sp = [];
    for (let i = 0; i < 1500; i++) { const u = Math.random() * 2 * Math.PI, v = Math.random() * 0.9 + 0.08; const r = 650; sp.push(Math.cos(u) * Math.sqrt(1 - v * v) * r, v * r, Math.sin(u) * Math.sqrt(1 - v * v) * r); }
    sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
    stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false }));
    scene.add(stars);
    scene.fog = new THREE.Fog(0xcfe6ff, 70, 330);

    // ---- terrain ----
    const W = 360, N = 180;
    const tg = new THREE.PlaneGeometry(W, W, N, N); tg.rotateX(-Math.PI / 2); tg.translate(0, 0, -50);
    const tp = tg.attributes.position, cols = [];
    const cA = new THREE.Color(0x5f8f3a), cB = new THREE.Color(0x7aa847), cSand = new THREE.Color(0xc9b088), cMud = new THREE.Color(0x6e6248), cMow = new THREE.Color(0x86b552), cPark = new THREE.Color(0x8aa64c), tmp = new THREE.Color();
    for (let i = 0; i < tp.count; i++) {
      const x = tp.getX(i), z = tp.getZ(i), h = groundH(x, z) * 1;
      const hh = terrainH(x, z); tp.setY(i, hh);
      const n = (Math.sin(x * 0.3) * Math.cos(z * 0.23) + Math.sin(x * 0.07 + z * 0.13)) * 0.25 + 0.5 + (Math.random() - 0.5) * 0.15;
      tmp.copy(cA).lerp(cB, Math.max(0, Math.min(1, n)));
      if (rectDist(P.yard, x, z) === 0) tmp.copy(cMow).multiplyScalar(Math.floor(z / 3) % 2 ? 1 : 0.9);
      if (rectDist(P.park, x, z) === 0) tmp.lerp(cPark, 0.5);
      const e = lakeE(x, z);
      if (e < 1.16) tmp.lerp(cSand, smooth(1.16, 1.05, e));
      if (e < 0.97) tmp.lerp(cMud, smooth(0.97, 0.85, e));
      void h;
      cols.push(tmp.r, tmp.g, tmp.b);
    }
    tg.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    tg.computeVertexNormals();
    const ground = new THREE.Mesh(tg, std(0xffffff, { vertexColors: true, roughness: 0.95 }));
    ground.receiveShadow = true; scene.add(ground);

    // ---- trail ribbon ----
    const dirtTex = canvasTex(64, 256, (g, w, h) => { g.fillStyle = '#b39b74'; g.fillRect(0, 0, w, h); for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(${90 + Math.random() * 80},${70 + Math.random() * 60},${50 + Math.random() * 40},0.5)`; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); } g.fillStyle = 'rgba(80,110,50,0.6)'; g.fillRect(0, 0, 5, h); g.fillRect(w - 5, 0, 5, h); }, [1, 30]);
    const ribbon = (curve, n, width) => {
      const pts = curve.getSpacedPoints(n), pos = [], uv = [], idx = [];
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i], q = pts[Math.min(i + 1, pts.length - 1)], r = pts[Math.max(i - 1, 0)];
        const dx = q.x - r.x, dz = q.z - r.z, l = Math.hypot(dx, dz) || 1, nx = -dz / l, nz = dx / l;
        [-1, 1].forEach(s => { const x = p.x + nx * width * s, z = p.z + nz * width * s; pos.push(x, groundH(x, z) + 0.04, z); uv.push(s < 0 ? 0 : 1, i / n); });
        if (i < pts.length - 1) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
      }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
      const m = new THREE.Mesh(g, std(0xffffff, { map: dirtTex, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2 })); m.receiveShadow = true; scene.add(m);
    };
    ribbon(pathCurve, 300, 1.4); ribbon(branchCurve, 50, 1.2);

    // ---- water ----
    const wg = new THREE.PlaneGeometry(300, 190, 90, 60); wg.rotateX(-Math.PI / 2); wg.translate(0, WL, -150);
    water = new THREE.Mesh(wg, std(0x3a7891, { roughness: 0.12, metalness: 0.35, transparent: true, opacity: 0.86 }));
    waterBase = Float32Array.from(wg.attributes.position.array);
    water.receiveShadow = true; scene.add(water);

    buildHouse(); buildYard(); buildPark(); buildDock(); buildNature(); buildFar();
    // fireflies (shown at dusk)
    const fg = new THREE.BufferGeometry(); fg.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(3 * 120), 3));
    fireflyPts = new THREE.Points(fg, new THREE.PointsMaterial({ color: 0xfff39a, size: 0.35, map: glowTex(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
    fireflyPts.userData.seeds = Array.from({ length: 120 }, () => [ -60 + Math.random() * 130, -90 + Math.random() * 170, Math.random() * 6 ]);
    scene.add(fireflyPts);
  }

  function addShadow(o) { o.traverse(m => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } }); return o; }

  function buildHouse() {
    const H = P.house, cx = (H.x0 + H.x1) / 2, cz = (H.z0 + H.z1) / 2, w = H.x1 - H.x0, d = H.z1 - H.z0, y0 = groundH(cx, cz);
    const siding = canvasTex(256, 256, (g, W, Hh) => { g.fillStyle = '#e9e4d6'; g.fillRect(0, 0, W, Hh); g.fillStyle = 'rgba(0,0,0,0.08)'; for (let y = 0; y < Hh; y += 16) g.fillRect(0, y, W, 3); }, [3, 2]);
    const house = grp(scene, [cx, y0, cz]);
    mesh(new THREE.BoxGeometry(w, 4.2, d), std(0xffffff, { map: siding }), house, [0, 2.1, 0]);
    mesh(new THREE.BoxGeometry(w + 0.4, 0.5, d + 0.4), std(0x7d7a74), house, [0, 0.25, 0]);
    // roof prism
    const shape = new THREE.Shape(); shape.moveTo(-d / 2 - 0.8, 0); shape.lineTo(0, 3.2); shape.lineTo(d / 2 + 0.8, 0); shape.lineTo(-d / 2 - 0.8, 0);
    const rg = new THREE.ExtrudeGeometry(shape, { depth: w + 1.2, bevelEnabled: false }); rg.translate(0, 0, -(w + 1.2) / 2); rg.rotateY(Math.PI / 2);
    const roofTex = canvasTex(128, 128, (g, W, Hh) => { g.fillStyle = '#4c4f5a'; g.fillRect(0, 0, W, Hh); g.fillStyle = 'rgba(0,0,0,0.25)'; for (let y = 0; y < Hh; y += 12) { g.fillRect(0, y, W, 2); for (let x = (y / 12 % 2) * 10; x < W; x += 20) g.fillRect(x, y, 2, 12); } }, [0.2, 0.2]);
    mesh(rg, std(0xffffff, { map: roofTex, roughness: 0.9 }), house, [0, 4.2, 0]);
    mesh(new THREE.BoxGeometry(1, 2.5, 1), std(0x8a4b3a), house, [3.5, 6.2, 1.5]); // chimney
    // door + windows facing north (-z)
    mesh(new THREE.BoxGeometry(1.2, 2.2, 0.1), std(0x2c4f7a), house, [0, 1.6, -d / 2 - 0.05]);
    mesh(new THREE.SphereGeometry(0.05, 8, 6), std(0xd9b44a, { metalness: 0.8 }), house, [0.4, 1.6, -d / 2 - 0.12]);
    [-4.2, 4.2].forEach(x => {
      const wm = std(0x2a3340, { emissive: 0xffc56b, emissiveIntensity: 0, roughness: 0.2 }); windowMats.push(wm);
      mesh(new THREE.BoxGeometry(1.8, 1.4, 0.1), wm, house, [x, 2.3, -d / 2 - 0.05]);
      mesh(new THREE.BoxGeometry(2.0, 0.15, 0.2), std(0xffffff), house, [x, 1.55, -d / 2 - 0.1]);
      mesh(new THREE.BoxGeometry(0.5, 1.6, 0.06), std(0x2c4f7a), house, [x - 1.2, 2.3, -d / 2 - 0.08]);
      mesh(new THREE.BoxGeometry(0.5, 1.6, 0.06), std(0x2c4f7a), house, [x + 1.2, 2.3, -d / 2 - 0.08]);
    });
    // porch
    const porch = grp(house, [0, 0, -d / 2 - 1.4]);
    mesh(new THREE.BoxGeometry(6, 0.4, 2.8), std(0xa58a66), porch, [0, 0.2, 0]);
    mesh(new THREE.BoxGeometry(2.4, 0.2, 0.6), std(0xa58a66), porch, [0, 0.1, -1.6]);
    [-2.8, 2.8].forEach(x => mesh(new THREE.CylinderGeometry(0.1, 0.1, 3.4, 10), std(0xffffff), porch, [x, 2.1, -1.2]));
    mesh(new THREE.BoxGeometry(6.4, 0.25, 3.2), std(0x5a5d66), porch, [0, 3.9, -0.1]);
    const lampM = std(0xfff2c8, { emissive: 0xffd27a, emissiveIntensity: 0.2 }); windowMats.push(lampM);
    mesh(new THREE.SphereGeometry(0.15, 10, 8), lampM, porch, [0, 3.6, -0.6]);
    addShadow(house);
    colliders.boxes.push({ x0: H.x0 - 0.2, x1: H.x1 + 0.2, z0: H.z0 - 0.2, z1: H.z1 + 0.2 });
    colliders.boxes.push({ x0: -3, x1: 3, z0: H.z0 - 2.9, z1: H.z0, h: 0.4 }); // porch is a low step (walkable)
    // flower beds
    for (let i = 0; i < 26; i++) {
      const x = -6.5 + (i % 13) * 1.05 + (i >= 13 ? 0 : 0), z = H.z0 - 0.6;
      if (Math.abs(x) < 3.4) continue;
      const fl = mesh(new THREE.IcosahedronGeometry(0.32, 0), std(0x3f7a35, { flatShading: true }), scene, [x, groundH(x, z) + 0.2, z]);
      mesh(new THREE.SphereGeometry(0.09, 8, 6), std([0xff6f91, 0xffd166, 0xffffff, 0xc77dff][i % 4]), fl, [0, 0.3, 0]);
    }
  }

  function picketFence(segs) {
    const pick = [], post = [], rail = [];
    segs.forEach(([ax, az, bx, bz]) => {
      const len = Math.hypot(bx - ax, bz - az), ang = Math.atan2(bx - ax, bz - az);
      for (let t = 0; t <= len; t += 0.28) { const x = ax + (bx - ax) * t / len, z = az + (bz - az) * t / len; pick.push(M(x, groundH(x, z) + 0.5, z, 1, 1, 1, ang)); }
      for (let t = 0; t <= len + 0.01; t += 2.4) { const x = ax + (bx - ax) * Math.min(t, len) / len, z = az + (bz - az) * Math.min(t, len) / len; post.push(M(x, groundH(x, z) + 0.6, z, 1, 1, 1, ang)); }
      const mx = (ax + bx) / 2, mz = (az + bz) / 2, gy = groundH(mx, mz);
      rail.push(M(mx, gy + 0.35, mz, 1, 1, len, ang)); rail.push(M(mx, gy + 0.78, mz, 1, 1, len, ang));
      colliders.segs.push([ax, az, bx, bz]);
    });
    const pg = new THREE.BoxGeometry(0.1, 1.0, 0.04); pg.translate(0, 0, 0);
    const mk = (geo, list, mat) => { const im = new THREE.InstancedMesh(geo, mat, list.length); list.forEach((m, i) => im.setMatrixAt(i, m)); im.castShadow = true; im.receiveShadow = true; scene.add(im); };
    const white = std(0xf4f1ea, { roughness: 0.6 });
    mk(pg, pick, white); mk(new THREE.BoxGeometry(0.16, 1.2, 0.16), post, white); mk(new THREE.BoxGeometry(0.06, 0.08, 1), rail, white);
  }

  function buildYard() {
    const Y = P.yard;
    picketFence([[Y.x0, Y.z0, -2.6, Y.z0], [2.6, Y.z0, Y.x1, Y.z0], [Y.x1, Y.z0, Y.x1, Y.z1], [Y.x1, Y.z1, Y.x0, Y.z1], [Y.x0, Y.z1, Y.x0, Y.z0]]);
    // gate arch
    const ga = grp(scene, [0, groundH(0, Y.z0), Y.z0]);
    [-2.6, 2.6].forEach(x => mesh(new THREE.BoxGeometry(0.25, 2.4, 0.25), std(0xf4f1ea), ga, [x, 1.2, 0]));
    const arch = mesh(new THREE.TorusGeometry(2.6, 0.1, 8, 24, Math.PI), std(0xf4f1ea), ga, [0, 2.4, 0]); arch.scale.y = 0.35;
    // dog bed
    const bed = grp(scene, [P.bed.x, groundH(P.bed.x, P.bed.z), P.bed.z]);
    const plaid = canvasTex(128, 128, (g, w, h) => { g.fillStyle = '#9c2f2f'; g.fillRect(0, 0, w, h); g.fillStyle = 'rgba(30,30,60,0.45)'; for (let i = 0; i < w; i += 32) { g.fillRect(i, 0, 12, h); g.fillRect(0, i, w, 12); } g.fillStyle = 'rgba(255,220,120,0.4)'; for (let i = 16; i < w; i += 32) { g.fillRect(i, 0, 2, h); g.fillRect(0, i, w, 2); } }, [3, 1]);
    mesh(new THREE.CylinderGeometry(0.95, 1.0, 0.18, 28), std(0x6b4e3a), bed, [0, 0.09, 0]);
    mesh(new THREE.TorusGeometry(0.85, 0.22, 12, 28), std(0xffffff, { map: plaid }), bed, [0, 0.25, 0], [Math.PI / 2, 0, 0]);
    mesh(new THREE.CylinderGeometry(0.75, 0.75, 0.12, 24), std(0xe7dccb, { roughness: 1 }), bed, [0, 0.22, 0]);
    // bone-shaped name sign
    const sign = canvasTex(256, 96, (g, w, h) => { g.fillStyle = '#f6e7c8'; g.beginPath(); g.roundRect ? g.roundRect(8, 16, w - 16, h - 32, 30) : g.rect(8, 16, w - 16, h - 32); g.fill(); g.fillStyle = '#5a3420'; g.font = 'bold 44px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('BRONSON', w / 2, h / 2 + 2); });
    mesh(new THREE.PlaneGeometry(1.4, 0.52), std(0xffffff, { map: sign, transparent: true }), bed, [0, 0.6, 1.1], [0, Math.PI, 0]).castShadow = false;
    mesh(new THREE.BoxGeometry(0.06, 0.6, 0.06), std(0x6b4e3a), bed, [0, 0.3, 1.12]);
    // water bowl + toys
    mesh(new THREE.CylinderGeometry(0.22, 0.17, 0.12, 18), std(0x2f6fd6, { metalness: 0.4, roughness: 0.3 }), scene, [P.bed.x + 1.8, groundH(P.bed.x + 1.8, P.bed.z) + 0.06, P.bed.z + 0.4]);
    // mailbox
    const mb = grp(scene, [4.2, groundH(4.2, Y.z0 - 1.2), Y.z0 - 1.2]);
    mesh(new THREE.BoxGeometry(0.1, 1.1, 0.1), std(0x6b4e3a), mb, [0, 0.55, 0]);
    mesh(new THREE.BoxGeometry(0.3, 0.3, 0.55), std(0x2b2f36, { metalness: 0.5 }), mb, [0, 1.2, 0]);
    mesh(new THREE.BoxGeometry(0.03, 0.18, 0.06), std(0xd23b3b), mb, [0.17, 1.3, 0.1]);
    colliders.circles.push([4.2, Y.z0 - 1.2, 0.3]);
  }

  function buildPark() {
    const K = P.park;
    const segs = [[K.x0, K.z0, K.x1, K.z0], [K.x1, K.z0, K.x1, K.z1], [K.x1, K.z1, K.x0, K.z1], [K.x0, K.z1, K.x0, K.gateZ + 2.4], [K.x0, K.gateZ - 2.4, K.x0, K.z0]];
    const linkTex = canvasTex(64, 64, (g, w, h) => { g.clearRect(0, 0, w, h); g.strokeStyle = 'rgba(200,205,210,0.95)'; g.lineWidth = 2; for (let i = -64; i < 128; i += 12) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 64, 64); g.stroke(); g.beginPath(); g.moveTo(i + 64, 0); g.lineTo(i, 64); g.stroke(); } });
    linkTex.wrapS = linkTex.wrapT = THREE.RepeatWrapping;
    const postM = std(0x8f969c, { metalness: 0.7, roughness: 0.35 });
    segs.forEach(([ax, az, bx, bz]) => {
      const len = Math.hypot(bx - ax, bz - az), ang = Math.atan2(bx - ax, bz - az), mx = (ax + bx) / 2, mz = (az + bz) / 2;
      const t = linkTex.clone(); t.needsUpdate = true; t.repeat.set(len / 1.2, 1.4);
      const panel = mesh(new THREE.PlaneGeometry(len, 1.6), std(0xffffff, { map: t, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide, metalness: 0.5 }), scene, [mx, groundH(mx, mz) + 0.8, mz], [0, ang + Math.PI / 2, 0]);
      panel.castShadow = true;
      for (let s = 0; s <= len; s += 3) { const x = ax + (bx - ax) * s / len, z = az + (bz - az) * s / len; mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.75, 8), postM, scene, [x, groundH(x, z) + 0.87, z]); }
      colliders.segs.push([ax, az, bx, bz]);
    });
    // sign
    const sg = canvasTex(512, 160, (g, w, h) => { g.fillStyle = '#2f5d3a'; g.fillRect(0, 0, w, h); g.strokeStyle = '#f2e6c9'; g.lineWidth = 8; g.strokeRect(10, 10, w - 20, h - 20); g.fillStyle = '#f2e6c9'; g.font = 'bold 64px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('BARK PARK', w / 2, h / 2 + 4); });
    const sgn = grp(scene, [K.x0 - 0.6, groundH(K.x0, K.gateZ + 6), K.gateZ + 6.5]);
    mesh(new THREE.PlaneGeometry(2.6, 0.8), std(0xffffff, { map: sg }), sgn, [0, 2.2, 0], [0, -Math.PI / 2, 0]);
    [-1.1, 1.1].forEach(z => mesh(new THREE.BoxGeometry(0.12, 2.6, 0.12), std(0x6b4e3a), sgn, [0, 1.3, z]));
    // agility hurdles, tunnel, benches
    [[50, -12], [56, -12], [62, -12]].forEach(([x, z]) => {
      const h = grp(scene, [x, groundH(x, z), z]);
      [-0.7, 0.7].forEach(s => mesh(new THREE.CylinderGeometry(0.04, 0.04, 1, 8), std(0xffffff), h, [s, 0.5, 0]));
      mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.5, 8), std(0xe0483e), h, [0, 0.55, 0], [0, 0, Math.PI / 2]);
    });
    const tun = mesh(new THREE.TorusGeometry(0.7, 0.08, 8, 20, Math.PI), std(0x2d7fd6), scene, [58, groundH(58, -30), -30], [0, Math.PI / 2, 0]);
    for (let i = -2; i <= 2; i++) mesh(new THREE.TorusGeometry(0.7, 0.05, 6, 20, Math.PI), std(0x2d7fd6), scene, [58 + i * 0.5, groundH(58, -30), -30], [0, Math.PI / 2, 0]);
    void tun;
    bench(33, -9, Math.PI); bench(33, -33, 0);
    // water station
    mesh(new THREE.CylinderGeometry(0.15, 0.18, 1, 10), std(0x4b6a88, { metalness: 0.5 }), scene, [K.x1 - 3, groundH(K.x1 - 3, -8) + 0.5, -8]);
    colliders.circles.push([K.x1 - 3, -8, 0.4]);
  }
  function bench(x, z, ry) {
    const b = grp(scene, [x, groundH(x, z), z]); b.rotation.y = ry;
    const wood = std(0x8a5a36);
    mesh(new THREE.BoxGeometry(2, 0.08, 0.5), wood, b, [0, 0.48, 0]);
    mesh(new THREE.BoxGeometry(2, 0.5, 0.06), wood, b, [0, 0.8, -0.24], [-0.15, 0, 0]);
    [-0.85, 0.85].forEach(s => mesh(new THREE.BoxGeometry(0.08, 0.48, 0.5), std(0x2b2f36), b, [s, 0.24, 0]));
    colliders.circles.push([x, z, 0.9]);
    return b;
  }

  function buildDock() {
    const D = P.dock;
    const wood = canvasTex(64, 256, (g, w, h) => { g.fillStyle = '#b8ab95'; g.fillRect(0, 0, w, h); for (let y = 0; y < h; y += 16) { g.fillStyle = 'rgba(60,50,40,0.35)'; g.fillRect(0, y, w, 2); } for (let i = 0; i < 300; i++) { g.fillStyle = 'rgba(90,80,70,0.25)'; g.fillRect(Math.random() * w, Math.random() * h, 1, 6); } }, [1, 8]);
    const len = D.z1 - D.z0, cz = (D.z0 + D.z1) / 2;
    mesh(new THREE.BoxGeometry(D.x1 - D.x0, 0.18, len), std(0xffffff, { map: wood, roughness: 0.9 }), scene, [0, D.y - 0.09, cz]);
    const postM = std(0x8a8170, { roughness: 1 });
    for (let z = D.z1 - 2; z > D.z0; z -= 6) {
      [D.x0 - 0.15, D.x1 + 0.15].forEach(x => {
        const tall = z < D.z0 + 14;
        mesh(new THREE.CylinderGeometry(0.16, 0.16, tall ? 4.6 : 2.4, 10), postM, scene, [x, tall ? 0.6 : -0.3, z]);
        mesh(new THREE.ConeGeometry(0.18, 0.25, 4), std(0x2a2a2a), scene, [x, tall ? 3.0 : 1.0, z], [0, Math.PI / 4, 0]);
        if (tall) colliders.circles.push([x, z, 0.25]);
      });
    }
    // pontoon boat
    boat = grp(scene, [6.5, WL, -100]);
    [-1, 1].forEach(s => mesh(new THREE.CylinderGeometry(0.35, 0.35, 6.5, 14), std(0xc9ced4, { metalness: 0.7, roughness: 0.3 }), boat, [s * 1.0, 0.1, 0], [Math.PI / 2, 0, 0]));
    mesh(new THREE.BoxGeometry(2.8, 0.15, 6.4), std(0x9aa0a6), boat, [0, 0.5, 0]);
    mesh(new THREE.BoxGeometry(2.8, 0.7, 0.08), std(0xf2f2f2), boat, [0, 0.9, 3.15]);
    [-1.38, 1.38].forEach(x => mesh(new THREE.BoxGeometry(0.08, 0.7, 6.3), std(0xf2f2f2), boat, [x, 0.9, 0]));
    mesh(new THREE.BoxGeometry(2.2, 0.5, 1.2), std(0x2e7d6b), boat, [0, 0.8, -1.5]);
    mesh(new THREE.BoxGeometry(2.9, 0.06, 3.2), std(0x2f6f6a), boat, [0, 2.3, 0.3]);
    [[-1.3, 1.6], [1.3, 1.6], [-1.3, -1.2], [1.3, -1.2]].forEach(([x, z]) => mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.8, 6), std(0xcccccc), boat, [x, 1.4, z]));
    addShadow(boat);
    colliders.boxes.push({ x0: 5, x1: 8, z0: -103.5, z1: -96.5 });
    // lifeguard-style no swimming sign joke
    const s = canvasTex(256, 160, (g, w, h) => { g.fillStyle = '#f2d23c'; g.fillRect(0, 0, w, h); g.fillStyle = '#222'; g.font = 'bold 34px sans-serif'; g.textAlign = 'center'; g.fillText('GOOD DOGS', w / 2, 60); g.fillText('SWIM FREE', w / 2, 110); });
    mesh(new THREE.PlaneGeometry(0.9, 0.56), std(0xffffff, { map: s }), scene, [D.x1 + 0.32, 2.2, D.z0 + 8], [0, -Math.PI / 2, 0]);
  }

  function blocked(x, z, pad = 0) {
    if (rectDist(P.yard, x, z, 3 + pad) === 0 || rectDist(P.park, x, z, 3 + pad) === 0) return true;
    if (distPath(x, z) < 3.5 + pad) return true;
    if (lakeE(x, z) < 1.12) return true;
    if (Math.abs(x) < 4 && z < -76 && z > -112) return true;
    return false;
  }
  const rnd = (a, b) => a + Math.random() * (b - a);

  function buildNature() {
    // tree types merged into single geometries (vertex colors) and instanced
    const leaf = 0xffffff;
    const round = merge([
      [new THREE.CylinderGeometry(0.18, 0.28, 3, 8), M(0, 1.5, 0), 0x6b4a33],
      [new THREE.IcosahedronGeometry(1.9, 1), M(0, 4.0, 0, 1, 0.9, 1), leaf],
      [new THREE.IcosahedronGeometry(1.4, 1), M(1.1, 3.3, 0.4), leaf],
      [new THREE.IcosahedronGeometry(1.3, 1), M(-1.0, 3.5, -0.5), leaf],
      [new THREE.IcosahedronGeometry(1.2, 1), M(0.2, 5.1, -0.2), leaf],
    ]);
    const pine = merge([
      [new THREE.CylinderGeometry(0.15, 0.25, 2, 8), M(0, 1, 0), 0x5a3d2a],
      [new THREE.ConeGeometry(1.9, 2.8, 9), M(0, 2.6, 0), leaf],
      [new THREE.ConeGeometry(1.5, 2.4, 9), M(0, 3.9, 0), leaf],
      [new THREE.ConeGeometry(1.0, 2.0, 9), M(0, 5.1, 0), leaf],
    ]);
    const bushG = merge([[new THREE.IcosahedronGeometry(0.8, 0), M(0, 0.5, 0), leaf], [new THREE.IcosahedronGeometry(0.6, 0), M(0.6, 0.4, 0.2), leaf], [new THREE.IcosahedronGeometry(0.55, 0), M(-0.5, 0.4, -0.2), leaf]]);
    const rockG = merge([[new THREE.DodecahedronGeometry(0.7, 0), M(0, 0.2, 0, 1, 0.6, 1), 0x8d8a83]]);
    const inst = (geo, list, colorFn, shadow = true) => {
      const im = new THREE.InstancedMesh(geo, std(0xffffff, { vertexColors: true, flatShading: true, roughness: 0.85 }), list.length);
      list.forEach((m, i) => { im.setMatrixAt(i, m); im.setColorAt(i, colorFn(i)); });
      im.castShadow = shadow; im.receiveShadow = true; scene.add(im); return im;
    };
    const trees = [], pines = [], bushes = [], rocks = [];
    const tryPlace = (list, count, minR, maxR, pad, col) => {
      let tries = 0;
      while (list.length < count && tries++ < count * 40) {
        const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * maxR;
        const x = Math.cos(a) * r, z = Math.sin(a) * r - 15;
        if (r < minR || blocked(x, z, pad)) continue;
        if (x < P.bounds.x0 - 30 || x > P.bounds.x1 + 30 || z > P.bounds.z1 + 30) continue;
        const s = rnd(0.8, 1.35); list.push(M(x, groundH(x, z) - 0.1, z, s, s * rnd(0.9, 1.2), s, Math.random() * 6));
        if (col) colliders.circles.push([x, z, col * s]);
      }
    };
    tryPlace(trees, 150, 0, 140, 1, 0.5);
    tryPlace(pines, 110, 30, 150, 1, 0.45);
    tryPlace(bushes, 120, 0, 120, 0, 0.6);
    tryPlace(rocks, 40, 0, 110, 0, 0.6);
    // yard shade trees
    [[-15, 56], [16, 86], [-17, 86]].forEach(([x, z]) => { trees.push(M(x, groundH(x, z) - 0.1, z, 1.2, 1.3, 1.2, z)); colliders.circles.push([x, z, 0.6]); });
    // park shade trees
    [[40, -31], [62, -24], [44, -9]].forEach(([x, z]) => { trees.push(M(x, groundH(x, z) - 0.1, z, 1.1, 1.2, 1.1, x)); colliders.circles.push([x, z, 0.55]); });
    // keep tree positions for squirrels
    P.treeSpots = trees.map(m => new THREE.Vector3().setFromMatrixPosition(m)).filter(v => distPath(v.x, v.z) < 12 && v.z < 44 && v.z > -76);
    const greens = [0x4f8a3a, 0x5d9b40, 0x6aa84a, 0x467c34, 0x7bb050, 0x8bb34a];
    inst(round, trees, i => new THREE.Color(greens[i % greens.length]));
    inst(pine, pines, i => new THREE.Color([0x2f5e3a, 0x3b6e40, 0x29523a][i % 3]));
    inst(bushG, bushes, i => new THREE.Color([0x4a7d36, 0x5c8f3e, 0x3f6e33][i % 3]));
    inst(rockG, rocks, () => new THREE.Color(0xffffff));
    // grass tufts
    const tuft = merge([
      [new THREE.ConeGeometry(0.06, 0.5, 3), M(0, 0.25, 0, 1, 1, 0.3, 0, 0.15), 0xffffff],
      [new THREE.ConeGeometry(0.06, 0.42, 3), M(0.08, 0.21, 0.04, 1, 1, 0.3, 1.2, -0.2), 0xffffff],
      [new THREE.ConeGeometry(0.06, 0.38, 3), M(-0.07, 0.19, -0.03, 1, 1, 0.3, 2.3, 0.25), 0xffffff],
    ]);
    const tufts = [], tcols = [];
    for (let i = 0; i < 7000; i++) {
      const x = rnd(-120, 120), z = rnd(-130, 112);
      if (lakeE(x, z) < 1.1 || distPath(x, z) < 1.8 || rectDist(P.house, x, z, 1) === 0) continue;
      if (Math.abs(x) < 3 && z < -76) continue;
      const s = rnd(0.7, 1.5); tufts.push(M(x, groundH(x, z), z, s, s, s, Math.random() * 6));
      tcols.push(new THREE.Color().setHSL(0.24 + Math.random() * 0.06, 0.45, 0.32 + Math.random() * 0.12).convertSRGBToLinear());
    }
    inst(tuft, tufts, i => tcols[i], false);
    // flowers
    const flower = merge([[new THREE.CylinderGeometry(0.015, 0.015, 0.3, 4), M(0, 0.15, 0), 0x3f7a35], [new THREE.IcosahedronGeometry(0.07, 0), M(0, 0.32, 0), 0xffffff]]);
    const fl = [], fc = [], fcol = [0xffffff, 0xffd84a, 0xff7aa8, 0xb48cff, 0x7fc4ff];
    for (let i = 0; i < 1400; i++) {
      const x = rnd(-110, 110), z = rnd(-125, 105);
      if (lakeE(x, z) < 1.12 || distPath(x, z) < 2) continue;
      fl.push(M(x, groundH(x, z), z, 1, 1, 1, Math.random() * 6)); fc.push(new THREE.Color(fcol[i % 5]));
    }
    inst(flower, fl, i => fc[i], false);
    // lamp posts along the trail
    const lampTex = glowTex();
    pathCurve.getSpacedPoints(10).forEach((p, i) => {
      if (i === 0 || i === 10) return;
      const t = pathCurve.getTangent(i / 10), x = p.x + t.z * 2.4, z = p.z - t.x * 2.4;
      const l = grp(scene, [x, groundH(x, z), z]);
      mesh(new THREE.CylinderGeometry(0.07, 0.1, 3.4, 8), std(0x2b2f36, { metalness: 0.6 }), l, [0, 1.7, 0]);
      const bulbM = std(0xfff1c2, { emissive: 0xffc56b, emissiveIntensity: 0.1 }); windowMats.push(bulbM);
      mesh(new THREE.SphereGeometry(0.22, 12, 8), bulbM, l, [0, 3.5, 0]);
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: lampTex, color: 0xffcf7a, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
      glow.position.set(0, 3.5, 0); glow.scale.setScalar(3.2); l.add(glow); lampGlows.push(glow);
      colliders.circles.push([x, z, 0.25]);
      if (i % 3 === 1) bench(p.x - t.z * 3, p.z + t.x * 3, Math.atan2(t.x, t.z) + Math.PI / 2);
    });
    // clouds
    for (let i = 0; i < 16; i++) {
      const c = grp(scene, [rnd(-260, 260), rnd(70, 110), rnd(-320, 200)]);
      const m = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.92, fog: false });
      for (let k = 0; k < 6; k++) { const s = rnd(6, 13); const b = new THREE.Mesh(Models.makeTreat ? new THREE.IcosahedronGeometry(1, 1) : null, m); b.scale.set(s * 1.4, s * 0.7, s); b.position.set(rnd(-14, 14), rnd(-2, 3), rnd(-6, 6)); c.add(b); }
      c.userData.v = rnd(1, 2.5); clouds.push(c);
    }
  }

  function buildFar() {
    // houses on the far shore + a tree line, echoing the lake photos
    const cols = [0xd8d2c4, 0xa9b8c4, 0xe6ddc9, 0x8f6b55, 0xcfd6dd];
    for (let i = 0; i < 14; i++) {
      const a = Math.PI * (0.15 + i / 14 * 0.7), x = Math.cos(a) * 98 * (i % 2 ? 1 : -1) * 0 + (-90 + i * 14), z = -205 - Math.sin(a) * 6 - (i % 3) * 5;
      const g = grp(scene, [x, terrainH(x, z) + 0.2, z]);
      const w = rnd(5, 9), d = rnd(5, 7), h = rnd(3.5, 6);
      mesh(new THREE.BoxGeometry(w, h, d), std(cols[i % 5]), g, [0, h / 2, 0]);
      mesh(new THREE.ConeGeometry(Math.max(w, d) * 0.75, 2.6, 4), std(0x4a4e57), g, [0, h + 1.3, 0], [0, Math.PI / 4, 0]);
      const wm = std(0x2a3340, { emissive: 0xffc56b, emissiveIntensity: 0 }); windowMats.push(wm);
      mesh(new THREE.BoxGeometry(w * 0.6, 0.8, 0.1), wm, g, [0, h * 0.55, d / 2 + 0.05]);
    }
  }

  // ---------- time of day ----------
  const TOD = {
    morning: { top: 0x6fa3dc, hor: 0xffd9b0, sun: 0xffd6a0, si: 1.45, hi: 0.55, fog: 0xf0d9c0, el: 0.32, az: -2.2, star: 0, lamps: 0, exp: 1.0 },
    noon: { top: 0x3f86d8, hor: 0xcfe6ff, sun: 0xfff3dc, si: 1.75, hi: 0.65, fog: 0xcfe2f5, el: 1.0, az: -0.8, star: 0, lamps: 0, exp: 1.0 },
    afternoon: { top: 0x4a8ad0, hor: 0xe8e0c8, sun: 0xffe2b0, si: 1.6, hi: 0.6, fog: 0xdcdcc8, el: 0.55, az: 0.9, star: 0, lamps: 0, exp: 1.0 },
    sunset: { top: 0x3c4f8f, hor: 0xff9a5c, sun: 0xff8a3d, si: 1.25, hi: 0.45, fog: 0xe39a72, el: 0.1, az: 1.6, star: 0.1, lamps: 0.6, exp: 1.0 },
    night: { top: 0x0b1430, hor: 0x2a3a6a, sun: 0x9fb6ff, si: 0.45, hi: 0.3, fog: 0x1c2748, el: 0.6, az: 2.4, star: 1, lamps: 1, exp: 1.1 },
  };
  const cur = {};
  function applyTOD(a, b, k) {
    const A = TOD[a], B = TOD[b || a]; k = b ? k : 0;
    const c = (x, y) => new THREE.Color(x).lerp(new THREE.Color(y), k);
    const l = (x, y) => x + (y - x) * k;
    sky.material.uniforms.top.value.copy(c(A.top, B.top));
    sky.material.uniforms.hor.value.copy(c(A.hor, B.hor));
    sky.material.uniforms.sunCol.value.copy(c(A.sun, B.sun));
    sun.color.copy(c(A.sun, B.sun)); sun.intensity = l(A.si, B.si);
    hemi.intensity = l(A.hi, B.hi); hemi.color.copy(c(A.hor, B.top)).lerp(new THREE.Color(0xffffff), 0.4);
    scene.fog.color.copy(c(A.fog, B.fog));
    cur.el = l(A.el, B.el); cur.az = l(A.az, B.az);
    const dir = new THREE.Vector3(Math.cos(cur.az) * Math.cos(cur.el), Math.sin(cur.el), Math.sin(cur.az) * Math.cos(cur.el));
    cur.dir = dir; sky.material.uniforms.sunDir.value.copy(dir);
    stars.material.opacity = l(A.star, B.star);
    const lamps = l(A.lamps, B.lamps);
    windowMats.forEach(m => m.emissiveIntensity = lamps * 1.4);
    lampGlows.forEach(g => g.material.opacity = lamps * 0.85);
    fireflyPts.material.opacity = Math.max(0, lamps - 0.3) * 1.4;
    clouds.forEach(cl => cl.children.forEach(m => m.material.color.copy(c(0xffffff, 0xffffff)).lerp(new THREE.Color(A.hor).lerp(new THREE.Color(B.hor), k), 0.25).multiplyScalar(l(A.si, B.si) / 1.6 * 0.6 + 0.4)));
  }

  function update(t, dt, focus) {
    // water waves
    const p = water.geometry.attributes.position, a = p.array;
    for (let i = 0; i < a.length; i += 3) {
      const x = waterBase[i], z = waterBase[i + 2];
      a[i + 1] = WL + Math.sin(x * 0.35 + t * 1.3) * 0.05 + Math.cos(z * 0.42 - t * 1.1) * 0.05 + Math.sin((x + z) * 0.9 + t * 2.2) * 0.02;
    }
    p.needsUpdate = true; water.geometry.computeVertexNormals();
    if (boat) { boat.position.y = WL + Math.sin(t * 1.2) * 0.06; boat.rotation.z = Math.sin(t * 0.9) * 0.02; boat.rotation.x = Math.cos(t * 0.7) * 0.015; }
    clouds.forEach(c => { c.position.x += c.userData.v * dt; if (c.position.x > 300) c.position.x = -300; });
    // shadow camera follows the player
    if (cur.dir) { sun.position.copy(focus).addScaledVector(cur.dir, 80); sun.target.position.copy(focus); }
    sky.position.copy(focus); stars.position.copy(focus);
    // fireflies
    if (fireflyPts.material.opacity > 0) {
      const fp = fireflyPts.geometry.attributes.position, s = fireflyPts.userData.seeds;
      for (let i = 0; i < s.length; i++) { const [x, z, o] = s[i]; fp.setXYZ(i, x + Math.sin(t * 0.5 + o) * 2, groundH(x, z) + 1 + Math.sin(t * 1.3 + o * 3) * 0.6, z + Math.cos(t * 0.4 + o) * 2); }
      fp.needsUpdate = true;
    }
  }

  return { P, WL, build, groundH, colliders, applyTOD, update, pathCurve, distPath, lakeE, glowTex };
})();
