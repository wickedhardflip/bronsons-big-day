// Character models built from primitives, with procedural animation.
// Treat every hex color as sRGB so the scene matches the palette under sRGB output.
(function () { const o = THREE.Color.prototype.setHex; THREE.Color.prototype.setHex = function (h) { o.call(this, h); return this.convertSRGBToLinear(); }; })();
const hexStr = h => '#' + (h >>> 0).toString(16).padStart(6, '0');

const Models = (() => {
  const V3 = THREE.Vector3;
  const std = (color, o = {}) => new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.75, metalness: 0 }, o));

  function canvasTex(w, h, draw, repeat) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c);
    t.encoding = THREE.sRGBEncoding; t.anisotropy = 4;
    if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
    return t;
  }
  // short-hair coat: base color with soft streaks
  function furTex(hex) {
    return canvasTex(256, 256, (g, w, h) => {
      const c = new THREE.Color().setRGB(((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255);
      g.fillStyle = hexStr(hex); g.fillRect(0, 0, w, h);
      for (let i = 0; i < 2600; i++) {
        const k = 0.82 + Math.random() * 0.36;
        g.strokeStyle = `rgba(${Math.min(255, c.r * 255 * k) | 0},${Math.min(255, c.g * 255 * k) | 0},${Math.min(255, c.b * 255 * k) | 0},0.55)`;
        g.lineWidth = 1 + Math.random();
        const x = Math.random() * w, y = Math.random() * h;
        g.beginPath(); g.moveTo(x, y); g.lineTo(x + (Math.random() - 0.5) * 3, y + 4 + Math.random() * 5); g.stroke();
      }
    }, [2, 2]);
  }
  const floralTex = () => canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = '#f4f6fb'; g.fillRect(0, 0, w, h);
    const blues = ['#3d6fb8', '#6b93cf', '#2c5597', '#8fb0dd'];
    for (let i = 0; i < 90; i++) {
      const x = Math.random() * w, y = Math.random() * h, r = 6 + Math.random() * 12;
      g.fillStyle = blues[i % 4];
      for (let p = 0; p < 5; p++) {
        const a = p / 5 * Math.PI * 2 + i;
        g.beginPath(); g.ellipse(x + Math.cos(a) * r * 0.7, y + Math.sin(a) * r * 0.7, r * 0.55, r * 0.32, a, 0, Math.PI * 2); g.fill();
      }
      g.fillStyle = '#dfe8f6'; g.beginPath(); g.arc(x, y, r * 0.25, 0, 7); g.fill();
      g.strokeStyle = '#6f8fb8'; g.lineWidth = 2; g.beginPath(); g.moveTo(x + r, y); g.quadraticCurveTo(x + r * 2, y + r, x + r * 2.4, y - r * 0.4); g.stroke();
    }
  }, [2, 2]);
  const tattooTex = skin => canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = skin; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(40,44,52,0.85)'; g.lineWidth = 2.5;
    for (let i = 0; i < 9; i++) {
      const x = 20 + Math.random() * (w - 40), y = 20 + Math.random() * (h - 40), r = 10 + Math.random() * 16;
      if (i % 3 === 0) { // rose
        for (let k = 0; k < 4; k++) { g.beginPath(); g.arc(x, y, r * (0.3 + k * 0.22), k, k + 4.5); g.stroke(); }
      } else if (i % 3 === 1) { // butterfly
        g.beginPath(); g.ellipse(x - r * 0.5, y, r * 0.5, r * 0.8, -0.4, 0, 7); g.stroke();
        g.beginPath(); g.ellipse(x + r * 0.5, y, r * 0.5, r * 0.8, 0.4, 0, 7); g.stroke();
      } else { // vine
        g.beginPath(); g.moveTo(x, y - r * 2); g.bezierCurveTo(x + r, y - r, x - r, y + r, x, y + r * 2); g.stroke();
        for (let k = -1; k <= 1; k++) { g.beginPath(); g.ellipse(x + 6, y + k * r, 7, 3, 0.6, 0, 7); g.stroke(); }
      }
    }
  });
  const denimTex = () => canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = '#1f2c44'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 1400; i++) { g.fillStyle = Math.random() < 0.5 ? 'rgba(70,90,130,0.35)' : 'rgba(10,15,30,0.35)'; g.fillRect(Math.random() * w, Math.random() * h, 1, 2); }
  }, [3, 3]);

  function mesh(geo, mat, parent, pos, rot, scale) {
    const m = new THREE.Mesh(geo, mat); m.castShadow = true; m.receiveShadow = true;
    if (pos) m.position.set(pos[0], pos[1], pos[2]);
    if (rot) m.rotation.set(rot[0], rot[1], rot[2]);
    if (scale) m.scale.set(scale[0], scale[1], scale[2]);
    if (parent) parent.add(m); return m;
  }
  const grp = (parent, pos) => { const g = new THREE.Group(); if (pos) g.position.set(pos[0], pos[1], pos[2]); if (parent) parent.add(g); return g; };

  const SPH = new THREE.SphereGeometry(1, 24, 18);
  const SPH_LO = new THREE.SphereGeometry(1, 12, 10);
  const cyl = (rt, rb, h, seg = 12) => { const g = new THREE.CylinderGeometry(rt, rb, h, seg); g.translate(0, -h / 2, 0); return g; }; // hangs down from pivot

  // ================= DOG =================
  function makeDog(opt) {
    const o = Object.assign({ coat: 0x6f3519, size: 1, collar: 0xf2c418, harness: 0x1f55d6, ears: 'floppy', nose: 0x3b2320, eye: 0xb7792a, belly: null }, opt);
    const coatMat = std(0xffffff, { map: furTex(o.coat), roughness: 0.82 });
    const darkMat = std(new THREE.Color(o.coat).multiplyScalar(0.7), { roughness: 0.85 });
    const noseMat = std(o.nose, { roughness: 0.35 });
    const eyeMat = std(o.eye, { roughness: 0.15, emissive: new THREE.Color(o.eye).multiplyScalar(0.15) });
    const pupilMat = std(0x111111, { roughness: 0.1 });
    const collarMat = std(o.collar, { roughness: 0.5 });
    const root = new THREE.Group();
    const body = grp(root, [0, 0.56, 0]); // torso pivot
    mesh(SPH, coatMat, body, [0, 0, -0.02], null, [0.18, 0.19, 0.46]);       // barrel
    mesh(SPH, coatMat, body, [0, 0.03, 0.24], null, [0.2, 0.22, 0.24]);      // chest
    mesh(SPH, coatMat, body, [0, 0.02, -0.28], null, [0.18, 0.18, 0.2]);     // hips
    mesh(SPH, o.belly ? std(o.belly) : coatMat, body, [0, -0.08, 0.05], null, [0.14, 0.12, 0.34]); // belly tuck
    // neck + head
    const neck = grp(body, [0, 0.1, 0.32]);
    mesh(new THREE.CylinderGeometry(0.095, 0.13, 0.32, 14), coatMat, neck, [0, 0.1, 0.06], [0.75, 0, 0]);
    const head = grp(neck, [0, 0.26, 0.15]);
    mesh(SPH, coatMat, head, [0, 0, 0], null, [0.125, 0.12, 0.14]);          // skull
    mesh(SPH, coatMat, head, [0, 0.055, 0.02], null, [0.1, 0.06, 0.12]);      // brow/forehead
    const snout = mesh(new THREE.CylinderGeometry(0.058, 0.082, 0.2, 16), coatMat, head, [0, -0.035, 0.15], [Math.PI / 2 + 0.12, 0, 0]);
    snout.scale.set(1, 1, 0.9);
    mesh(SPH, coatMat, head, [0, -0.07, 0.13], null, [0.07, 0.04, 0.09]);     // jaw
    mesh(SPH, noseMat, head, [0, -0.02, 0.255], null, [0.04, 0.03, 0.03]);    // nose
    const eyes = [];
    [-1, 1].forEach(s => {
      const e = grp(head, [s * 0.065, 0.025, 0.1]);
      mesh(SPH, eyeMat, e, [0, 0, 0], null, [0.024, 0.024, 0.02]);
      mesh(SPH, pupilMat, e, [s * 0.004, 0, 0.014], null, [0.012, 0.012, 0.008]);
      mesh(SPH, darkMat, e, [0, 0.022, 0.0], null, [0.03, 0.008, 0.024]);     // lid/brow
      eyes.push(e);
    });
    const tongue = mesh(SPH, std(0xd9667a, { roughness: 0.4 }), head, [0, -0.08, 0.2], null, [0.03, 0.008, 0.05]);
    tongue.visible = false;
    const ears = [];
    [-1, 1].forEach(s => {
      const pivot = grp(head, [s * 0.09, 0.08, -0.02]);
      const ear = mesh(SPH, darkMat, pivot, [s * 0.025, -0.07, 0.01], null, [0.022, 0.09, 0.065]);
      if (o.ears === 'up') { ear.position.set(s * 0.01, 0.07, 0); ear.scale.set(0.02, 0.08, 0.05); }
      pivot.rotation.z = s * (o.ears === 'up' ? -0.15 : 0.5);
      pivot.userData.side = s; ears.push(pivot);
    });
    // collar + tag
    const collar = mesh(new THREE.TorusGeometry(0.105, 0.022, 8, 24), collarMat, neck, [0, 0.12, 0.05], [Math.PI / 2 + 0.75, 0, 0]);
    collar.scale.set(1, 1.15, 1);
    mesh(new THREE.BoxGeometry(0.035, 0.022, 0.006), std(0x111111), neck, [0, -0.01, 0.15], [0.3, 0, 0]);
    // harness
    if (o.harness !== null) {
      const hm = std(o.harness, { roughness: 0.55 });
      const h1 = mesh(new THREE.TorusGeometry(0.215, 0.018, 8, 28), hm, body, [0, 0.03, 0.12], [0, 0, 0]);
      h1.scale.set(0.95, 1.05, 1);
      mesh(new THREE.TorusGeometry(0.2, 0.018, 8, 28), hm, body, [0, 0.03, 0.34], [0.5, 0, 0]).scale.set(0.95, 1.05, 1);
      mesh(new THREE.BoxGeometry(0.05, 0.02, 0.24), hm, body, [0, 0.235, 0.22], [-0.12, 0, 0]);
      mesh(new THREE.TorusGeometry(0.02, 0.006, 6, 12), std(0xbfc4cc, { metalness: 0.8, roughness: 0.3 }), body, [0, 0.26, 0.14], [Math.PI / 2, 0, 0]);
    }
    // legs
    const legs = [];
    const legDef = [['FL', -1, 0.27, true], ['FR', 1, 0.27, true], ['BL', -1, -0.3, false], ['BR', 1, -0.3, false]];
    legDef.forEach(([n, s, z, front]) => {
      const hip = grp(body, [s * 0.1, -0.04, z]);
      if (!front) mesh(SPH, coatMat, hip, [0, -0.04, -0.01], null, [0.08, 0.15, 0.12]); // thigh
      mesh(cyl(front ? 0.052 : 0.06, 0.042, 0.27), coatMat, hip, [0, 0, 0]);
      const knee = grp(hip, [0, -0.25, 0]);
      mesh(cyl(0.04, 0.034, 0.24), coatMat, knee, [0, 0, 0]);
      const paw = mesh(SPH, darkMat, knee, [0, -0.25, 0.03], null, [0.048, 0.03, 0.065]);
      legs.push({ n, hip, knee, front, side: s, paw });
    });
    // tail: chain of segments
    const tail = [];
    let tp = grp(body, [0, 0.07, -0.44]);
    tp.rotation.x = -2.0;
    for (let i = 0; i < 7; i++) {
      const r0 = 0.038 - i * 0.004;
      mesh(new THREE.CylinderGeometry(r0 * 0.85, r0, 0.075, 8).translate(0, 0.0375, 0), coatMat, tp);
      tail.push(tp);
      const nx = grp(tp, [0, 0.07, 0]); tp = nx;
    }
    // ball held in mouth
    const mouthSlot = grp(head, [0, -0.07, 0.23]);
    root.scale.setScalar(o.size);
    const dog = {
      root, body, neck, head, ears, legs, tail, eyes, tongue, mouthSlot,
      phase: 0, speed: 0, gallop: 0, lie: 0, sleep: 0, sit: 0, swim: 0, wag: 1, happy: 0, bow: 0, airborne: 0,
      earLag: 0, t: Math.random() * 10, blink: 0, size: o.size,
    };
    return dog;
  }

  const lerp = (a, b, k) => a + (b - a) * k;
  function animateDog(d, dt) {
    d.t += dt;
    const sp = d.speed, gal = d.gallop;
    const freq = lerp(1.7, 2.6, gal) * (0.6 + sp * 0.18);
    d.phase += dt * freq * Math.PI * 2 * Math.min(1, sp * 0.6 + 0.0001) * (sp > 0.05 ? 1 : 0);
    const moving = Math.min(1, sp / 1.5);
    const ph = d.phase;
    const lie = d.lie, sit = d.sit, swim = d.swim;
    // legs
    d.legs.forEach(L => {
      let off;
      if (gal > 0.5) off = L.front ? (L.side < 0 ? 0 : 0.35) : (L.side < 0 ? Math.PI : Math.PI + 0.35);
      else off = (L.n === 'FL' || L.n === 'BR') ? 0 : Math.PI;
      const p = ph + off;
      const amp = lerp(0.5, 0.95, gal) * moving;
      let hipX = Math.sin(p) * amp;
      let kneeX = (L.front ? 1 : -0.6) * Math.max(0, -Math.cos(p)) * amp * 1.1;
      if (swim > 0) { hipX = lerp(hipX, Math.sin(d.t * 9 + off) * 0.7 - 0.4, swim); kneeX = lerp(kneeX, (L.front ? -1 : 1) * (0.6 + Math.cos(d.t * 9 + off) * 0.4), swim); }
      // lying: front legs forward, back legs tucked
      const lieHip = L.front ? -1.45 : -1.3, lieKnee = L.front ? 0.05 : 2.4;
      const sitHip = L.front ? 0.0 : -1.1, sitKnee = L.front ? 0 : 2.3;
      hipX = lerp(lerp(hipX, sitHip, sit), lieHip, lie);
      kneeX = lerp(lerp(kneeX, sitKnee, sit), lieKnee, lie);
      if (d.bow > 0 && L.front) { hipX = lerp(hipX, -1.2, d.bow); kneeX = lerp(kneeX, 0.2, d.bow); }
      if (d.airborne > 0) { hipX = lerp(hipX, L.front ? -0.7 : 0.8, d.airborne); kneeX = lerp(kneeX, L.front ? -0.3 : 0.6, d.airborne); }
      L.hip.rotation.x = hipX; L.knee.rotation.x = kneeX;
      L.hip.rotation.z = lie * L.side * 0.12;
    });
    // body
    const bob = Math.abs(Math.sin(ph)) * 0.025 * moving * (1 + gal * 1.5);
    const breathe = Math.sin(d.t * (d.sleep > 0.5 ? 1.6 : 3.2)) * 0.008;
    d.body.position.y = lerp(lerp(0.56 + bob, 0.38, sit), 0.2, lie) + (swim ? -0.05 * swim : 0) - d.bow * 0.12;
    d.body.rotation.x = lerp(lerp(gal * Math.sin(ph * 1) * 0.08 * moving, -0.55, sit), 0, lie) + d.bow * 0.25 - swim * 0.15;
    d.body.rotation.z = d.sleep * 0.15;
    d.body.scale.y = 1 + breathe * 4;
    // neck/head
    const look = Math.sin(d.t * 0.7) * 0.25 * (1 - moving) * (1 - d.sleep);
    d.neck.rotation.x = lerp(lerp(Math.sin(ph * 2) * 0.05 * moving - gal * 0.25, 0.35, sit), 0.6 + d.sleep * 0.6, lie) - swim * 0.5;
    d.head.rotation.y = look + (d.headTurn || 0);
    d.head.rotation.x = lerp(0, 0.3, d.sleep) - swim * 0.2;
    d.head.rotation.z = d.sleep * 0.4;
    // ears flop with lag
    d.earLag = lerp(d.earLag, bob * 25 + gal * 0.4 * moving, Math.min(1, dt * 8));
    d.ears.forEach(e => {
      const s = e.userData.side;
      if (Math.abs(e.rotation.z) > 0.3 || e.userData.floppy !== false) e.rotation.x = -d.earLag * 0.6 + Math.sin(d.t * 13 + s) * 0.06 * moving;
    });
    // tail wag
    const wagAmp = (0.35 + d.happy * 0.5) * d.wag * (1 - d.sleep * 0.9);
    const wagSpd = 9 + d.happy * 8;
    d.tail.forEach((s, i) => {
      s.rotation.z = Math.sin(d.t * wagSpd - i * 0.55) * wagAmp * (0.35 + i * 0.08);
      s.rotation.x = i === 0 ? lerp(-2.25 + gal * 0.6 + d.happy * 0.4, -2.7, d.sleep) : 0.12 + gal * -0.05 + d.sleep * 0.1;
    });
    // blink & sleep eyes
    d.blink -= dt; if (d.blink < -0.12) d.blink = 2 + Math.random() * 3;
    const closed = d.blink < 0 || d.sleep > 0.5;
    d.eyes.forEach(e => e.scale.y = closed ? 0.12 : 1);
    d.tongue.visible = (sp > 3.5 || d.happy > 0.6) && d.sleep < 0.5 && !d.holding;
  }

  // ================= PERSON =================
  function makePerson(o) {
    const root = new THREE.Group();
    const skinMat = std(o.skin, { roughness: 0.6 });
    const armMat = o.tattoo ? std(0xffffff, { map: tattooTex(hexStr(o.skin)), roughness: 0.6 }) : skinMat;
    const shirtMat = o.shirtMat || std(o.shirt);
    const pantsMat = o.pantsMat || std(o.pants || 0x223355);
    const shoeMat = std(o.shoes, { roughness: 0.6 });
    const hairMat = std(o.hair, { roughness: 0.65 });
    const hips = grp(root, [0, 0.92, 0]);
    const legs = [];
    [-1, 1].forEach(s => {
      const hp = grp(hips, [s * 0.09, 0, 0]);
      mesh(cyl(0.075, 0.06, 0.46), o.dress ? skinMat : pantsMat, hp);
      const kn = grp(hp, [0, -0.44, 0]);
      mesh(cyl(0.06, 0.048, 0.44), o.dress ? skinMat : pantsMat, kn);
      mesh(new THREE.BoxGeometry(0.1, 0.07, 0.24), shoeMat, kn, [0, -0.45, 0.05]);
      legs.push({ hp, kn, s });
    });
    const torso = grp(hips, [0, 0, 0]);
    if (o.dress) {
      const skirt = mesh(new THREE.CylinderGeometry(0.15, 0.36, 0.62, 20, 1, true), shirtMat, torso, [0, -0.25, 0]);
      skirt.material.side = THREE.DoubleSide;
      mesh(new THREE.CylinderGeometry(0.16, 0.15, 0.36, 16), shirtMat, torso, [0, 0.2, 0]);
      mesh(new THREE.CylinderGeometry(0.14, 0.16, 0.12, 16), skinMat, torso, [0, 0.42, 0]); // shoulders/neckline
    } else {
      mesh(new THREE.CylinderGeometry(0.16, 0.18, 0.12, 16), pantsMat, torso, [0, 0.0, 0]); // belt area
      mesh(new THREE.CylinderGeometry(0.2, 0.165, 0.5, 16), shirtMat, torso, [0, 0.29, 0]);
      mesh(new THREE.BoxGeometry(0.12, 0.05, 0.02), shirtMat, torso, [0.07, 0.42, 0.17]); // pocket hint
    }
    const neck = mesh(new THREE.CylinderGeometry(0.05, 0.055, 0.1, 10), skinMat, torso, [0, 0.55, 0]);
    const head = grp(torso, [0, 0.7, 0]);
    mesh(SPH, skinMat, head, [0, 0, 0], null, [0.11, 0.13, 0.115]);
    mesh(SPH, skinMat, head, [0, -0.02, 0.1], null, [0.02, 0.025, 0.02]); // nose
    [-1, 1].forEach(s => {
      mesh(SPH_LO, std(0x2a1d14), head, [s * 0.04, 0.015, 0.1], null, [0.013, 0.016, 0.008]);
      mesh(SPH_LO, skinMat, head, [s * 0.112, 0, 0], null, [0.02, 0.035, 0.02]); // ears
    });
    mesh(new THREE.TorusGeometry(0.03, 0.004, 6, 16, Math.PI), std(0xa34a4a), head, [0, -0.06, 0.098], [0, 0, Math.PI]); // smile
    if (o.glasses) {
      const gm = std(0x1a1a1a, { roughness: 0.3 });
      [-1, 1].forEach(s => mesh(new THREE.TorusGeometry(0.03, 0.005, 6, 18), gm, head, [s * 0.042, 0.015, 0.112]));
      mesh(new THREE.BoxGeometry(0.03, 0.005, 0.005), gm, head, [0, 0.02, 0.115]);
      [-1, 1].forEach(s => mesh(new THREE.BoxGeometry(0.004, 0.005, 0.1), gm, head, [s * 0.075, 0.02, 0.07]));
    }
    // hair
    mesh(SPH, hairMat, head, [0, 0.035, -0.01], null, [0.118, 0.115, 0.125]).scale.y = o.longHair ? 0.12 : 0.1;
    if (o.longHair) {
      mesh(new THREE.BoxGeometry(0.24, 0.42, 0.08), hairMat, head, [0, -0.17, -0.07], [0.08, 0, 0]);
      [-1, 1].forEach(s => mesh(new THREE.BoxGeometry(0.05, 0.36, 0.08), hairMat, head, [s * 0.105, -0.13, -0.0], [0, 0, s * -0.06]));
      mesh(SPH, hairMat, head, [0, 0.09, 0.05], null, [0.1, 0.04, 0.07]);
    } else {
      mesh(SPH, hairMat, head, [0, 0.08, 0.04], null, [0.1, 0.05, 0.08]); // swoop
    }
    const arms = [];
    [-1, 1].forEach(s => {
      const sh = grp(torso, [s * (o.dress ? 0.19 : 0.215), 0.48, 0]);
      sh.rotation.z = s * 0.08;
      if (o.dress) mesh(cyl(0.048, 0.042, 0.3), armMat, sh);
      else { mesh(cyl(0.07, 0.062, 0.16), shirtMat, sh); mesh(cyl(0.048, 0.044, 0.3), skinMat, sh, [0, -0.12, 0]); }
      const el = grp(sh, [0, -0.29, 0]);
      mesh(cyl(0.042, 0.035, 0.27), armMat, el);
      mesh(SPH_LO, skinMat, el, [0, -0.29, 0.01], null, [0.035, 0.05, 0.025]);
      arms.push({ sh, el, s });
    });
    return { root, hips, torso, head, legs, arms, phase: 0, speed: 0, t: Math.random() * 5, wave: 0, sit: 0, throwT: -1 };
  }
  function animatePerson(p, dt) {
    p.t += dt;
    const sp = p.speed, moving = Math.min(1, sp / 1.2);
    p.phase += dt * (1.6 + sp * 0.5) * Math.PI * 2 * (sp > 0.05 ? 1 : 0);
    const run = Math.max(0, Math.min(1, (sp - 2.5) / 2));
    p.legs.forEach(L => {
      const ph = p.phase + (L.s > 0 ? Math.PI : 0);
      let h = Math.sin(ph) * (0.45 + run * 0.35) * moving, k = Math.max(0, -Math.cos(ph)) * (0.6 + run * 0.6) * moving;
      h = lerp(h, -1.5, p.sit); k = lerp(k, 1.5, p.sit);
      L.hp.rotation.x = h; L.kn.rotation.x = k;
    });
    p.arms.forEach(A => {
      const ph = p.phase + (A.s > 0 ? 0 : Math.PI);
      let x = Math.sin(ph) * (0.4 + run * 0.4) * moving, e = -0.2 - run * 0.9 * moving;
      if (A.s > 0 && p.wave > 0) { x = lerp(x, -2.7, p.wave); A.sh.rotation.z = lerp(0.08, 0.3 + Math.sin(p.t * 10) * 0.35, p.wave); e = lerp(e, -0.3, p.wave); }
      else A.sh.rotation.z = A.s * 0.08;
      if (A.s > 0 && p.throwT >= 0) { const k = p.throwT; x = k < 0.5 ? lerp(0, 2.6, k * 2) * -1 : lerp(-2.6, 0.6, (k - 0.5) * 2); }
      A.sh.rotation.x = lerp(x, -0.6, p.sit * (A.s > 0 && p.wave > 0 ? 0 : 1)); A.el.rotation.x = e;
    });
    p.hips.position.y = lerp(0.92 + Math.abs(Math.sin(p.phase)) * 0.03 * moving, 0.5, p.sit);
    p.torso.rotation.x = run * 0.15 + p.sit * -0.1;
    p.head.rotation.y = Math.sin(p.t * 0.5) * 0.2 * (1 - moving);
  }

  // ================= SMALL PROPS =================
  function makeTreat() {
    const g = new THREE.Group();
    const m = std(0xe0b072, { roughness: 0.5, emissive: 0x6a4410, emissiveIntensity: 0.6 });
    mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.32, 10), m, g, [0, 0, 0], [0, 0, Math.PI / 2]);
    [[-0.16, 0.045], [-0.16, -0.045], [0.16, 0.045], [0.16, -0.045]].forEach(([x, y]) => mesh(SPH_LO, m, g, [x, y, 0], null, [0.065, 0.065, 0.065]));
    return g;
  }
  function makeSquirrel() {
    const g = new THREE.Group(), m = std(0x8a7f74), lm = std(0xd9cfc2);
    mesh(SPH, m, g, [0, 0.12, 0], null, [0.08, 0.09, 0.13]);
    mesh(SPH, lm, g, [0, 0.1, 0.05], null, [0.06, 0.07, 0.08]);
    mesh(SPH, m, g, [0, 0.2, 0.12], null, [0.055, 0.055, 0.065]);
    [-1, 1].forEach(s => mesh(SPH_LO, m, g, [s * 0.03, 0.26, 0.11], null, [0.015, 0.03, 0.01]));
    mesh(SPH_LO, std(0x111111), g, [0.03, 0.21, 0.17], null, [0.01, 0.01, 0.01]);
    mesh(SPH_LO, std(0x111111), g, [-0.03, 0.21, 0.17], null, [0.01, 0.01, 0.01]);
    const tail = grp(g, [0, 0.12, -0.12]);
    mesh(SPH, m, tail, [0, 0.14, -0.06], [0.4, 0, 0], [0.07, 0.17, 0.07]);
    return { root: g, tail };
  }
  function makeBall() {
    const tex = canvasTex(64, 64, (g, w, h) => { g.fillStyle = '#d4e83a'; g.fillRect(0, 0, w, h); g.strokeStyle = '#f7f7e8'; g.lineWidth = 4; g.beginPath(); g.arc(0, h / 2, w * 0.45, -1.3, 1.3); g.stroke(); g.beginPath(); g.arc(w, h / 2, w * 0.45, Math.PI - 1.3, Math.PI + 1.3); g.stroke(); });
    return mesh(new THREE.SphereGeometry(0.075, 16, 12), std(0xffffff, { map: tex, emissive: 0x3a4a00, emissiveIntensity: 0.6 }));
  }

  return { makeDog, animateDog, makePerson, animatePerson, makeTreat, makeSquirrel, makeBall, floralTex, denimTex, canvasTex, std, mesh, grp };
})();
