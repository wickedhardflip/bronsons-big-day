// Character models: smooth lofted bodies with procedural animation.
// Treat every hex color as sRGB so the scene matches the palette under sRGB output.
(function () { const o = THREE.Color.prototype.setHex; THREE.Color.prototype.setHex = function (h) { o.call(this, h); return this.convertSRGBToLinear(); }; })();
const hexStr = h => '#' + (h >>> 0).toString(16).padStart(6, '0');

const Models = (() => {
  const V3 = THREE.Vector3;
  let maxAniso = 4;
  const std = (color, o = {}) => new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.75, metalness: 0 }, o));

  // ---------- procedural textures ----------
  function canvas(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); return c; }
  function toTex(c, repeat, srgb = true) {
    const t = new THREE.CanvasTexture(c);
    if (srgb) t.encoding = THREE.sRGBEncoding;
    t.anisotropy = maxAniso;
    if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
    return t;
  }
  function canvasTex(w, h, draw, repeat) { return toTex(canvas(w, h, draw), repeat); }
  // normal map from the luminance of a canvas (wraps at the edges so it tiles)
  function normalFrom(c, strength = 2, repeat) {
    const w = c.width, h = c.height, src = c.getContext('2d').getImageData(0, 0, w, h).data;
    const lum = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) lum[i] = (src[i * 4] * 0.3 + src[i * 4 + 1] * 0.59 + src[i * 4 + 2] * 0.11) / 255;
    const out = canvas(w, h, () => { });
    const g = out.getContext('2d'), img = g.createImageData(w, h), d = img.data;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const l = lum[y * w + (x - 1 + w) % w], r = lum[y * w + (x + 1) % w], u = lum[((y - 1 + h) % h) * w + x], dn = lum[((y + 1) % h) * w + x];
      let nx = (l - r) * strength, ny = (u - dn) * strength, nz = 1; const len = Math.hypot(nx, ny, nz); nx /= len; ny /= len; nz /= len;
      const k = (y * w + x) * 4; d[k] = (nx * 0.5 + 0.5) * 255; d[k + 1] = (ny * 0.5 + 0.5) * 255; d[k + 2] = (nz * 0.5 + 0.5) * 255; d[k + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    return toTex(out, repeat, false);
  }
  const rnd = (a, b) => a + Math.random() * (b - a);
  function rgbOf(hex) { return [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255]; }

  // short coat: base color, soft mottling and fur streaks that run along the body
  function furTextures(hex) {
    const [r, g0, b] = rgbOf(hex);
    const c = canvas(512, 512, (g, w, h) => {
      g.fillStyle = hexStr(hex); g.fillRect(0, 0, w, h);
      for (let i = 0; i < 40; i++) { const k = rnd(0.88, 1.12); g.fillStyle = `rgba(${Math.min(255, r * k) | 0},${Math.min(255, g0 * k) | 0},${Math.min(255, b * k) | 0},0.25)`; g.beginPath(); g.arc(rnd(0, w), rnd(0, h), rnd(20, 70), 0, 7); g.fill(); }
      for (let i = 0; i < 9000; i++) {
        const k = rnd(0.72, 1.3), x = rnd(0, w), y = rnd(0, h), len = rnd(5, 12);
        g.strokeStyle = `rgba(${Math.min(255, r * k) | 0},${Math.min(255, g0 * k) | 0},${Math.min(255, b * k) | 0},0.55)`;
        g.lineWidth = rnd(0.6, 1.6); g.beginPath(); g.moveTo(x, y); g.lineTo(x + rnd(-1.5, 1.5), y + len); g.stroke();
      }
    });
    return { map: toTex(c, [3, 3]), normalMap: normalFrom(c, 3, [3, 3]) };
  }
  function floralTex() {
    return canvasTex(1024, 1024, (g, w, h) => {
      g.fillStyle = '#f6f7fb'; g.fillRect(0, 0, w, h);
      const blues = ['#2f5fa8', '#5b86c6', '#23488a', '#86a8da', '#3c6db5'];
      for (let i = 0; i < 160; i++) {
        const x = rnd(0, w), y = rnd(0, h), r = rnd(10, 24), col = blues[i % 5];
        g.strokeStyle = '#6f8fb8'; g.lineWidth = 2.5; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + r * 1.8, y + r * 0.8, x + r * 2.6, y - r * 0.5); g.stroke();
        g.fillStyle = '#7f9ccc'; g.beginPath(); g.ellipse(x + r * 2, y + r * 0.2, r * 0.5, r * 0.22, 0.6, 0, 7); g.fill();
        g.fillStyle = col;
        for (let p = 0; p < 5; p++) { const a = p / 5 * Math.PI * 2 + i; g.beginPath(); g.ellipse(x + Math.cos(a) * r * 0.62, y + Math.sin(a) * r * 0.62, r * 0.55, r * 0.34, a, 0, Math.PI * 2); g.fill(); }
        g.fillStyle = '#e8eef8'; g.beginPath(); g.arc(x, y, r * 0.24, 0, 7); g.fill();
      }
    }, [2, 2]);
  }
  function tattooTex(skin) {
    return canvasTex(512, 512, (g, w, h) => {
      g.fillStyle = skin; g.fillRect(0, 0, w, h);
      g.strokeStyle = 'rgba(38,42,50,0.82)'; g.lineWidth = 2.5; g.lineCap = 'round';
      const spots = [[110, 120], [380, 90], [250, 260], [90, 400], [400, 380], [260, 460]];
      spots.forEach(([x, y], i) => {
        const r = rnd(22, 34);
        if (i % 3 === 0) { for (let k = 0; k < 5; k++) { g.beginPath(); g.arc(x, y, r * (0.2 + k * 0.2), k, k + 4.6); g.stroke(); } for (let k = -1; k <= 1; k += 2) { g.beginPath(); g.ellipse(x + k * r * 1.2, y + r * 0.9, r * 0.5, r * 0.2, k * 0.6, 0, 7); g.stroke(); } }
        else if (i % 3 === 1) { g.beginPath(); g.ellipse(x - r * 0.5, y, r * 0.5, r * 0.8, -0.4, 0, 7); g.stroke(); g.beginPath(); g.ellipse(x + r * 0.5, y, r * 0.5, r * 0.8, 0.4, 0, 7); g.stroke(); g.beginPath(); g.moveTo(x, y - r * 0.6); g.lineTo(x, y + r * 0.7); g.stroke(); }
        else { g.beginPath(); g.moveTo(x, y - r * 2); g.bezierCurveTo(x + r, y - r, x - r, y + r, x, y + r * 2); g.stroke(); for (let k = -1; k <= 1; k++) { g.beginPath(); g.ellipse(x + 8, y + k * r, 9, 4, 0.6, 0, 7); g.stroke(); } }
      });
    });
  }
  function fabricTex(hex, weave = 4) {
    const [r, g0, b] = rgbOf(hex);
    const c = canvas(256, 256, (g, w, h) => {
      g.fillStyle = hexStr(hex); g.fillRect(0, 0, w, h);
      for (let y = 0; y < h; y += weave) for (let x = 0; x < w; x += weave) { const k = ((x / weave + y / weave) % 2 ? 0.93 : 1.05) * rnd(0.97, 1.03); g.fillStyle = `rgb(${Math.min(255, r * k) | 0},${Math.min(255, g0 * k) | 0},${Math.min(255, b * k) | 0})`; g.fillRect(x, y, weave, weave); }
    });
    return { map: toTex(c, [6, 6]), normalMap: normalFrom(c, 1.2, [6, 6]) };
  }
  function denimTextures() {
    const c = canvas(256, 256, (g, w, h) => {
      g.fillStyle = '#26354f'; g.fillRect(0, 0, w, h);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x += 2) { if ((x + y) % 4 < 2) { g.fillStyle = `rgba(${90 + Math.random() * 40},${105 + Math.random() * 40},${140 + Math.random() * 40},0.35)`; g.fillRect(x, y, 2, 1); } }
      for (let i = 0; i < 400; i++) { g.fillStyle = 'rgba(160,175,200,0.12)'; g.fillRect(rnd(0, w), rnd(0, h), 1, rnd(3, 10)); }
    });
    return { map: toTex(c, [4, 4]), normalMap: normalFrom(c, 1.5, [4, 4]) };
  }
  const denimTex = () => denimTextures().map;
  function hairTextures(hex) {
    const [r, g0, b] = rgbOf(hex);
    const c = canvas(256, 256, (g, w, h) => {
      g.fillStyle = hexStr(hex); g.fillRect(0, 0, w, h);
      for (let i = 0; i < 5200; i++) { const k = rnd(0.84, 1.16); g.strokeStyle = `rgba(${Math.min(255, r * k) | 0},${Math.min(255, g0 * k) | 0},${Math.min(255, b * k) | 0},0.6)`; g.lineWidth = rnd(0.5, 1.4); const x = rnd(0, w); g.beginPath(); g.moveTo(x, rnd(-20, h)); g.lineTo(x + rnd(-3, 3), rnd(0, h + 20)); g.stroke(); }
    });
    return { map: toTex(c, [4, 2]), normalMap: normalFrom(c, 0.8, [4, 2]) };
  }

  // ---------- geometry helpers ----------
  // Loft: sweep elliptical (or superelliptical) cross-sections along a path of points.
  // sections: [{p:[x,y,z], w, h, n?}] w = half-width on the side axis, h = half-height on the "up" axis.
  function loft(sections, opt = {}) {
    const seg = opt.seg || 22, ref = new V3().fromArray(opt.ref || [0, 1, 0]);
    const S = sections.map(s => ({ p: new V3().fromArray(s.p), w: s.w, h: s.h, n: s.n || 2 }));
    const pos = [], uv = [], idx = [];
    let total = 0; const along = [0];
    for (let i = 1; i < S.length; i++) { total += S[i].p.distanceTo(S[i - 1].p); along.push(total); }
    const ring = seg + 1;
    S.forEach((s, i) => {
      const t = new V3().subVectors(S[Math.min(i + 1, S.length - 1)].p, S[Math.max(i - 1, 0)].p).normalize();
      let X = new V3().crossVectors(ref, t); if (X.lengthSq() < 1e-6) X.set(1, 0, 0); X.normalize();
      const Y = new V3().crossVectors(t, X).normalize();
      for (let j = 0; j <= seg; j++) {
        const a = j / seg * Math.PI * 2, c = Math.cos(a), sn = Math.sin(a), e = 2 / s.n;
        const cx = Math.sign(c) * Math.pow(Math.abs(c), e), sy = Math.sign(sn) * Math.pow(Math.abs(sn), e);
        const q = s.p.clone().addScaledVector(X, cx * s.w).addScaledVector(Y, sy * s.h);
        pos.push(q.x, q.y, q.z); uv.push(j / seg, total ? along[i] / total : 0);
      }
    });
    for (let i = 0; i < S.length - 1; i++) for (let j = 0; j < seg; j++) {
      const a = i * ring + j, b = a + ring;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
    // make the side faces point outward
    const P = k => new V3(pos[k * 3], pos[k * 3 + 1], pos[k * 3 + 2]);
    const mi = Math.min(Math.floor(S.length / 2), S.length - 2), a0 = mi * ring + 1;
    const fn = new V3().subVectors(P(a0 + ring), P(a0)).cross(new V3().subVectors(P(a0 + 1), P(a0)));
    if (fn.dot(new V3().subVectors(P(a0), S[mi].p)) < 0) for (let i = 0; i < idx.length; i += 3) { const t = idx[i]; idx[i] = idx[i + 1]; idx[i + 1] = t; }
    // end caps (fans), each wound to face away from the body
    const cap = (i, dir) => {
      const c = pos.length / 3, p = S[i].p, a = i * ring; pos.push(p.x, p.y, p.z); uv.push(0.5, i ? 1 : 0);
      const flip = new V3().subVectors(P(a), p).cross(new V3().subVectors(P(a + 1), p)).dot(dir) < 0;
      for (let j = 0; j < seg; j++) flip ? idx.push(c, a + j + 1, a + j) : idx.push(c, a + j, a + j + 1);
    };
    const L = S.length - 1;
    cap(0, new V3().subVectors(S[0].p, S[1].p)); cap(L, new V3().subVectors(S[L].p, S[L - 1].p));
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeVertexNormals();
    const n = g.attributes.normal;
    // weld the UV seam normals
    for (let i = 0; i < S.length; i++) {
      const a = i * ring, b = a + seg; const nx = n.getX(a) + n.getX(b), ny = n.getY(a) + n.getY(b), nz = n.getZ(a) + n.getZ(b), l = Math.hypot(nx, ny, nz) || 1;
      n.setXYZ(a, nx / l, ny / l, nz / l); n.setXYZ(b, nx / l, ny / l, nz / l);
    }
    return g;
  }
  function mesh(geo, mat, parent, pos, rot, scale) {
    const m = new THREE.Mesh(geo, mat); m.castShadow = true; m.receiveShadow = true;
    if (pos) m.position.set(pos[0], pos[1], pos[2]);
    if (rot) m.rotation.set(rot[0], rot[1], rot[2]);
    if (scale) m.scale.set(scale[0], scale[1], scale[2]);
    if (parent) parent.add(m); return m;
  }
  // Fewer draw calls: bake the static leaf meshes under each pivot into one mesh per material.
  // Pivots stay groups so every pose still works; named, hidden or custom-shaded meshes are left alone.
  const defCompile = THREE.Material.prototype.onBeforeCompile;
  const matSig = m => [m.type, m.color && m.color.getHex(), m.emissive && m.emissive.getHex(), m.emissiveIntensity, m.roughness, m.metalness,
    m.map && m.map.uuid, m.normalMap && m.normalMap.uuid, m.normalScale && m.normalScale.x, m.roughnessMap && m.roughnessMap.uuid, m.transparent, m.opacity,
    m.side, m.alphaTest, m.clearcoat, m.clearcoatRoughness, m.sheen && m.sheen.getHex ? m.sheen.getHex() : m.sheen, m.envMapIntensity, m.flatShading, m.vertexColors,
    m.depthWrite, m.blending, m.onBeforeCompile !== defCompile ? m.uuid : '', m.userData.slot || ''].join('|');
  function mergeStatic(root, byRef) {
    const pivots = []; root.traverse(o => pivots.push(o));
    let saved = 0;
    pivots.forEach(par => {
      const buckets = new Map();
      par.children.forEach(m => {
        if (!m.isMesh || m.isInstancedMesh || m.geometry.isInstancedBufferGeometry || !m.frustumCulled || m.onBeforeRender !== THREE.Object3D.prototype.onBeforeRender || m.children.length || m.name || !m.visible || Array.isArray(m.material) || m.customDepthMaterial || m.morphTargetInfluences) return;
        const at = m.geometry.attributes; if (Object.values(at).some(a => a.isInterleavedBufferAttribute || !(a.array instanceof Float32Array))) return;
        const key = (byRef ? m.material.uuid : matSig(m.material)) + '#' + m.layers.mask + '#' + Object.keys(at).sort().map(k => k + at[k].itemSize).join(',') + '#' + m.castShadow + m.receiveShadow + m.renderOrder;
        if (!buckets.has(key)) buckets.set(key, []); buckets.get(key).push(m);
      });
      buckets.forEach(list => {
        if (list.length < 2) return;
        const geos = list.map(m => {
          m.updateMatrix(); const g = m.geometry.clone(); g.applyMatrix4(m.matrix);
          if (!g.index) { const n = g.attributes.position.count, ix = new Uint32Array(n); for (let i = 0; i < n; i++) ix[i] = i; g.setIndex(new THREE.BufferAttribute(ix, 1)); }
          if (m.matrix.determinant() < 0) { const a = g.index.array; for (let i = 0; i < a.length; i += 3) { const t = a[i + 1]; a[i + 1] = a[i + 2]; a[i + 2] = t; } }
          return g;
        });
        const out = new THREE.BufferGeometry(); let vtx = 0, ni = 0;
        geos.forEach(g => { vtx += g.attributes.position.count; ni += g.index.count; });
        Object.keys(geos[0].attributes).forEach(k => {
          const sz = geos[0].attributes[k].itemSize, arr = new Float32Array(vtx * sz); let o = 0;
          geos.forEach(g => { arr.set(g.attributes[k].array, o); o += g.attributes[k].count * sz; });
          out.setAttribute(k, new THREE.BufferAttribute(arr, sz));
        });
        const I = new (vtx > 65535 ? Uint32Array : Uint16Array)(ni); let io = 0, vo = 0;
        geos.forEach(g => { const a = g.index.array; for (let i = 0; i < g.index.count; i++) I[io++] = a[i] + vo; vo += g.attributes.position.count; g.dispose(); });
        out.setIndex(new THREE.BufferAttribute(I, 1)); out.computeBoundingSphere();
        const mm = new THREE.Mesh(out, list[0].material); mm.castShadow = list[0].castShadow; mm.receiveShadow = list[0].receiveShadow; mm.renderOrder = list[0].renderOrder;
        list.forEach(m => par.remove(m)); par.add(mm); saved += list.length - 1;
      });
    });
    return saved;
  }
  const grp = (parent, pos) => { const g = new THREE.Group(); if (pos) g.position.set(pos[0], pos[1], pos[2]); if (parent) parent.add(g); return g; };
  const SPH = new THREE.SphereGeometry(1, 32, 24);
  const SPH_LO = new THREE.SphereGeometry(1, 16, 12);
  // a smooth limb hanging down from its pivot: [[y, w, d, z?], ...]
  const limb = (secs, seg = 18) => loft(secs.map(([y, w, d, z = 0]) => ({ p: [0, y, z], w, h: d })), { ref: [0, 0, 1], seg });
  // flat strap ring around an elliptical section (w x h in the XZ plane, axis Y): collars and harness loops
  function strapRing(w, h, width, thick, seg = 48) {
    const prof = [[0, -1], [0.7, -1], [1, -0.7], [1, 0.7], [0.7, 1], [0, 1]].map(([r, y]) => [r * thick, y * width / 2]);
    const pos = [], idx = [], P = prof.length;
    for (let j = 0; j <= seg; j++) {
      const a = j / seg * Math.PI * 2, c = Math.cos(a), sn = Math.sin(a);
      let nx = c / w, nz = sn / h; const l = Math.hypot(nx, nz); nx /= l; nz /= l;
      prof.forEach(([r, y]) => pos.push(c * w + nx * r, y, sn * h + nz * r));
    }
    for (let j = 0; j < seg; j++) for (let k = 0; k < P; k++) { const a = j * P + k, b = j * P + (k + 1) % P, c2 = a + P, d = b + P; idx.push(a, b, c2, b, d, c2); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
    return g;
  }

  // ================= DOG =================
  function makeDog(opt) {
    const o = Object.assign({ coat: 0x6e3519, size: 1, collar: 0xf2c418, harness: 0x1f55d6, ears: 'floppy', nose: 0x5b3530, eye: 0xa86f2a, belly: null, tail: 'down', muzzle: 0.88 }, opt);
    const fur = furTextures(o.coat);
    const coatMat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, map: fur.map, normalMap: fur.normalMap, normalScale: new THREE.Vector2(0.35, 0.35), roughness: 0.8, sheen: new THREE.Color(o.coat).lerp(new THREE.Color(0xffffff), 0.12) });
    const darkMat = coatMat.clone(); darkMat.color = new THREE.Color(0xc4b2a8);
    const bellyMat = o.belly ? std(o.belly, { roughness: 0.85 }) : coatMat;
    const noseMat = new THREE.MeshPhysicalMaterial({ color: o.nose, roughness: 0.32, clearcoat: 0.6, clearcoatRoughness: 0.4 });
    const eyeMat = new THREE.MeshPhysicalMaterial({ color: o.eye, roughness: 0.1, clearcoat: 1, clearcoatRoughness: 0.05 });
    const pupilMat = new THREE.MeshPhysicalMaterial({ color: 0x0b0806, roughness: 0.05, clearcoat: 1 });
    const pawMat = std(new THREE.Color(o.coat).multiplyScalar(0.55).getHex(), { roughness: 0.9 });
    pawMat.color.convertLinearToSRGB(); // getHex returned linear; undo the double conversion

    const root = new THREE.Group();
    const BY = 0.55; // torso pivot height
    const body = grp(root, [0, BY, 0]);
    // torso: lean, deep chest, tucked waist (z: back to front)
    const T = [[-0.47, 0.565, 0.02, 0.02], [-0.44, 0.565, 0.075, 0.07], [-0.38, 0.555, 0.105, 0.105], [-0.29, 0.555, 0.112, 0.112], [-0.19, 0.565, 0.098, 0.088],
      [-0.07, 0.548, 0.11, 0.115], [0.06, 0.525, 0.122, 0.148], [0.17, 0.52, 0.12, 0.158], [0.27, 0.535, 0.104, 0.138], [0.34, 0.555, 0.075, 0.1], [0.38, 0.57, 0.03, 0.045]];
    mesh(loft(T.map(([z, y, w, h]) => ({ p: [0, y - BY, z], w, h })), { seg: 28 }), coatMat, body).name = 'torso';
    const prof = z => { // interpolate the torso section at z: [centre y, half width, half height]
      for (let i = 1; i < T.length; i++) if (z <= T[i][0]) { const a = T[i - 1], b = T[i], k = Math.max(0, (z - a[0]) / (b[0] - a[0])); return [a[1] + (b[1] - a[1]) * k - BY, a[2] + (b[2] - a[2]) * k, a[3] + (b[3] - a[3]) * k]; }
      const l = T[T.length - 1]; return [l[1] - BY, l[2], l[3]];
    };
    if (o.belly) mesh(SPH, bellyMat, body, [0, 0.4 - BY, 0.14], null, [0.085, 0.06, 0.16]);
    // shoulder and haunch muscles so the legs blend in
    [-1, 1].forEach(s => {
      mesh(SPH, coatMat, body, [s * 0.07, 0.535 - BY, 0.215], [0.45, 0, 0], [0.058, 0.115, 0.08]);
      mesh(SPH, coatMat, body, [s * 0.066, 0.54 - BY, -0.31], [-0.42, 0, 0], [0.06, 0.115, 0.1]);
    });
    // neck
    const neck = grp(body, [0, 0.6 - BY, 0.26]);
    mesh(loft([{ p: [0, -0.06, -0.06], w: 0.09, h: 0.105 }, { p: [0, 0.02, 0.02], w: 0.085, h: 0.095 }, { p: [0, 0.12, 0.1], w: 0.075, h: 0.08 }, { p: [0, 0.2, 0.15], w: 0.066, h: 0.068 }, { p: [0, 0.24, 0.17], w: 0.034, h: 0.034 }], { seg: 24 }), coatMat, neck);
    // head (origin at the skull centre): broad skull, clear stop, deep blocky muzzle
    const head = grp(neck, [0, 0.23, 0.155]); head.scale.setScalar(1.12);
    const ml = o.muzzle, mz = 0.09 + 0.13 * ml;
    const H = [[-0.085, 0.012, 0.02, 0.02], [-0.07, 0.014, 0.056, 0.06], [-0.035, 0.018, 0.072, 0.07], [0.015, 0.014, 0.072, 0.066], [0.06, 0.0, 0.062, 0.058],
      [0.09, -0.02, 0.05, 0.052, 2.3], [0.09 + 0.045 * ml, -0.028, 0.045, 0.047, 2.5], [0.09 + 0.09 * ml, -0.031, 0.041, 0.043, 2.6], [0.09 + 0.118 * ml, -0.031, 0.037, 0.038, 2.4], [mz - 0.004, -0.03, 0.03, 0.03, 2.2], [mz, -0.029, 0.014, 0.016]];
    mesh(loft(H.map(([z, y, w, h, n]) => ({ p: [0, y, z], w, h, n })), { seg: 28 }), coatMat, head);
    // lip line on each side of the muzzle
    const lipMat = std(0x2a1712, { roughness: 0.5 });
    [-1, 1].forEach(s => {
      const c = new THREE.CatmullRomCurve3([[s * 0.022, -0.058, mz - 0.004], [s * 0.031, -0.0585, mz - 0.016], [s * 0.037, -0.061, 0.09 + 0.045 * ml], [s * 0.041, -0.055, 0.092]].map(p => new V3(p[0], p[1], p[2])));
      mesh(new THREE.TubeGeometry(c, 16, 0.0019, 6, false), lipMat, head);
    });
    // brows
    [-1, 1].forEach(s => mesh(SPH, coatMat, head, [s * 0.042, 0.04, 0.064], [0, 0, s * -0.12], [0.022, 0.009, 0.024]));
    // nose
    const nz = mz - 0.006;
    mesh(SPH, noseMat, head, [0, -0.012, nz], [-0.3, 0, 0], [0.021, 0.0145, 0.012]);
    [-1, 1].forEach(s => mesh(SPH_LO, pupilMat, head, [s * 0.0082, -0.0155, nz + 0.0098], null, [0.0046, 0.0032, 0.003]));
    // eyes
    const eyes = [];
    [-1, 1].forEach(s => {
      const e = grp(head, [s * 0.049, 0.023, 0.073]); e.rotation.set(-0.15, s * 0.5, 0);
      mesh(SPH, eyeMat, e, [0, 0, 0], null, [0.0132, 0.011, 0.011]);
      mesh(SPH_LO, pupilMat, e, [0, 0, 0.0085], null, [0.0058, 0.0058, 0.0033]);
      mesh(SPH, darkMat, e, [0, 0.0097, 0.0005], [0.2, 0, 0], [0.0148, 0.0028, 0.0118]); // upper lid
      eyes.push(e);
    });
    const tongue = mesh(SPH, std(0xd65f74, { roughness: 0.35 }), head, [0, -0.074, mz - 0.03], [0.35, 0, 0], [0.024, 0.006, 0.05]);
    tongue.visible = false;
    // ears
    const ears = [];
    [-1, 1].forEach(s => {
      const pivot = grp(head, [s * 0.06, 0.055, -0.03]);
      let flap;
      if (o.ears === 'up') {
        const sh = new THREE.Shape(); sh.moveTo(-0.032, 0); sh.quadraticCurveTo(-0.02, 0.06, 0.0, 0.085); sh.quadraticCurveTo(0.02, 0.06, 0.032, 0); sh.lineTo(-0.032, 0);
        flap = mesh(new THREE.ExtrudeGeometry(sh, { depth: 0.006, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.004, bevelSegments: 2, curveSegments: 10 }), darkMat, pivot, [0, 0, 0], [0, 0, 0]);
        pivot.rotation.set(-0.15, 0, s * -0.25);
      } else {
        const sh = new THREE.Shape(); sh.moveTo(-0.048, 0); sh.quadraticCurveTo(-0.052, -0.06, -0.016, -0.105); sh.quadraticCurveTo(0.01, -0.12, 0.03, -0.088); sh.quadraticCurveTo(0.05, -0.04, 0.042, 0); sh.quadraticCurveTo(0, 0.022, -0.048, 0);
        const eg = new THREE.ExtrudeGeometry(sh, { depth: 0.004, bevelEnabled: true, bevelThickness: 0.003, bevelSize: 0.003, bevelSegments: 2, curveSegments: 14, steps: 1 });
        const ep = eg.attributes.position; // cup the flap so it hugs the cheek, with a fold near the top
        for (let i = 0; i < ep.count; i++) { const x = ep.getX(i), y = ep.getY(i); ep.setZ(i, ep.getZ(i) - 2.4 * x * x - 0.9 * y * y); }
        eg.computeVertexNormals();
        flap = mesh(eg, darkMat, pivot, [s * 0.006, 0.006, 0], [0, s * Math.PI / 2, 0]);
        pivot.rotation.set(0, 0, s * 0.12);
      }
      flap.castShadow = true; pivot.userData.side = s; pivot.userData.rest = pivot.rotation.clone(); ears.push(pivot);
    });
    // flat nylon collar hugging the neck, with a buckle and the bone tag at the throat
    const collarMat = std(o.collar, { roughness: 0.62, side: THREE.DoubleSide }); collarMat.userData.slot = 'collar';
    const cTh = 0.68, cS = Math.sin(cTh), cC = Math.cos(cTh), cw = 0.081, chh = 0.089;
    mesh(strapRing(cw, chh, 0.03, 0.006), collarMat, neck, [0, 0.07, 0.06], [cTh, 0, 0]);
    const metal = std(0xc9ccd2, { metalness: 0.9, roughness: 0.25 });
    mesh(new THREE.BoxGeometry(0.008, 0.026, 0.034), metal, neck, [-(cw + 0.006), 0.07, 0.06], [cTh, 0, 0]);
    const throat = [0, 0.07 - cS * (chh + 0.005), 0.06 + cC * (chh + 0.005)];
    mesh(new THREE.TorusGeometry(0.008, 0.0018, 6, 14), metal, neck, throat, [0, Math.PI / 2, 0]);
    const tag = grp(neck, [throat[0], throat[1] - 0.008, throat[2] + 0.004]);
    mesh(new THREE.TorusGeometry(0.005, 0.0013, 6, 12), metal, tag, [0, -0.004, 0]);
    const boneMat = std(0x141414, { roughness: 0.35 });
    mesh(new THREE.BoxGeometry(0.022, 0.008, 0.004), boneMat, tag, [0, -0.016, 0]);
    [[-0.011, 0.0035], [-0.011, -0.0035], [0.011, 0.0035], [0.011, -0.0035]].forEach(([x, y]) => mesh(new THREE.CylinderGeometry(0.0045, 0.0045, 0.004, 10), boneMat, tag, [x, -0.016 + y, 0], [Math.PI / 2, 0, 0]));
    // harness straps that hug the torso
    if (o.harness !== null) {
      const hm = std(o.harness, { roughness: 0.5 }); hm.userData.slot = 'harness'; // tagged so outfits can recolor or hide it
      const band = (zc, tilt, width, grow = 1.06) => {
        const seg = 40, pos = [], idx = [];
        for (let j = 0; j <= seg; j++) {
          const a = j / seg * Math.PI * 2;
          for (let e = -1; e <= 1; e += 2) {
            const z = zc + e * width - tilt * Math.sin(a); const [yc, w, h] = prof(z);
            pos.push(Math.cos(a) * w * grow, yc + Math.sin(a) * h * grow, z);
          }
        }
        for (let j = 0; j < seg; j++) { const a = j * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
        const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
        const m = mesh(g, hm, body); m.material = hm.clone(); m.material.side = THREE.DoubleSide; return m;
      };
      band(0.06, 0.0, 0.016);        // girth strap behind the front legs
      band(0.315, 0.07, 0.016, 1.12); // chest strap across the forechest
      mesh(new THREE.BoxGeometry(0.038, 0.012, 0.22), hm, body, [0, 0.675 - BY, 0.17], [-0.06, 0, 0]); // back strap
      const ring = mesh(new THREE.TorusGeometry(0.014, 0.004, 8, 16), std(0xc9ccd2, { metalness: 0.9, roughness: 0.25 }), body, [0, 0.69 - BY, 0.1], [0, 0, 0]);
      ring.name = 'leashRing';
      const buckle = std(0x111111, { roughness: 0.4 }); buckle.userData.slot = 'harnessHw';
      [-1, 1].forEach(s => mesh(new THREE.BoxGeometry(0.006, 0.026, 0.03), buckle, body, [s * 0.13, 0.52 - BY, 0.06]));
    }
    // legs: front pivots at the elbow, rear at the hip; rest angles give the rear leg its angulation
    const legs = [];
    const defs = [['FL', -1, 0.235, 0.47, true], ['FR', 1, 0.235, 0.47, true], ['BL', -1, -0.3, 0.53, false], ['BR', 1, -0.3, 0.53, false]];
    defs.forEach(([n, s, z, y, front]) => {
      const hip = grp(body, [s * 0.072, y - BY, z]);
      let upper, lower, upLen, restHip, restKnee;
      if (front) {
        upLen = 0.3; restHip = 0; restKnee = 0;
        upper = limb([[0.1, 0.022, 0.03], [0.07, 0.044, 0.056], [0, 0.05, 0.062], [-0.1, 0.04, 0.05], [-0.22, 0.031, 0.036], [-0.3, 0.028, 0.031]]);
        lower = limb([[0.01, 0.028, 0.031], [-0.06, 0.025, 0.028, 0.008], [-0.12, 0.026, 0.03, 0.014], [-0.14, 0.016, 0.016, 0.016]]);
      } else {
        upLen = 0.26; restHip = -0.42; restKnee = 0.88;
        upper = limb([[0.11, 0.025, 0.04], [0.07, 0.05, 0.084], [0, 0.062, 0.1], [-0.1, 0.052, 0.08], [-0.2, 0.038, 0.054], [-0.27, 0.033, 0.044]]);
        lower = limb([[0.01, 0.033, 0.045], [-0.08, 0.029, 0.04, -0.01], [-0.15, 0.024, 0.033, -0.018], [-0.18, 0.023, 0.03, -0.012], [-0.22, 0.022, 0.026, 0.008], [-0.27, 0.021, 0.024, 0.032], [-0.285, 0.015, 0.015, 0.04]]);
      }
      mesh(upper, coatMat, hip);
      const knee = grp(hip, [0, -upLen, 0]);
      mesh(lower, coatMat, knee);
      const pawY = front ? -0.15 : -0.285;
      const paw = grp(knee, [0, pawY, front ? 0.018 : 0.04]);
      mesh(SPH, coatMat, paw, [0, 0.002, 0.018], null, [0.033, 0.022, 0.044]);
      [-0.018, -0.006, 0.006, 0.018].forEach(x => mesh(SPH_LO, coatMat, paw, [x, -0.004, 0.052], null, [0.0105, 0.0125, 0.013]));
      [-0.018, -0.006, 0.006, 0.018].forEach(x => mesh(SPH_LO, pawMat, paw, [x, -0.012, 0.064], [0.6, 0, 0], [0.003, 0.003, 0.006])); // nails
      hip.rotation.x = restHip; knee.rotation.x = restKnee; paw.rotation.x = -(restHip + restKnee);
      legs.push({ n, hip, knee, paw, front, side: s, restHip, restKnee });
    });
    // tail: chain of tapered segments
    const tail = [];
    let tp = grp(body, [0, 0.585 - BY, -0.44]);
    for (let i = 0; i < 8; i++) {
      const r0 = 0.028 - i * 0.0026, r1 = r0 - 0.0026;
      mesh(loft([{ p: [0, -0.006, 0], w: r0 * 0.85, h: r0 * 0.85 }, { p: [0, 0, 0], w: r0, h: r0 }, { p: [0, 0.052, 0], w: r1, h: r1 }, { p: [0, 0.058, 0], w: r1 * 0.75, h: r1 * 0.75 }], { ref: [0, 0, 1], seg: 12 }), coatMat, tp);
      tail.push(tp);
      tp = grp(tp, [0, 0.052, 0]);
    }
    const mouthSlot = grp(head, [0, -0.06, mz - 0.02]);
    root.scale.setScalar(o.size);
    mergeStatic(root);
    // what the wardrobe needs: the collar and harness parts, and the shapes clothes are cut to
    const slots = { collar: [], harness: [] };
    root.traverse(m => { if (!m.isMesh) return; const k = m.material.userData.slot; if (k === 'collar') slots.collar.push(m); else if (k === 'harness' || k === 'harnessHw') slots.harness.push(m); });
    const ring = body.getObjectByName('leashRing');
    return {
      root, body, neck, head, ears, legs, tail, eyes, tongue, mouthSlot, tailStyle: o.tail, slots, T, BY, prof, mz, nz,
      collarFit: { y: 0.07, z: 0.06, tilt: cTh, w: cw, h: chh, throat, tag }, ringHome: ring ? ring.position.clone() : null,
      phase: 0, speed: 0, gallop: 0, lie: 0, sleep: 0, sit: 0, swim: 0, wag: 1, happy: 0, bow: 0, airborne: 0,
      earLag: 0, t: Math.random() * 10, blink: 1.5 + Math.random() * 2, size: o.size,
    };
  }

  const lerp = (a, b, k) => a + (b - a) * k;
  // Bronson's real habits, played as timed quirks that fade in and out over the base pose
  const QUIRK_DUR = { stretch: 3.6, scratch: 3.2, stare: 5.2 };
  function startQuirk(d, kind) { d.quirk = { kind, t: 0, dur: QUIRK_DUR[kind], fade: 1, cancel: false }; }
  function animateDog(d, dt) {
    d.t += dt;
    let qBow = 0, qBack = 0, qYawn = 0, qSit = 0, qScratch = 0, qStare = 0;
    const q = d.quirk;
    if (q) {
      q.t += dt; if (q.cancel) q.fade -= dt * 4;
      const t = q.t, win = (a, b, f) => Math.max(0, Math.min(1, (t - a) / f, (b - t) / f)) * Math.max(0, q.fade);
      if (q.kind === 'stretch') { qBow = win(0, 1.75, 0.45); qYawn = win(0.45, 1.45, 0.25); qBack = win(1.95, 3.5, 0.45); }
      else if (q.kind === 'scratch') { qSit = win(0, 3.1, 0.35); qScratch = win(0.45, 2.7, 0.2); }
      else if (q.kind === 'stare') { qSit = win(0, q.dur, 0.5); qStare = win(0.3, q.dur - 0.15, 0.6); }
      if (t >= q.dur || q.fade <= 0) d.quirk = null;
    }
    const sp = d.speed, gal = d.gallop;
    const freq = lerp(1.6, 2.5, gal) * (0.55 + sp * 0.17);
    if (sp > 0.05) d.phase += dt * freq * Math.PI * 2 * Math.min(1, sp * 0.6);
    const moving = Math.min(1, sp / 1.5), ph = d.phase;
    const lie = d.lie, sit = Math.max(d.sit, qSit), swim = d.swim, bow = Math.max(d.bow, qBow);
    d.legs.forEach(L => {
      let off;
      if (gal > 0.5) off = L.front ? (L.side < 0 ? 0 : 0.4) : (L.side < 0 ? Math.PI : Math.PI + 0.4);
      else off = (L.n === 'FL' || L.n === 'BR') ? 0 : Math.PI;
      const p = ph + off, amp = lerp(0.45, 0.85, gal) * moving;
      let hipX = Math.sin(p) * amp;
      let kneeX = (L.front ? 1.1 : -0.7) * Math.max(0, -Math.cos(p)) * amp;
      if (swim > 0) { hipX = lerp(hipX, Math.sin(d.t * 9 + off) * 0.6 - 0.3, swim); kneeX = lerp(kneeX, (L.front ? 1 : -1) * (0.5 + Math.cos(d.t * 9 + off) * 0.4), swim); }
      // absolute targets for lying and sitting, expressed as offsets from the rest pose
      const lieHip = (L.front ? -1.4 : -1.25) - L.restHip, lieKnee = (L.front ? 0.0 : 2.5) - L.restKnee;
      const sitHip = (L.front ? 0.05 : -1.2) - L.restHip, sitKnee = (L.front ? 0 : 2.35) - L.restKnee;
      hipX = lerp(lerp(hipX, sitHip, sit), lieHip, lie);
      kneeX = lerp(lerp(kneeX, sitKnee, sit), lieKnee, lie);
      if (bow > 0 && L.front) { hipX = lerp(hipX, -1.15, bow); kneeX = lerp(kneeX, 0.15, bow); }
      if (d.airborne > 0) { hipX = lerp(hipX, L.front ? -0.75 : 0.85, d.airborne); kneeX = lerp(kneeX, L.front ? 0.5 : -0.3, d.airborne); }
      // back half of the stretch: chest forward, back legs pushed out long behind
      if (qBack > 0) { if (L.front) hipX += 0.45 * qBack; else { hipX = lerp(hipX, (L.side < 0 ? 1.15 : 0.9) - L.restHip, qBack); kneeX = lerp(kneeX, 0.1 - L.restKnee, qBack); } }
      // side scratch: one back leg up by the shoulder, kicking fast
      if (qScratch > 0 && L.n === 'BR') { hipX = lerp(hipX, -2.05 - L.restHip, qScratch); kneeX = lerp(kneeX, 1.45 + Math.sin(d.t * 30) * 0.45 - L.restKnee, qScratch); }
      L.hip.rotation.x = L.restHip + hipX; L.knee.rotation.x = L.restKnee + kneeX;
      L.paw.rotation.x = -(L.hip.rotation.x + L.knee.rotation.x) * (1 - lie * 0.6) + (L.front ? 0 : 0.2) * lie;
      L.hip.rotation.z = lie * L.side * 0.1 + (L.n === 'BR' ? qScratch * 0.45 : 0);
    });
    const bob = Math.abs(Math.sin(ph)) * 0.022 * moving * (1 + gal * 1.6);
    const breathe = Math.sin(d.t * (d.sleep > 0.5 ? 1.5 : 3.2)) * 0.008;
    d.body.position.y = lerp(lerp(0.55 + bob, 0.4, sit), 0.21, lie) - swim * 0.06 - bow * 0.12 - qBack * 0.1;
    d.body.rotation.x = lerp(lerp(gal * Math.sin(ph) * 0.09 * moving, -0.5, sit), 0, lie) + bow * 0.28 - swim * 0.15 - qBack * 0.2;
    d.body.rotation.z = d.sleep * 0.12 + qScratch * 0.12;
    d.body.scale.y = 1 + breathe * 3;
    const look = Math.sin(d.t * 0.7) * 0.25 * (1 - moving) * (1 - d.sleep) * (1 - qStare);
    const gaze = Math.max(qStare, d.gaze || 0); // gaze: photo mode's "look at me"
    d.neck.rotation.x = lerp(lerp(Math.sin(ph * 2) * 0.05 * moving - gal * 0.3, 0.3, sit), 0.55 + d.sleep * 0.5, lie) - swim * 0.45 - qBack * 0.35 - qBow * 0.15 + gaze * (0.05 - (d.starePitch || 0));
    d.head.rotation.y = look * (1 - gaze) + (d.headTurn || 0) + qScratch * 0.4 + gaze * (d.stareYaw || 0);
    d.head.rotation.x = lerp(0, 0.35, d.sleep) - swim * 0.2 - qYawn * 0.4;
    // the soul stare comes with a slow, quizzical head tilt
    d.head.rotation.z = d.sleep * 0.35 + qScratch * 0.35 + qStare * (0.22 + Math.sin(d.t * 0.8) * 0.08) + (d.tilt || 0) * 0.38;
    d.earLag = lerp(d.earLag, bob * 25 + gal * 0.45 * moving, Math.min(1, dt * 8));
    d.ears.forEach(e => {
      const r = e.userData.rest, s = e.userData.side, jig = Math.sin(d.t * 30 + s) * 0.14 * qScratch;
      if (Math.abs(r.z) > 0.3) { e.rotation.x = r.x - d.earLag * 0.55 + Math.sin(d.t * 13 + s) * 0.05 * moving + jig; e.rotation.z = r.z + s * d.earLag * 0.25; }
      else { e.rotation.x = r.x - d.earLag * 0.1 + jig - qStare * 0.25; e.rotation.z = r.z - s * qStare * 0.12; } // ears perk up for the stare
    });
    const wagAmp = (0.3 + d.happy * 0.55) * d.wag * (1 - d.sleep * 0.9), wagSpd = 9 + d.happy * 8;
    const curl = d.tailStyle === 'curl';
    d.tail.forEach((s, i) => {
      s.rotation.z = Math.sin(d.t * wagSpd - i * 0.55) * wagAmp * (0.3 + i * 0.07);
      if (i === 0) s.rotation.x = curl ? -0.5 : lerp(-2.35 + gal * 0.7 + d.happy * 0.45, -2.75, d.sleep);
      else s.rotation.x = curl ? -0.42 : 0.1 - gal * 0.04 + d.sleep * 0.12;
    });
    d.blink -= dt; if (d.blink < -0.12) d.blink = 2 + Math.random() * 3;
    if (qStare > 0.5 && q && q.t < q.dur - 0.7) d.blink = Math.max(d.blink, 0.5); // he does not blink. at all.
    const closed = d.blink < 0 || d.sleep > 0.5 || qYawn > 0.4;
    d.eyes.forEach(e => { e.scale.y = closed ? 0.15 : qScratch > 0.5 ? 0.45 : 1; e.scale.x = e.scale.z = 1 + qStare * 0.15; });
    d.tongue.visible = ((sp > 3.5 || d.happy > 0.6) && d.sleep < 0.5 && !d.holding) || qYawn > 0.3;
    if (d.outfitTick) d.outfitTick(dt);
  }

  // ================= PEOPLE =================
  function makePerson(o) {
    const root = new THREE.Group(), body = grp(root); body.scale.setScalar(o.height / 1.75);
    const skinMat = std(o.skin, { roughness: 0.55 });
    const armMat = o.tattoo ? std(0xffffff, { map: tattooTex(hexStr(o.skin)), roughness: 0.55 }) : skinMat;
    if (o.tattoo) armMat.map.repeat.set(1, 1);
    const shirt = o.dress ? null : fabricTex(o.shirt, 3);
    const shirtMat = o.dress ? std(0xffffff, { map: floralTex(), roughness: 0.8, side: THREE.DoubleSide }) : std(0xffffff, { map: shirt.map, normalMap: shirt.normalMap, normalScale: new THREE.Vector2(0.4, 0.4), roughness: 0.82 });
    const denim = o.dress ? null : denimTextures();
    const pantsMat = o.dress ? skinMat : std(0xffffff, { map: denim.map, normalMap: denim.normalMap, normalScale: new THREE.Vector2(0.5, 0.5), roughness: 0.88 });
    const shoeMat = std(o.shoes, { roughness: 0.55 });
    const hair = hairTextures(o.hair);
    const hairMat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, map: hair.map, normalMap: hair.normalMap, roughness: 0.55, sheen: new THREE.Color(o.hair).lerp(new THREE.Color(0xffffff), 0.12) });
    const F = !!o.dress; // proportions differ a little

    const hips = grp(body, [0, 0.95, 0]);
    const legs = [];
    [-1, 1].forEach(s => {
      const hp = grp(hips, [s * (F ? 0.082 : 0.092), 0, 0]);
      mesh(limb(F ? [[0.06, 0.075, 0.08], [0, 0.074, 0.08], [-0.15, 0.064, 0.07], [-0.32, 0.05, 0.056], [-0.44, 0.042, 0.048]] : [[0.06, 0.085, 0.09], [0, 0.084, 0.09], [-0.15, 0.074, 0.08], [-0.32, 0.06, 0.065], [-0.44, 0.052, 0.058]]), pantsMat, hp);
      const kn = grp(hp, [0, -0.44, 0]);
      mesh(limb(F ? [[0.02, 0.042, 0.048], [-0.1, 0.046, 0.054, -0.006], [-0.3, 0.034, 0.038], [-0.42, 0.026, 0.03], [-0.44, 0.02, 0.02]] : [[0.02, 0.052, 0.058], [-0.1, 0.054, 0.062, -0.006], [-0.3, 0.046, 0.05], [-0.4, 0.05, 0.052], [-0.43, 0.05, 0.052]]), pantsMat, kn);
      // shoes: boots for Andy, wedge sandals for Mom
      const shoe = grp(kn, [0, -0.44, 0]);
      if (F) {
        mesh(loft([{ p: [0, -0.025, -0.06], w: 0.035, h: 0.03 }, { p: [0, -0.035, 0.04], w: 0.04, h: 0.018 }, { p: [0, -0.042, 0.13], w: 0.032, h: 0.012 }, { p: [0, -0.044, 0.15], w: 0.01, h: 0.006 }], { seg: 14 }), shoeMat, shoe);
        mesh(loft([{ p: [0, 0.0, -0.05], w: 0.03, h: 0.03 }, { p: [0, -0.01, 0.05], w: 0.034, h: 0.02 }, { p: [0, -0.015, 0.12], w: 0.026, h: 0.012 }], { seg: 12 }), skinMat, shoe);
      } else {
        mesh(limb([[0.1, 0.05, 0.054], [0.0, 0.048, 0.056], [-0.04, 0.05, 0.06]]), shoeMat, shoe);
        mesh(loft([{ p: [0, -0.03, -0.07], w: 0.045, h: 0.035 }, { p: [0, -0.03, 0.02], w: 0.05, h: 0.035 }, { p: [0, -0.035, 0.13], w: 0.045, h: 0.026 }, { p: [0, -0.04, 0.17], w: 0.02, h: 0.012 }], { seg: 16 }), shoeMat, shoe);
        mesh(new THREE.BoxGeometry(0.1, 0.018, 0.25), std(0x2a1f18, { roughness: 0.9 }), shoe, [0, -0.062, 0.05]);
      }
      legs.push({ hp, kn, shoe, s });
    });
    const torso = grp(hips);
    const TS = F
      ? [[-0.1, 0.165, 0.12], [0.0, 0.16, 0.11], [0.12, 0.128, 0.09], [0.24, 0.15, 0.105, 0.012], [0.33, 0.158, 0.105, 0.012], [0.43, 0.168, 0.088], [0.5, 0.15, 0.078], [0.56, 0.07, 0.06]]
      : [[-0.12, 0.19, 0.125], [0.0, 0.182, 0.118], [0.12, 0.168, 0.11], [0.25, 0.178, 0.115], [0.37, 0.192, 0.118], [0.46, 0.2, 0.105], [0.52, 0.16, 0.085], [0.57, 0.065, 0.06]];
    mesh(loft(TS.map(([y, w, d, z = 0]) => ({ p: [0, y, z], w, h: d, n: 2.4 })), { ref: [0, 0, 1], seg: 28 }), F ? skinMat : shirtMat, torso);
    let skirt = null;
    if (F) {
      // bodice, straps and a flared skirt with a wavy hem
      mesh(loft([[0.05, 0.135, 0.096], [0.12, 0.132, 0.094], [0.24, 0.155, 0.112, 0.012], [0.335, 0.162, 0.11, 0.012], [0.35, 0.16, 0.105, 0.012]].map(([y, w, d, z = 0]) => ({ p: [0, y, z], w: w * 1.02, h: d * 1.03, n: 2.4 })), { ref: [0, 0, 1], seg: 28 }), shirtMat, torso);
      [-1, 1].forEach(s => mesh(new THREE.BoxGeometry(0.03, 0.2, 0.008), shirtMat, torso, [s * 0.09, 0.43, 0.088], [-0.12, 0, 0]));
      [-1, 1].forEach(s => mesh(new THREE.BoxGeometry(0.03, 0.2, 0.008), shirtMat, torso, [s * 0.09, 0.43, -0.08], [0.12, 0, 0]));
      const pts = [[0.13, 0.12], [0.155, 0.05], [0.2, -0.1], [0.27, -0.3], [0.33, -0.5], [0.355, -0.585], [0.35, -0.6]].map(([r, y]) => new THREE.Vector2(r, y));
      const sg = new THREE.LatheGeometry(pts, 48);
      const sp = sg.attributes.position;
      for (let i = 0; i < sp.count; i++) { const x = sp.getX(i), y = sp.getY(i), z = sp.getZ(i), a = Math.atan2(z, x), k = Math.max(0, -y - 0.2) * 0.12; sp.setX(i, x * (1 + Math.sin(a * 9) * k) * 1.0); sp.setZ(i, z * (1 + Math.sin(a * 9) * k) * 0.82); }
      sg.computeVertexNormals();
      skirt = mesh(sg, shirtMat, torso);
    } else {
      // collar, placket buttons and pocket
      const collarG = new THREE.TorusGeometry(0.068, 0.012, 8, 30, Math.PI * 1.6);
      mesh(collarG, shirtMat, torso, [0, 0.555, -0.004], [Math.PI / 2 - 0.2, 0, Math.PI / 2 + Math.PI * 0.2]);
      [-1, 1].forEach(s => mesh(new THREE.BoxGeometry(0.05, 0.045, 0.008), shirtMat, torso, [s * 0.03, 0.525, 0.072], [-0.35, s * 0.4, s * 0.55]));
      const btn = std(0xe8eef2, { roughness: 0.3 });
      [0.44, 0.34, 0.24, 0.14, 0.04].forEach(y => mesh(new THREE.CylinderGeometry(0.0065, 0.0065, 0.004, 10), btn, torso, [0, y, (y > 0.3 ? 0.119 : 0.112) + 0.002], [Math.PI / 2, 0, 0]));
      mesh(new THREE.BoxGeometry(0.075, 0.08, 0.006), shirtMat, torso, [0.085, 0.37, 0.118]);
    }
    // neck and head
    mesh(limb(F ? [[0.0, 0.052, 0.054], [-0.08, 0.054, 0.056], [-0.12, 0.06, 0.062]] : [[0.0, 0.058, 0.06], [-0.08, 0.06, 0.062], [-0.12, 0.066, 0.068]]), skinMat, torso, [0, 0.65, 0.0]);
    const head = grp(torso, [0, 0.715, 0.008]); head.rotation.order = 'YXZ'; // turn, then nod
    const hg = SPH.clone(), hp = hg.attributes.position;
    for (let i = 0; i < hp.count; i++) { const y = hp.getY(i); if (y < 0) { hp.setX(i, hp.getX(i) * (1 - 0.3 * Math.pow(-y, 1.4))); hp.setZ(i, hp.getZ(i) * (1 - 0.08 * -y) + (hp.getZ(i) > 0 ? 0.04 * -y : 0)); } }
    hg.computeVertexNormals();
    const R = F ? [0.081, 0.106, 0.096] : [0.085, 0.111, 0.1];
    mesh(hg, skinMat, head, [0, 0, 0], null, R);
    const sz = (x, y) => { const uy = y / R[1], jaw = uy < 0 ? 1 - 0.3 * Math.pow(-uy, 1.4) : 1, ux = x / (R[0] * jaw); return R[2] * Math.sqrt(Math.max(0, 1 - ux * ux - uy * uy)) * (uy < 0 ? 1 - 0.04 * -uy : 1); };
    const fz = sz(0, 0);
    [-1, 1].forEach(s => {
      const ex = s * (F ? 0.032 : 0.034), ey = 0.012, ez = sz(ex, ey);
      const eyeG = grp(head, [ex, ey, ez - 0.004]); eyeG.rotation.y = s * 0.28;
      mesh(SPH, std(0xf6f4f0, { roughness: 0.2 }), eyeG, [0, 0, 0], null, [0.0155, 0.0105, 0.008]);
      mesh(SPH_LO, std(o.iris, { roughness: 0.15 }), eyeG, [0, 0, 0.0062], null, [0.0074, 0.0074, 0.0028]);
      mesh(SPH_LO, std(0x0a0a0a, { roughness: 0.1 }), eyeG, [0, 0, 0.0082], null, [0.0034, 0.0034, 0.0015]);
      mesh(SPH, skinMat, eyeG, [0, 0.0085, -0.001], [0.3, 0, 0], [0.0175, 0.006, 0.0095]);
      const bx = s * 0.036, by = 0.036;
      mesh(new THREE.BoxGeometry(0.034, 0.0065, 0.008), std(o.brow || o.hair, { roughness: 0.8 }), head, [bx, by, sz(bx, by) + 0.001], [0, s * 0.3, s * -0.12]);
      mesh(SPH, skinMat, head, [s * (R[0] + 0.001), 0.0, -0.008], null, [0.011, 0.026, 0.017]);
    });
    mesh(SPH, skinMat, head, [0, -0.016, sz(0, -0.016) + 0.002], [-0.25, 0, 0], [0.012, 0.026, 0.017]);
    const lip = std(0xb8655e, { roughness: 0.45 }), my = F ? -0.05 : -0.053;
    mesh(new THREE.TorusGeometry(0.018, 0.0034, 8, 20, Math.PI), lip, head, [0, my + 0.006, sz(0, my) - 0.003], [0.2, 0, Math.PI]);
    mesh(SPH, lip, head, [0, my - 0.006, sz(0, my - 0.006) - 0.003], null, [0.012, 0.0045, 0.005]);
    if (o.glasses) {
      const gm = std(0x141414, { roughness: 0.25, metalness: 0.2 });
      const gz = sz(0.032, 0.012) + 0.012;
      [-1, 1].forEach(s => { const r = mesh(new THREE.TorusGeometry(0.018, 0.0024, 8, 24), gm, head, [s * 0.033, 0.012, gz]); r.scale.set(1.2, 0.9, 1); r.rotation.y = s * 0.12; mesh(new THREE.BoxGeometry(0.003, 0.004, 0.1), gm, head, [s * (R[0] - 0.002), 0.016, gz - 0.052], [0, s * 0.06, 0]); });
      mesh(new THREE.BoxGeometry(0.022, 0.004, 0.004), gm, head, [0, 0.016, gz + 0.002]);
    }
    // hair
    // hair cap: a sphere shell with the face (and for Andy, the ears and neck) cut away
    const capG = new THREE.SphereGeometry(1, 64, 40), cp = capG.attributes.position, keep = [];
    // Mom: hair pulled back from a centre part. Andy: short and full on top with a front sweep.
    const cut = F ? (x, y, z) => (z > -0.05 && y < 0.6 - Math.abs(x) * 0.45) || y < -0.55 || (Math.abs(x) > 0.55 && y < 0.12 && z > -0.3)
      : (x, y, z) => (z > 0.1 && y < 0.5 - Math.abs(x) * 0.3 + 0.05 * Math.sin(x * 23)) || y < -0.32 || (z > -0.3 && y < 0.14 + 0.04 * Math.sin(z * 19));
    const vol = F ? (x, y, z) => 0.02 + 0.03 * Math.max(0, -z) * Math.max(0, y + 0.3)
      : (x, y, z) => 0.012 + 0.14 * Math.pow(Math.max(0, y), 1.8) + 0.2 * Math.max(0, z) * Math.max(0, y - 0.25) * (1 + 0.6 * x) + 0.008 * Math.sin(x * 31 + z * 17);
    const ci = capG.index.array;
    for (let i = 0; i < ci.length; i += 3) { if (![ci[i], ci[i + 1], ci[i + 2]].some(v => cut(cp.getX(v), cp.getY(v), cp.getZ(v)))) keep.push(ci[i], ci[i + 1], ci[i + 2]); }
    capG.setIndex(keep);
    for (let i = 0; i < cp.count; i++) { const x = cp.getX(i), y = cp.getY(i), z = cp.getZ(i), k = 1 + vol(x, y, z); cp.setXYZ(i, x * k, y * k, z * k); }
    capG.computeVertexNormals();
    const capM = hairMat.clone(); capM.side = THREE.DoubleSide;
    mesh(capG, capM, head, [0, 0.004, -0.004], null, [R[0] * 1.05, R[1] * 1.04, R[2] * 1.05]);
    if (F) {
      // centre part, then two long braids over the shoulders
      mesh(SPH, hairMat, head, [0, -0.04, -0.06], null, [0.085, 0.07, 0.06]);
      [-1, 1].forEach(s => {
        const path = new THREE.CatmullRomCurve3([[s * 0.075, 0.665, -0.055], [s * 0.12, 0.57, -0.01], [s * 0.135, 0.5, 0.06], [s * 0.12, 0.38, 0.128], [s * 0.105, 0.25, 0.134]].map(p => new V3(p[0], p[1], p[2])));
        const N = 15;
        for (let i = 0; i < N; i++) {
          const t = i / (N - 1), p = path.getPointAt(t), tg = path.getTangentAt(t), taper = 1 - t * 0.35;
          const lobe = mesh(SPH, hairMat, torso, [p.x, p.y, p.z], null, [0.024 * taper, 0.034, 0.02 * taper]);
          lobe.quaternion.setFromUnitVectors(new V3(0, 1, 0), tg); lobe.rotateY(i % 2 ? 0.55 : -0.55); lobe.rotateZ(i % 2 ? 0.35 : -0.35);
        }
        const e = path.getPointAt(1);
        mesh(new THREE.TorusGeometry(0.014, 0.005, 6, 14), std(0x2a2a2a, { roughness: 0.6 }), torso, [e.x, e.y - 0.025, e.z], [Math.PI / 2, 0, 0]);
        mesh(new THREE.ConeGeometry(0.022, 0.07, 10, 1, true), hairMat, torso, [e.x, e.y - 0.065, e.z], [Math.PI, 0, 0]);
      });
    } else {

    }
    // arms
    const arms = [];
    [-1, 1].forEach(s => {
      const sh = grp(torso, [s * (F ? 0.165 : 0.196), 0.46, 0]);
      sh.userData.restZ = s * 0.07; sh.rotation.z = sh.userData.restZ;
      mesh(SPH, F ? armMat : shirtMat, sh, [0, 0.0, 0], null, [F ? 0.04 : 0.054, F ? 0.046 : 0.05, F ? 0.042 : 0.056]);
      mesh(limb(F ? [[0.02, 0.04, 0.042], [-0.12, 0.038, 0.04], [-0.28, 0.031, 0.033]] : [[0.02, 0.05, 0.052], [-0.12, 0.048, 0.05], [-0.28, 0.038, 0.04]]), F ? armMat : skinMat, sh);
      if (!F) mesh(limb([[0.04, 0.054, 0.056], [-0.05, 0.054, 0.054], [-0.13, 0.05, 0.049], [-0.145, 0.048, 0.047]]), shirtMat, sh);
      const el = grp(sh, [0, -0.28, 0]);
      mesh(limb(F ? [[0.01, 0.031, 0.033], [-0.08, 0.032, 0.033], [-0.25, 0.022, 0.025]] : [[0.01, 0.038, 0.04], [-0.08, 0.04, 0.04], [-0.25, 0.028, 0.03]]), F ? armMat : skinMat, el);
      const hand = grp(el, [0, -0.255, 0]);
      mesh(loft([{ p: [0, 0.01, 0], w: 0.024, h: 0.012 }, { p: [0, -0.03, 0.003], w: 0.03, h: 0.013 }, { p: [0, -0.075, 0.006], w: 0.026, h: 0.011 }, { p: [0, -0.095, 0.004], w: 0.012, h: 0.007 }], { ref: [0, 0, 1], seg: 12 }), skinMat, hand);
      mesh(SPH, skinMat, hand, [s * -0.02, -0.03, 0.014], [0, 0, s * 0.5], [0.009, 0.026, 0.009]);
      arms.push({ sh, el, hand, s });
    });
    root.userData.height = o.height;
    mergeStatic(root);
    return { root, body, hips, torso, head, legs, arms, skirt, phase: 0, speed: 0, t: Math.random() * 5, wave: 0, sit: 0, sitGround: 0, throwT: -1, aim: 0, recoil: 0, lookUp: 0 };
  }
  function animatePerson(p, dt) {
    p.t += dt;
    const k = (p.root.userData.height || 1.75) / 1.75, sp = p.speed, an = Math.max(sp, p.turnSpd || 0); // turning on the spot still takes small steps
    const moving = Math.min(1, an / 0.9), run = Math.max(0, Math.min(1, (sp - 2.5) / 2));
    const sit = p.sit, sg = p.sitGround || 0, aim = p.aim || 0, still = (1 - moving) * (1 - sit) * (1 - sg);
    // the stride grows with speed and the cycle is driven by distance covered, so feet stay planted instead of skating
    const amp = Math.min(0.62, 0.16 + an * 0.17 + run * 0.12), step = 2 * 0.88 * k * Math.sin(amp) * 0.92 * (1 + run * 0.5);
    if (an > 0.02) p.phase += an * dt / Math.max(0.12, step) * Math.PI;
    // idle: a slow weight shift from foot to foot, and breathing
    const shift = Math.sin(p.t * 0.45) * 0.022 * still, breath = Math.sin(p.t * 1.7);
    p.legs.forEach(L => {
      const ph = p.phase + (L.s > 0 ? Math.PI : 0);
      let h = -Math.sin(ph) * amp * moving;
      let kn = (Math.max(0, Math.cos(ph)) * (0.5 + amp * 0.7 + run * 0.7) + Math.max(0, -Math.cos(ph)) * 0.08) * moving;
      h = lerp(h, -1.5, sit); kn = lerp(kn, 1.5, sit);
      // sitting on the ground (picnic blanket): legs out in front, knees nearly straight
      if (sg > 0) { h = lerp(h, -1.42 + (L.s > 0 ? 0.04 : -0.02), sg); kn = lerp(kn, 0.06, sg); }
      L.hp.rotation.x = h; L.kn.rotation.x = kn;
      L.shoe.rotation.x = lerp(lerp(-(h + kn) * 0.85, 0, sit), 0.15, sg); // keep the foot flat while it's on the ground
      L.hp.rotation.z = sg * L.s * 0.08 - shift * 1.3;
    });
    // sitting on the blanket she shifts between hands in her lap and leaning back on her hands
    const lean = sg * Math.max(0, Math.min(1, 0.5 + Math.sin(p.t * 0.32 + 1) * 1.4));
    p.arms.forEach(A => {
      const ph = p.phase + (A.s > 0 ? 0 : Math.PI);
      let x = -Math.sin(ph) * (0.1 + amp * 0.55 + run * 0.35) * moving + Math.sin(p.t * 0.9 + A.s) * 0.025 * still;
      let e = -0.14 - 0.12 * moving - run * 0.95 * moving - breath * 0.015 * still, z = A.sh.userData.restZ + A.s * run * 0.08;
      if (A.s > 0 && p.wave > 0) { x = lerp(x, -2.75, p.wave); z = lerp(z, 0.25 + Math.sin(p.t * 10) * 0.3, p.wave); e = lerp(e, -0.35, p.wave); }
      if (A.s > 0 && p.throwT >= 0) { const t = p.throwT; x = t < 0.5 ? lerp(0, -2.6, t * 2) : lerp(-2.6, 0.6, (t - 0.5) * 2); }
      if (sit > 0 && !(A.s > 0 && p.wave > 0)) { x = lerp(x, -0.55, sit); e = lerp(e, -0.6, sit); }
      if (sg > 0 && !(A.s > 0 && (p.wave > 0 || p.throwT >= 0))) {
        const lx = lerp(-0.62 + Math.sin(p.t * 0.7 + A.s) * 0.05, 0.62, lean), lz = lerp(A.s * 0.12, A.s * 0.3, lean), le = lerp(-0.85 + Math.sin(p.t * 0.5 + A.s * 2) * 0.08, -0.06, lean);
        x = lerp(x, lx, sg); z = lerp(z, lz, sg); e = lerp(e, le, sg);
      }
      A.sh.rotation.set(x, 0, z); A.el.rotation.set(e, 0, 0);
    });
    // a walking body rises over each planted leg and dips between steps
    const drop = 0.88 * (1 - Math.cos(amp * Math.sin(p.phase))) * moving * 0.7;
    p.hips.position.set(shift, lerp(lerp(0.95 - drop + run * Math.abs(Math.sin(p.phase)) * 0.03, 0.5, sit), 0.13, sg), 0);
    p.hips.rotation.y = -Math.sin(p.phase) * 0.08 * moving;
    p.torso.rotation.x = run * 0.15 + moving * 0.03 - sit * 0.08 - sg * 0.06 - lean * 0.2 + breath * 0.008 - (p.lookUp || 0) * 0.15 * aim - (p.recoil || 0) * 0.06;
    // shouldering the gun blades the body: left shoulder forward, head turned back to the target
    p.torso.rotation.y = Math.sin(p.phase) * 0.14 * moving - 0.85 * aim;
    p.torso.rotation.z = shift * 1.4;
    p.head.rotation.y = (p.headYaw || 0) * (1 - aim) + Math.sin(p.t * 0.5) * 0.12 * still * (1 - aim) + 0.85 * aim;
    p.head.rotation.x = -(p.lookUp || 0) * 0.8 + 0.12 * aim + lean * 0.16 + (p.headPitch || 0) * (1 - aim);
    if (p.skirt) p.skirt.rotation.z = Math.sin(p.phase) * 0.04 * moving;
  }
  // two-bone arm IK: moves arm A so its wrist reaches a world point (weight blends from the current pose);
  // the elbow swings toward the hint direction (torso space)
  function reachArm(p, A, world, hint, weight = 1) {
    if (weight <= 0) return;
    const tgt = A.hand.getWorldPosition(new V3()).lerp(world, Math.min(1, weight));
    const T = p.torso.worldToLocal(tgt).sub(A.sh.position);
    const a = 0.28, b = 0.255, d = Math.min(a + b - 0.002, Math.max(0.06, T.length()));
    const bend = Math.PI - Math.acos(Math.max(-1, Math.min(1, (a * a + b * b - d * d) / (2 * a * b))));
    const Tn = T.normalize(), q = new THREE.Quaternion().setFromUnitVectors(new V3(0, -a - b * Math.cos(bend), b * Math.sin(bend)).normalize(), Tn);
    const E = new V3(0, -1, 0).applyQuaternion(q), H = hint.clone();
    E.addScaledVector(Tn, -E.dot(Tn)); H.addScaledVector(Tn, -H.dot(Tn));
    if (E.lengthSq() > 1e-6 && H.lengthSq() > 1e-6) q.premultiply(new THREE.Quaternion().setFromAxisAngle(Tn, Math.atan2(new V3().crossVectors(E, H).dot(Tn), E.dot(H))));
    A.sh.quaternion.copy(q); A.el.rotation.set(-bend, 0, 0);
    A.sh.updateMatrixWorld(true);
  }
  // Andy's shotgun (a child of his torso): carried in the right hand, or shouldered with the stock
  // in the shoulder pocket, the barrel along his line of sight and both hands on the gun
  const GUN_OFF = new THREE.Matrix4().makeTranslation(0, -0.04, 0.02);
  function holdGun(p, gun, aim) {
    p.root.updateMatrixWorld(true);
    const R = p.arms[0], Lf = p.arms[1];
    const carry = new THREE.Matrix4().copy(p.torso.matrixWorld).invert().multiply(R.hand.matrixWorld).multiply(GUN_OFF);
    const lu = (p.lookUp || 0) + (p.recoil || 0) * 0.12;
    // aim direction in hips space (straight ahead, pitched up), then into the turned torso's space
    const toTorso = new THREE.Quaternion().setFromEuler(p.torso.rotation).invert();
    const D = new V3(0, Math.sin(lu), Math.cos(lu)).applyQuaternion(toTorso), U = new V3(0, Math.cos(lu), -Math.sin(lu)).applyQuaternion(toTorso);
    const butt = new V3(-0.1, 0.57, 0.12).addScaledVector(D, -(p.recoil || 0) * 0.04); // right side of the chest
    const origin = butt.clone().addScaledVector(D, 0.345).addScaledVector(U, 0.05); // the grip sits 0.345 m up the stock
    const Yg = D.clone().negate(), shoulder = new THREE.Matrix4().makeBasis(new V3().crossVectors(Yg, U), Yg, U).setPosition(origin);
    const pc = new V3(), qc = new THREE.Quaternion(), sc = new V3(), pa = new V3(), qa = new THREE.Quaternion();
    carry.decompose(pc, qc, sc); shoulder.decompose(pa, qa, sc);
    gun.position.copy(pc.lerp(pa, aim)); gun.quaternion.copy(qc.slerp(qa, aim)); gun.scale.setScalar(1);
    gun.updateMatrixWorld(true);
    if (aim > 0.01) {
      reachArm(p, R, gun.localToWorld(new V3(0, 0.05, -0.03)), new V3(-1, -0.6, -0.3), aim); // trigger hand on the grip, elbow out
      reachArm(p, Lf, gun.localToWorld(new V3(0, -0.2, -0.06)), new V3(0.4, -1, 0), aim);   // other hand under the fore-end
    }
  }

  // ================= SMALL PROPS =================
  function makeTreat() {
    const g = new THREE.Group();
    const m = new THREE.MeshPhysicalMaterial({ color: 0xd9a865, roughness: 0.55, emissive: 0x5a3a10, emissiveIntensity: 0.35, clearcoat: 0.2 });
    mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.3, 16), m, g, [0, 0, 0], [0, 0, Math.PI / 2]);
    [[-0.15, 0.04], [-0.15, -0.04], [0.15, 0.04], [0.15, -0.04]].forEach(([x, y]) => mesh(SPH, m, g, [x, y, 0], null, [0.058, 0.058, 0.058]));
    return g;
  }
  function makeSquirrel() {
    const g = new THREE.Group(), fur = furTextures(0x8a7f74), m = std(0xffffff, { map: fur.map, normalMap: fur.normalMap, roughness: 0.85 }), lm = std(0xe2d8ca);
    mesh(loft([{ p: [0, 0.1, -0.1], w: 0.02, h: 0.02 }, { p: [0, 0.12, -0.06], w: 0.065, h: 0.07 }, { p: [0, 0.13, 0.03], w: 0.055, h: 0.06 }, { p: [0, 0.16, 0.09], w: 0.035, h: 0.04 }, { p: [0, 0.17, 0.11], w: 0.01, h: 0.01 }]), m, g);
    mesh(SPH, lm, g, [0, 0.1, 0.02], null, [0.045, 0.05, 0.06]);
    mesh(SPH, m, g, [0, 0.2, 0.12], null, [0.045, 0.045, 0.055]);
    [-1, 1].forEach(s => { mesh(SPH_LO, m, g, [s * 0.025, 0.25, 0.11], null, [0.012, 0.025, 0.008]); mesh(SPH_LO, std(0x080808, { roughness: 0.1 }), g, [s * 0.027, 0.21, 0.155], null, [0.009, 0.009, 0.006]); });
    const tail = grp(g, [0, 0.12, -0.1]);
    mesh(loft([{ p: [0, 0, 0], w: 0.03, h: 0.03 }, { p: [0, 0.08, -0.06], w: 0.06, h: 0.05 }, { p: [0, 0.2, -0.05], w: 0.065, h: 0.05 }, { p: [0, 0.28, 0.0], w: 0.04, h: 0.035 }, { p: [0, 0.3, 0.02], w: 0.01, h: 0.01 }], { ref: [0, 0, 1] }), m, tail);
    mergeStatic(g);
    return { root: g, tail };
  }
  function makeBall() {
    const tex = canvasTex(128, 64, (g, w, h) => { g.fillStyle = '#d4e83a'; g.fillRect(0, 0, w, h); for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(255,255,200,${Math.random() * 0.25})`; g.fillRect(Math.random() * w, Math.random() * h, 1, 1); } g.strokeStyle = '#f7f7ee'; g.lineWidth = 5; g.beginPath(); for (let x = 0; x <= w; x++) { const y = h / 2 + Math.sin(x / w * Math.PI * 4) * h * 0.28; x ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke(); });
    return mesh(new THREE.SphereGeometry(0.075, 24, 16), std(0xffffff, { map: tex, roughness: 0.95, emissive: 0x2a3500, emissiveIntensity: 0.4 }));
  }


  // ================= DUCKS, GULLS AND PROPS =================
  // kind: 'mallard' (drake), 'hen' or 'gull'. Wings are pivots so they can fold or flap.
  function makeDuck(kind = 'mallard') {
    const C = {
      mallard: { body: 0xa3a197, back: 0x6f6a5e, chest: 0x6a3624, head: 0x175c3a, bill: 0xd8b13a, wing: 0x8a867a, tail: 0x1e1e1e, span: 1 },
      hen: { body: 0x8d6c49, back: 0x6b5034, chest: 0x80603f, head: 0x7c6045, bill: 0xc8873a, wing: 0x725538, tail: 0x5a4430, span: 1 },
      gull: { body: 0xf3f4f5, back: 0xb7bfc8, chest: 0xf6f7f8, head: 0xf8f9fa, bill: 0xf0c330, wing: 0xaab2bb, tail: 0x2a2a2a, span: 1.7 },
    }[kind];
    const fm = hex => std(hex, { roughness: 0.8 });
    const root = new THREE.Group(), body = grp(root, [0, 0.1, 0]);
    mesh(loft([{ p: [0, 0.0, -0.22], w: 0.015, h: 0.015 }, { p: [0, 0.01, -0.17], w: 0.07, h: 0.05 }, { p: [0, 0.015, -0.05], w: 0.11, h: 0.085 }, { p: [0, 0.02, 0.07], w: 0.11, h: 0.09 }, { p: [0, 0.04, 0.15], w: 0.075, h: 0.07 }, { p: [0, 0.06, 0.19], w: 0.02, h: 0.02 }], { seg: 20 }), fm(C.body), body);
    mesh(SPH, fm(C.back), body, [0, 0.055, -0.04], null, [0.085, 0.04, 0.14]);
    mesh(SPH, fm(C.chest), body, [0, 0.015, 0.11], null, [0.085, 0.08, 0.075]);
    mesh(new THREE.ConeGeometry(0.035, 0.08, 10), fm(C.tail), body, [0, 0.035, -0.24], [-Math.PI / 2 - 0.4, 0, 0]);
    const head = grp(body, [0, 0.14, 0.16]);
    mesh(limb([[0.0, 0.032, 0.034], [-0.07, 0.04, 0.042], [-0.1, 0.05, 0.05]]), fm(C.head), head, [0, 0, -0.01], [0.25, 0, 0]);
    mesh(SPH, fm(C.head), head, [0, 0.01, 0.005], null, [0.045, 0.05, 0.058]);
    if (kind === 'mallard') mesh(new THREE.TorusGeometry(0.036, 0.006, 6, 20), fm(0xf4f4f0), head, [0, -0.07, -0.012], [Math.PI / 2 - 0.25, 0, 0]);
    mesh(SPH, fm(C.bill), head, [0, -0.004, 0.07], [0.1, 0, 0], [0.024, 0.01, 0.042]);
    [-1, 1].forEach(s => mesh(SPH_LO, std(0x080808, { roughness: 0.2 }), head, [s * 0.036, 0.02, 0.025], null, [0.007, 0.007, 0.007]));
    const wings = [-1, 1].map(s => {
      const pv = grp(body, [s * 0.085, 0.06, 0.03]);
      const w = mesh(SPH, fm(C.wing), pv, [s * 0.13 * C.span, 0, -0.03], null, [0.14 * C.span, 0.012, 0.07]);
      if (kind === 'gull') mesh(SPH, fm(0x1e1e1e), pv, [s * 0.25 * C.span, 0, -0.05], null, [0.05 * C.span, 0.011, 0.04]);
      pv.userData.side = s; void w; return pv;
    });
    [-1, 1].forEach(s => mesh(SPH_LO, fm(0xe0782a), body, [s * 0.04, -0.07, 0.0], null, [0.02, 0.006, 0.035]));
    mergeStatic(root);
    return { root, body, head, wings, kind, t: Math.random() * 10 };
  }
  // mode: 'fly', 'float', 'stand', 'limp' (carried)
  function animateDuck(d, dt, mode) {
    d.t += dt;
    d.wings.forEach(w => {
      const s = w.userData.side;
      if (mode === 'fly') { w.rotation.set(0, 0, s * Math.sin(d.t * (d.kind === 'gull' ? 9 : 15)) * 0.85); }
      else { w.rotation.set(0, s * 1.25, s * -0.12); }
    });
    d.body.rotation.x = mode === 'fly' ? -0.1 : 0;
    d.body.position.y = 0.1 + (mode === 'float' ? Math.sin(d.t * 2.2) * 0.012 : mode === 'stand' ? Math.abs(Math.sin(d.t * 8)) * 0.01 : 0);
    d.head.rotation.x = mode === 'limp' ? 1.1 : mode === 'stand' ? Math.max(0, Math.sin(d.t * 3)) * 0.6 : 0;
    d.head.rotation.y = mode === 'float' ? Math.sin(d.t * 0.8) * 0.5 : 0;
  }
  function makeShotgun() {
    const g = new THREE.Group(), steel = std(0x2a2c30, { metalness: 0.85, roughness: 0.35 }), wood = std(0x6b4024, { roughness: 0.55 });
    // built along -y from the grip so it points where the arm points
    mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.72, 10), steel, g, [0, -0.42, 0.02]);
    mesh(new THREE.BoxGeometry(0.035, 0.16, 0.05), steel, g, [0, -0.02, 0.015]);
    mesh(new THREE.BoxGeometry(0.03, 0.2, 0.035), wood, g, [0, -0.2, 0.0]);
    mesh(loft([{ p: [0, 0.06, 0], w: 0.018, h: 0.025 }, { p: [0, 0.2, -0.02], w: 0.02, h: 0.045 }, { p: [0, 0.34, -0.05], w: 0.022, h: 0.06 }, { p: [0, 0.35, -0.05], w: 0.012, h: 0.04 }], { seg: 10 }), wood, g);
    return g;
  }
  function makeCap(hex) {
    const camo = canvasTex(128, 128, (g, w, h) => { g.fillStyle = hexStr(hex); g.fillRect(0, 0, w, h); ['#4b5a32', '#6b5a3a', '#2f3a24', '#8a8058'].forEach(c => { for (let i = 0; i < 9; i++) { g.fillStyle = c; g.beginPath(); g.ellipse(rnd(0, w), rnd(0, h), rnd(6, 18), rnd(4, 10), rnd(0, 3), 0, 7); g.fill(); } }); });
    const m = std(0xffffff, { map: camo, roughness: 0.9 });
    const cap = new THREE.Group();
    mesh(new THREE.SphereGeometry(0.1, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), m, cap, [0, 0, 0], null, [0.97, 0.8, 1.05]);
    mesh(new THREE.CylinderGeometry(0.075, 0.08, 0.008, 24, 1, false, -Math.PI / 2, Math.PI), m, cap, [0, 0.004, 0.08], [0.12, 0, 0], [1, 1, 0.9]);
    return cap;
  }
  function makeFrisbee() {
    const pts = [[0, 0.012], [0.08, 0.014], [0.115, 0.01], [0.125, 0.0], [0.122, -0.012], [0.112, -0.012], [0.11, 0.0], [0.08, 0.004], [0, 0.003]].map(([x, y]) => new THREE.Vector2(x, y));
    return mesh(new THREE.LatheGeometry(pts.reverse(), 32), std(0xff6a1f, { roughness: 0.4, side: THREE.DoubleSide }));
  }
  // picnic blanket, basket and five foods (each food is its own group so a thief can carry it off)
  function makePicnic() {
    const root = new THREE.Group();
    const gingham = canvasTex(256, 256, (g, w, h) => { g.fillStyle = '#fbf7f2'; g.fillRect(0, 0, w, h); g.fillStyle = 'rgba(205,40,48,0.55)'; for (let i = 0; i < w; i += 32) { g.fillRect(i, 0, 16, h); g.fillRect(0, i, w, 16); } for (let i = 0; i < 2500; i++) { g.fillStyle = `rgba(0,0,0,${Math.random() * 0.06})`; g.fillRect(Math.random() * w, Math.random() * h, 2, 1); } }, [3, 3]);
    mesh(new THREE.BoxGeometry(2.6, 0.02, 2.1), std(0xffffff, { map: gingham, roughness: 0.95 }), root, [0, 0.01, 0]);
    const weave = canvasTex(128, 128, (g, w, h) => { g.fillStyle = '#a8773f'; g.fillRect(0, 0, w, h); for (let y = 0; y < h; y += 8) for (let x = (y / 8 % 2) * 8; x < w; x += 16) { g.fillStyle = '#c99a5a'; g.fillRect(x, y, 8, 7); } }, [3, 2]);
    const basket = grp(root, [-0.85, 0, 0.6]);
    mesh(new THREE.BoxGeometry(0.55, 0.32, 0.38), std(0xffffff, { map: weave, roughness: 0.9 }), basket, [0, 0.16, 0]);
    mesh(new THREE.TorusGeometry(0.2, 0.015, 8, 24, Math.PI), std(0x8a5a2a), basket, [0, 0.32, 0]);
    const foods = [];
    const food = (x, z, build) => { const g = grp(root, [x, 0.02, z]); build(g); foods.push(g); return g; };
    food(0.3, -0.2, g => { mesh(new THREE.BoxGeometry(0.16, 0.025, 0.16), std(0xe8c88a), g, [0, 0.02, 0]); mesh(new THREE.BoxGeometry(0.17, 0.012, 0.17), std(0x6fbf4a), g, [0, 0.04, 0]); mesh(new THREE.BoxGeometry(0.16, 0.015, 0.16), std(0xd9675a), g, [0, 0.052, 0]); mesh(new THREE.BoxGeometry(0.16, 0.025, 0.16), std(0xe8c88a), g, [0, 0.072, 0]); });
    food(-0.3, -0.35, g => { mesh(new THREE.SphereGeometry(0.05, 20, 14), std(0xc8202a, { roughness: 0.35 }), g, [0, 0.05, 0]); mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.03, 6), std(0x5a3a1a), g, [0, 0.1, 0]); });
    food(0.65, 0.3, g => { const sh = new THREE.Shape(); sh.moveTo(-0.11, 0); sh.absarc(0, 0, 0.11, Math.PI, 0, true); sh.lineTo(-0.11, 0); const wg = new THREE.ExtrudeGeometry(sh, { depth: 0.04, bevelEnabled: false }); mesh(wg, std(0xf05a5a, { roughness: 0.6 }), g, [0, 0.1, 0], [Math.PI, 0, 0]); mesh(new THREE.TorusGeometry(0.11, 0.012, 6, 20, Math.PI), std(0x3a8a3a), g, [0, 0.1, -0.02], [Math.PI, 0, 0]); });
    food(0.05, 0.4, g => { mesh(new THREE.CylinderGeometry(0.04, 0.032, 0.05, 16), std(0xf2a7c3), g, [0, 0.025, 0]); mesh(new THREE.SphereGeometry(0.045, 16, 10), std(0xfaf3ea, { roughness: 0.5 }), g, [0, 0.065, 0], null, [1, 0.8, 1]); mesh(new THREE.SphereGeometry(0.012, 8, 6), std(0xd0102a), g, [0, 0.1, 0]); });
    food(-0.55, -0.05, g => { const sh = new THREE.Shape(); sh.moveTo(0, 0); sh.lineTo(0.14, 0.04); sh.lineTo(0.14, -0.04); sh.lineTo(0, 0); const cg = new THREE.ExtrudeGeometry(sh, { depth: 0.06, bevelEnabled: false }); mesh(cg, std(0xf2c74a, { roughness: 0.5 }), g, [0, 0.0, 0], [-Math.PI / 2, 0, 0]); });
    mergeStatic(root);
    return { root, foods, basket };
  }

  return {
    makeDuck, animateDuck, makeShotgun, makeCap, makeFrisbee, makePicnic, mergeStatic,
    makeDog, animateDog, startQuirk, makePerson, animatePerson, reachArm, holdGun, makeTreat, makeSquirrel, makeBall, floralTex, denimTex, canvasTex, canvas, toTex, normalFrom, std, mesh, grp, loft, strapRing, fabricTex, SPH, SPH_LO,
    setAnisotropy(a) { maxAniso = a; },
  };
})();
