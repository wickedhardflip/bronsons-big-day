// Bronson's Big Day - game loop, chapters, camera, input and HUD.
function boot() {
  const $ = id => document.getElementById(id);
  const V3 = THREE.Vector3;
  const P = World.P;
  const store = {
    get(k, d) { try { const v = localStorage.getItem('bronson.' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('bronson.' + k, JSON.stringify(v)); } catch (e) { /* storage blocked */ } },
  };

  // ---------- renderer ----------
  const canvas = $('c');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(58, 1, 0.1, 1400);
  function resize() {
    const w = canvas.clientWidth || window.innerWidth, h = canvas.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  World.build(scene);
  const groundH = World.groundH, WL = World.WL, C = World.colliders;

  // ---------- characters ----------
  const B = Models.makeDog({}); scene.add(B.root);
  const std = Models.std;
  const mom = Models.makePerson({ skin: 0xf3cdb4, hair: 0x8e3f24, longHair: true, glasses: true, dress: true, shirtMat: std(0xffffff, { map: Models.floralTex(), roughness: 0.8 }), shoes: 0xc49a6c, tattoo: true });
  const dad = Models.makePerson({ skin: 0xf0c2a2, hair: 0xb8562b, shirt: 0x1d7cb3, pantsMat: std(0xffffff, { map: Models.denimTex(), roughness: 0.85 }), shoes: 0x6e4a2c });
  scene.add(mom.root); scene.add(dad.root);
  const people = [mom, dad];
  people.forEach(p => { p.pos = new V3(); p.heading = 0; });
  const friendDefs = [
    { name: 'Daisy', coat: 0xd4a24c, collar: 0xe0483e, size: 0.93, speed: 7.0 },
    { name: 'Moose', coat: 0x2b2522, collar: 0x2ecc71, size: 1.07, speed: 6.7, ears: 'up', belly: 0xe8e2d8 },
    { name: 'Pepper', coat: 0x9aa0a8, collar: 0xff7ab8, size: 0.78, speed: 7.5 },
  ];
  const friends = friendDefs.map(d => {
    const dog = Models.makeDog({ coat: d.coat, collar: d.collar, harness: null, size: d.size, ears: d.ears || 'floppy', belly: d.belly, eye: 0x5a3a1a, nose: 0x1a1a1a });
    scene.add(dog.root);
    return Object.assign({ dog, pos: new V3(), heading: 0, spd: 0, state: 'idle', t: 0, wander: new V3(), stun: 0, react: 0 }, d);
  });

  // ---------- fx ----------
  const glow = World.glowTex();
  const zTex = Models.canvasTex(64, 64, (g, w, h) => { g.fillStyle = '#e8f0ff'; g.font = 'bold 52px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('Z', w / 2, h / 2); });
  const parts = [];
  for (let i = 0; i < 220; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, transparent: true, depthWrite: false }));
    s.visible = false; scene.add(s); parts.push({ s, life: 0, max: 1, v: new V3(), g: 0, size: 1 });
  }
  let pi = 0;
  function fx(pos, o) {
    const p = parts[pi++ % parts.length];
    p.s.visible = true; p.s.position.copy(pos);
    p.s.material.map = o.tex || glow; p.s.material.color.set(o.color || 0xffffff);
    p.s.material.blending = o.add === false ? THREE.NormalBlending : THREE.AdditiveBlending;
    p.v.set(o.vx || 0, o.vy || 0, o.vz || 0); p.g = o.g || 0; p.life = p.max = o.life || 1; p.size = o.size || 0.3;
  }
  function burst(pos, color, n = 14, speed = 3, size = 0.35) {
    for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, u = Math.random(); fx(pos, { color, vx: Math.cos(a) * speed * u, vy: 1 + Math.random() * speed, vz: Math.sin(a) * speed * u, g: -6, life: 0.6 + Math.random() * 0.5, size }); }
  }
  function updateFx(dt) {
    parts.forEach(p => {
      if (!p.s.visible) return;
      p.life -= dt; if (p.life <= 0) { p.s.visible = false; return; }
      p.v.y += p.g * dt; p.s.position.addScaledVector(p.v, dt);
      const k = p.life / p.max; p.s.material.opacity = Math.min(1, k * 1.5); p.s.scale.setScalar(p.size * (0.6 + 0.4 * k));
    });
  }
  const proj = new V3();
  function pop(pos, text, cls) {
    proj.copy(pos).project(camera);
    if (proj.z > 1) return;
    const el = document.createElement('div'); el.className = 'pop ' + (cls || ''); el.textContent = text;
    el.style.left = ((proj.x + 1) / 2 * 100) + '%'; el.style.top = ((1 - proj.y) / 2 * 100) + '%';
    $('pops').appendChild(el); setTimeout(() => el.remove(), 1300);
  }
  let toastT = 0;
  function toast(text, dur = 2.4) { const t = $('toast'); t.textContent = text; t.classList.add('on'); toastT = dur; }

  // beacon (objective marker)
  const beacon = new THREE.Group(); scene.add(beacon);
  const beamTex = Models.canvasTex(4, 128, (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(1, 'rgba(255,255,255,0.9)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
  const beamMat = new THREE.MeshBasicMaterial({ map: beamTex, color: 0xffd24a, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 16, 20, 1, true), beamMat); beam.position.y = 8; beacon.add(beam);
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xffd24a, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const ring = new THREE.Mesh(new THREE.RingGeometry(1.0, 1.25, 40), ringMat); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.06; beacon.add(ring);
  let beaconTarget = null;
  function setBeacon(v, color = 0xffd24a) { beaconTarget = v; beacon.visible = !!v; beamMat.color.set(color); ringMat.color.set(color); }

  // ---------- collision ----------
  function resolve(p, r) {
    for (let i = 0; i < C.circles.length; i++) {
      const c = C.circles[i], R = r + c[2], dx = p.x - c[0], dz = p.z - c[1];
      if (dx > R || dx < -R || dz > R || dz < -R) continue;
      const d2 = dx * dx + dz * dz; if (d2 < R * R && d2 > 1e-8) { const d = Math.sqrt(d2); p.x = c[0] + dx / d * R; p.z = c[1] + dz / d * R; }
    }
    for (let i = 0; i < C.segs.length; i++) {
      const [ax, az, bx, bz] = C.segs[i], ex = bx - ax, ez = bz - az, L2 = ex * ex + ez * ez;
      let t = ((p.x - ax) * ex + (p.z - az) * ez) / L2; t = Math.max(0, Math.min(1, t));
      const cx = ax + ex * t, cz = az + ez * t, dx = p.x - cx, dz = p.z - cz, d2 = dx * dx + dz * dz, R = r + 0.08;
      if (d2 < R * R) { const d = Math.sqrt(d2) || 1e-4; p.x = cx + dx / d * R; p.z = cz + dz / d * R; }
    }
    for (let i = 0; i < C.boxes.length; i++) {
      const b = C.boxes[i]; if (b.h) continue;
      if (p.x > b.x0 - r && p.x < b.x1 + r && p.z > b.z0 - r && p.z < b.z1 + r) {
        const m = [p.x - (b.x0 - r), (b.x1 + r) - p.x, p.z - (b.z0 - r), (b.z1 + r) - p.z], k = m.indexOf(Math.min(...m));
        if (k === 0) p.x = b.x0 - r; else if (k === 1) p.x = b.x1 + r; else if (k === 2) p.z = b.z0 - r; else p.z = b.z1 + r;
      }
    }
    const bd = P.bounds; p.x = Math.max(bd.x0, Math.min(bd.x1, p.x)); p.z = Math.max(bd.z0, Math.min(bd.z1, p.z));
  }
  const porchH = (x, z) => { for (const b of C.boxes) if (b.h && x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1) return b.h; return 0; };
  const onBed = (x, z) => (x - P.bed.x) ** 2 + (z - P.bed.z) ** 2 < 0.8 ? 0.16 : 0;
  const floorAt = (x, z) => groundH(x, z) + porchH(x, z) + onBed(x, z);

  // ---------- input ----------
  const keys = {};
  const input = { x: 0, y: 0, sprint: false, jump: false, bark: false, any: false };
  const touch = { jx: 0, jy: 0, sprint: false, active: false };
  window.addEventListener('keydown', e => {
    if (e.target && e.target.tagName === 'INPUT') return;
    keys[e.code] = true; input.any = true; Sound.start();
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    if (e.code === 'Space') input.jump = true;
    if (e.code === 'KeyE' || e.code === 'KeyB') input.bark = true;
    if (e.code === 'KeyM') toggleMute();
    if (e.code === 'KeyC') cam.lastManual = -10;
    if (e.code === 'Escape' || e.code === 'KeyP') togglePause();
    if (e.code === 'Enter' && G.state === 'result' && G.resultAction) G.resultAction();
  });
  window.addEventListener('keyup', e => { keys[e.code] = false; });
  window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
  function readInput() {
    let x = 0, y = 0;
    if (keys.KeyW || keys.ArrowUp) y += 1; if (keys.KeyS || keys.ArrowDown) y -= 1;
    if (keys.KeyD || keys.ArrowRight) x += 1; if (keys.KeyA || keys.ArrowLeft) x -= 1;
    if (touch.active) { x += touch.jx; y += touch.jy; }
    const m = Math.hypot(x, y); if (m > 1) { x /= m; y /= m; }
    input.x = x; input.y = y; input.sprint = !!(keys.ShiftLeft || keys.ShiftRight || touch.sprint);
  }
  // mouse / touch camera drag
  let drag = null;
  canvas.addEventListener('pointerdown', e => { Sound.start(); input.any = true; if (e.pointerType === 'touch' && e.clientX < window.innerWidth * 0.45) return; drag = { id: e.pointerId, x: e.clientX, y: e.clientY }; try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ } });
  canvas.addEventListener('pointermove', e => {
    if (!drag || drag.id !== e.pointerId) return;
    cam.yaw -= (e.clientX - drag.x) * 0.006; cam.pitch = Math.max(0.05, Math.min(1.2, cam.pitch + (e.clientY - drag.y) * 0.004));
    drag.x = e.clientX; drag.y = e.clientY; cam.lastManual = clock;
  });
  const endDrag = e => { if (drag && drag.id === e.pointerId) drag = null; };
  canvas.addEventListener('pointerup', endDrag); canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('wheel', e => { cam.dist = Math.max(3.2, Math.min(10, cam.dist + e.deltaY * 0.004)); e.preventDefault(); }, { passive: false });
  // on-screen controls
  const isTouch = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  function setupTouch() {
    const zone = $('joyzone'), knob = $('knob'), base = $('joybase');
    let jid = null, cx = 0, cy = 0;
    zone.addEventListener('pointerdown', e => { Sound.start(); input.any = true; jid = e.pointerId; cx = e.clientX; cy = e.clientY; touch.active = true; base.style.left = cx + 'px'; base.style.top = cy + 'px'; base.classList.add('on'); try { zone.setPointerCapture(jid); } catch (err) { /* ignore */ } e.preventDefault(); });
    zone.addEventListener('pointermove', e => {
      if (e.pointerId !== jid) return;
      let dx = e.clientX - cx, dy = e.clientY - cy; const m = Math.hypot(dx, dy), R = 55; if (m > R) { dx *= R / m; dy *= R / m; }
      touch.jx = dx / R; touch.jy = -dy / R; knob.style.transform = `translate(${dx}px,${dy}px)`;
      touch.sprint = touch.sprintBtn || m > R * 0.98 && false;
    });
    const end = e => { if (e.pointerId !== jid) return; jid = null; touch.jx = touch.jy = 0; touch.active = false; knob.style.transform = ''; base.classList.remove('on'); };
    zone.addEventListener('pointerup', end); zone.addEventListener('pointercancel', end);
    const hold = (id, on, off) => { const b = $(id); b.addEventListener('pointerdown', e => { Sound.start(); input.any = true; on(); e.preventDefault(); }); ['pointerup', 'pointercancel', 'pointerleave'].forEach(ev => b.addEventListener(ev, off)); };
    hold('tSprint', () => { touch.sprintBtn = true; touch.sprint = true; }, () => { touch.sprintBtn = false; touch.sprint = false; });
    hold('tJump', () => { input.jump = true; }, () => { });
    hold('tBark', () => { input.bark = true; }, () => { });
  }
  setupTouch();
  window.addEventListener('touchstart', () => { $('touch').hidden = !(G.state === 'play' || G.state === 'card'); document.body.classList.add('touchy'); }, { passive: true });

  // ---------- camera ----------
  const cam = { yaw: Math.PI, pitch: 0.34, dist: 5.4, target: new V3(), lastManual: -10, mode: 'follow', orbitT: 0, orbitCenter: new V3() };
  const lerpAngle = (a, b, k) => { let d = ((b - a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI; return a + d * k; };
  function updateCamera(dt) {
    const want = new V3();
    if (cam.mode === 'orbit') {
      cam.orbitT += dt * 0.12;
      const c = cam.orbitCenter, r = cam.orbitR || 7;
      want.set(c.x + Math.sin(cam.orbitT) * r, c.y + (cam.orbitH || 2.6), c.z + Math.cos(cam.orbitT) * r);
      want.y = Math.max(want.y, groundH(want.x, want.z) + 0.6);
      camera.position.lerp(want, 1 - Math.exp(-3 * dt)); cam.target.lerp(c, 1 - Math.exp(-4 * dt)); camera.lookAt(cam.target);
      return;
    }
    const tgt = new V3(player.pos.x, player.pos.y + 0.85, player.pos.z);
    cam.target.lerp(tgt, 1 - Math.exp(-12 * dt));
    if (player.spd > 0.6 && clock - cam.lastManual > 1.3) cam.yaw = lerpAngle(cam.yaw, player.heading + Math.PI, 1 - Math.exp(-1.7 * dt));
    const cp = Math.cos(cam.pitch), d = cam.dist;
    want.set(cam.target.x + Math.sin(cam.yaw) * cp * d, cam.target.y + Math.sin(cam.pitch) * d + 0.3, cam.target.z + Math.cos(cam.yaw) * cp * d);
    want.y = Math.max(want.y, groundH(want.x, want.z) + 0.5, WL + 0.4);
    camera.position.lerp(want, 1 - Math.exp(-10 * dt));
    camera.lookAt(cam.target);
  }

  // ---------- player ----------
  const player = { pos: new V3(), vy: 0, heading: Math.PI, spd: 0, stamina: 100, tired: false, grounded: true, swimming: false, wet: false, mode: 'free', barkCD: 0, stealCD: 0, holding: false, stepPh: 0 };
  function placeDog(d, pos, heading) { d.pos ? d.pos.copy(pos) : null; }
  void placeDog;
  function updatePlayer(dt) {
    const p = player;
    const canMove = G.state === 'play' && p.mode === 'free';
    const fwdX = -Math.sin(cam.yaw), fwdZ = -Math.cos(cam.yaw), rX = Math.cos(cam.yaw), rZ = -Math.sin(cam.yaw);
    let mx = 0, mz = 0;
    if (canMove) { mx = fwdX * input.y + rX * input.x; mz = fwdZ * input.y + rZ * input.x; }
    const mag = Math.min(1, Math.hypot(mx, mz));
    const ground = groundH(p.pos.x, p.pos.z);
    p.swimming = ground < WL - 0.5;
    const sprinting = canMove && input.sprint && mag > 0.2 && !p.tired && !p.swimming;
    const drain = G.chapter === 3 ? 20 : 18;
    if (sprinting) p.stamina -= drain * dt; else p.stamina += (p.spd < 0.5 ? 20 : 12) * dt;
    p.stamina = Math.max(0, Math.min(100, p.stamina));
    if (p.stamina <= 0) p.tired = true; if (p.tired && p.stamina > 35) p.tired = false;
    const top = p.swimming ? 2.8 : sprinting ? 8.6 : 4.6;
    const targetSpd = mag * top;
    if (mag > 0.05) { const h = Math.atan2(mx, mz); p.heading = lerpAngle(p.heading, h, 1 - Math.exp(-11 * dt)); }
    p.spd += (targetSpd - p.spd) * (1 - Math.exp(-(targetSpd > p.spd ? 6 : 9) * dt));
    p.pos.x += Math.sin(p.heading) * p.spd * dt; p.pos.z += Math.cos(p.heading) * p.spd * dt;
    resolve(p.pos, 0.42);
    const floor = p.swimming ? WL - 0.42 : floorAt(p.pos.x, p.pos.z);
    if (canMove && input.jump && p.grounded && !p.swimming) { p.vy = 7.2; p.grounded = false; Sound.sfx.jump(); }
    p.vy -= 24 * dt; p.pos.y += p.vy * dt;
    if (p.pos.y <= floor) {
      if (!p.grounded && p.vy < -6) { Sound.sfx.thump(); for (let i = 0; i < 6; i++) fx(p.pos.clone().add(new V3(0, 0.1, 0)), { color: 0xc8b48c, add: false, vx: (Math.random() - 0.5) * 3, vy: 0.6, vz: (Math.random() - 0.5) * 3, g: -2, life: 0.5, size: 0.5 }); }
      p.pos.y = floor; p.vy = 0; p.grounded = true;
    } else if (p.pos.y > floor + 0.05) p.grounded = false;
    if (p.pos.y < floor - 0.01 && floor - p.pos.y < 1.2) p.pos.y = floor;
    // water entry
    const inWater = ground < WL - 0.05;
    if (inWater && !p.wet) { Sound.sfx.splash(); for (let i = 0; i < 18; i++) fx(new V3(p.pos.x, WL + 0.1, p.pos.z), { color: 0xcfeeff, add: false, vx: (Math.random() - 0.5) * 4, vy: 2 + Math.random() * 3, vz: (Math.random() - 0.5) * 4, g: -12, life: 0.7, size: 0.25 }); if (!G.flags.swam) { G.flags.swam = true; pop(p.pos, 'Splash! +5', 'bonus'); addScore(5); } }
    p.wet = inWater;
    // animate
    B.speed = p.spd; B.gallop += ((sprinting && p.spd > 5 ? 1 : 0) - B.gallop) * (1 - Math.exp(-6 * dt));
    B.swim += ((p.swimming ? 1 : 0) - B.swim) * (1 - Math.exp(-5 * dt));
    B.airborne += ((p.grounded ? 0 : 1) - B.airborne) * (1 - Math.exp(-10 * dt));
    B.happy += ((G.happyT > 0 ? 1 : 0.2) - B.happy) * (1 - Math.exp(-3 * dt));
    B.root.position.copy(p.pos); B.root.rotation.y = p.heading;
    Models.animateDog(B, dt);
    // footsteps & dust
    if (p.grounded && p.spd > 0.5 && !p.swimming) {
      const n = Math.floor(B.phase / Math.PI);
      if (n !== p.stepPh) { p.stepPh = n; Sound.sfx.step(sprinting ? 0.05 : 0.025); if (sprinting) fx(p.pos.clone().add(new V3(-Math.sin(p.heading) * 0.5, 0.1, -Math.cos(p.heading) * 0.5)), { color: 0xcab79a, add: false, vy: 0.5, vx: (Math.random() - 0.5), vz: (Math.random() - 0.5), life: 0.6, size: 0.45 }); }
    }
    if (p.swimming && Math.random() < dt * 8) fx(new V3(p.pos.x + (Math.random() - 0.5) * 0.6, WL + 0.05, p.pos.z + (Math.random() - 0.5) * 0.6), { color: 0xffffff, add: false, vy: 0.3, life: 0.6, size: 0.3 });
    // bark
    p.barkCD -= dt; p.stealCD -= dt;
    if (canMove && input.bark && p.barkCD <= 0) {
      p.barkCD = 0.7; Sound.sfx.bark(); B.headTurn = 0; G.barkT = 0.35;
      const mouth = new V3(); B.mouthSlot.getWorldPosition(mouth);
      for (let i = 0; i < 10; i++) { const a = p.heading + (Math.random() - 0.5) * 1.2; fx(mouth, { color: 0xfff1b8, vx: Math.sin(a) * 4, vy: 0.5, vz: Math.cos(a) * 4, life: 0.35, size: 0.25 }); }
      if (G.ch && G.ch.onBark) G.ch.onBark();
    }
    G.barkT = Math.max(0, (G.barkT || 0) - dt);
    B.neck.rotation.x -= G.barkT * 0.8;
    input.jump = false; input.bark = false;
  }

  // ---------- NPC movement helpers ----------
  function stepToward(ent, target, maxSpd, dt, stop = 0.5, r = 0.4) {
    const dx = target.x - ent.pos.x, dz = target.z - ent.pos.z, d = Math.hypot(dx, dz);
    const want = d > stop ? Math.min(maxSpd, (d - stop) * 3) : 0;
    ent.spd = (ent.spd || 0) + (want - (ent.spd || 0)) * (1 - Math.exp(-6 * dt));
    if (d > 0.05 && ent.spd > 0.05) ent.heading = lerpAngle(ent.heading, Math.atan2(dx, dz), 1 - Math.exp(-8 * dt));
    ent.pos.x += Math.sin(ent.heading) * ent.spd * dt; ent.pos.z += Math.cos(ent.heading) * ent.spd * dt;
    resolve(ent.pos, r);
    ent.pos.y = floorAt(ent.pos.x, ent.pos.z);
    return d;
  }
  function facePoint(ent, pt, dt) { ent.heading = lerpAngle(ent.heading, Math.atan2(pt.x - ent.pos.x, pt.z - ent.pos.z), 1 - Math.exp(-4 * dt)); }
  function syncPerson(p, dt) { p.speed = p.spd || 0; p.root.position.copy(p.pos); p.root.rotation.y = p.heading; Models.animatePerson(p, dt); }
  function syncFriend(f, dt) {
    const d = f.dog; d.speed = f.spd; d.gallop += (((f.spd || 0) > 5 ? 1 : 0) - d.gallop) * (1 - Math.exp(-6 * dt));
    d.sit += ((f.sitting ? 1 : 0) - d.sit) * (1 - Math.exp(-5 * dt));
    d.happy = f.state === 'carry' ? 1 : 0.4;
    d.swim = 0; d.root.position.copy(f.pos); d.root.rotation.y = f.heading; Models.animateDog(d, dt);
  }

  // ---------- treats / collectibles ----------
  const treats = [];
  function clearTreats() { treats.forEach(t => scene.remove(t.mesh)); treats.length = 0; }
  function addTreat(x, z, value = 10, golden = false) {
    const m = Models.makeTreat(); const y = floorAt(x, z) + 0.45;
    if (golden) m.traverse(o => { if (o.isMesh) { o.material = o.material.clone(); o.material.color.set(0xffd34a); o.material.emissive.set(0xb07800); o.material.metalness = 0.6; o.material.roughness = 0.25; } });
    m.position.set(x, y, z); m.scale.setScalar(golden ? 1.4 : 1); scene.add(m);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: golden ? 0xffe066 : 0xffd9a0, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }));
    sp.scale.setScalar(golden ? 1.6 : 1.1); m.add(sp);
    treats.push({ mesh: m, x, z, y, value, golden, taken: false, ph: Math.random() * 6 });
  }
  function updateTreats(dt) {
    treats.forEach(t => {
      if (t.taken) return;
      t.ph += dt; t.mesh.rotation.y += dt * 2; t.mesh.position.y = t.y + Math.sin(t.ph * 3) * 0.12;
      const dx = player.pos.x - t.x, dz = player.pos.z - t.z;
      if (dx * dx + dz * dz < 1.6 && Math.abs(player.pos.y - t.y) < 2) {
        t.taken = true; scene.remove(t.mesh); Sound.sfx.treat(); addScore(t.value);
        player.stamina = Math.min(100, player.stamina + 20); G.happyT = 1.5;
        burst(t.mesh.position, t.golden ? 0xffe066 : 0xffd08a, 16, 3, 0.3);
        pop(t.mesh.position, (t.golden ? 'Golden treat! +' : '+') + t.value, t.golden ? 'gold' : '');
        if (G.ch && G.ch.onTreat) G.ch.onTreat(t);
      }
    });
  }
  // squirrels
  const squirrels = [];
  function clearSquirrels() { squirrels.forEach(s => scene.remove(s.m.root)); squirrels.length = 0; }
  function addSquirrel(tree, home) {
    const m = Models.makeSquirrel(); scene.add(m.root);
    squirrels.push({ m, pos: home.clone(), tree: tree.clone(), home: home.clone(), heading: 0, spd: 0, state: 'idle', t: Math.random() * 5, climb: 0 });
  }
  function updateSquirrels(dt) {
    squirrels.forEach(s => {
      if (s.state === 'gone') return;
      s.t += dt;
      const dp = Math.hypot(player.pos.x - s.pos.x, player.pos.z - s.pos.z);
      if (s.state === 'idle') {
        s.pos.y = groundH(s.pos.x, s.pos.z); s.m.root.position.copy(s.pos);
        s.m.root.rotation.x = Math.sin(s.t * 8) * 0.05; s.m.tail.rotation.x = Math.sin(s.t * 3) * 0.3;
        if (dp < 7.5) { s.state = 'flee'; Sound.sfx.squeak(); }
      } else if (s.state === 'flee') {
        const zig = Math.sin(s.t * 9) * 0.9;
        const tgt = s.tree.clone().add(new V3(Math.cos(s.t * 9) * zig, 0, Math.sin(s.t * 9) * zig));
        const d = stepToward(s, tgt, 6.2, dt, 0.2, 0.15);
        s.pos.y = groundH(s.pos.x, s.pos.z) + Math.abs(Math.sin(s.t * 18)) * 0.12;
        s.m.root.position.copy(s.pos); s.m.root.rotation.set(0, s.heading, 0);
        if (dp < 1.0) { s.state = 'climb'; addScore(25); pop(s.pos, 'Squirrel tagged! +25', 'bonus'); Sound.sfx.squeak(); G.happyT = 2; G.flags.squirrels = (G.flags.squirrels || 0) + 1; burst(s.pos, 0xbfe3ff, 10, 2, 0.25); }
        else if (d < 0.7) s.state = 'climb';
      } else if (s.state === 'climb') {
        s.climb += dt * 3; const tr = s.tree;
        s.m.root.position.set(tr.x - 0.35, groundH(tr.x, tr.z) + s.climb, tr.z); s.m.root.rotation.set(-Math.PI / 2, 0, 0);
        if (s.climb > 4) { s.state = 'gone'; s.m.root.visible = false; }
      }
    });
  }
  // fireflies to catch (dusk)
  const orbs = [];
  function clearOrbs() { orbs.forEach(o => scene.remove(o.s)); orbs.length = 0; }
  function addOrb(x, z) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: 0xfff27a, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); s.scale.setScalar(1.3); scene.add(s); orbs.push({ s, x, z, y: groundH(x, z) + 1.1, t: Math.random() * 6, taken: false }); }
  function updateOrbs(dt) {
    orbs.forEach(o => {
      if (o.taken) return; o.t += dt;
      o.s.position.set(o.x + Math.sin(o.t) * 0.8, o.y + Math.sin(o.t * 2.3) * 0.4, o.z + Math.cos(o.t * 0.8) * 0.8);
      o.s.material.opacity = 0.7 + Math.sin(o.t * 6) * 0.3;
      if (o.s.position.distanceToSquared(player.pos.clone().add(new V3(0, 0.6, 0))) < 2.6) {
        o.taken = true; scene.remove(o.s); addScore(30); G.timer += 4; Sound.sfx.chime(); burst(o.s.position, 0xfff27a, 18, 2.5, 0.3);
        pop(o.s.position, 'Firefly! +30  +4s', 'gold'); G.flags.fireflies = (G.flags.fireflies || 0) + 1;
      }
    });
  }

  // ---------- leash ----------
  const leashGeo = new THREE.BufferGeometry(); leashGeo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(3 * 20), 3));
  const leash = new THREE.Line(leashGeo, new THREE.LineBasicMaterial({ color: 0x1b1b1b })); leash.frustumCulled = false; scene.add(leash); leash.visible = false;
  function updateLeash() {
    if (!leash.visible) return;
    const a = new V3(); B.body.localToWorld(a.set(0, 0.26, 0.14));
    const hand = new V3(); dad.arms[1].el.localToWorld(hand.set(0, -0.3, 0.02));
    const pa = leashGeo.attributes.position, sag = Math.max(0, 1.6 - a.distanceTo(hand) * 0.35);
    for (let i = 0; i < 20; i++) { const t = i / 19; const x = a.x + (hand.x - a.x) * t, y = a.y + (hand.y - a.y) * t - Math.sin(t * Math.PI) * sag * 0.6, z = a.z + (hand.z - a.z) * t; pa.setXYZ(i, x, y, z); }
    pa.needsUpdate = true;
  }

  // ---------- ball (fetch) ----------
  const ball = Models.makeBall(); scene.add(ball); ball.visible = false;

  // ---------- game state ----------
  const G = { state: 'title', chapter: 0, score: 0, timer: 0, elapsed: 0, ch: null, flags: {}, happyT: 0, best: store.get('best', 0), resultAction: null, bonus: 0 };
  function addScore(n) { G.score += n; $('score').textContent = G.score.toLocaleString(); $('score').classList.remove('bump'); void $('score').offsetWidth; $('score').classList.add('bump'); }

  function resetPeople() {
    people.forEach(p => { p.spd = 0; p.sit = 0; p.wave = 0; p.throwT = -1; p.root.visible = true; });
    leash.visible = false; ball.visible = false; ball.parent !== scene && scene.add(ball);
  }
  function parkIdle(f, i) {
    f.state = 'idle'; f.sitting = false; f.pos.set(44 + i * 6, 0, -26 + i * 5); f.pos.y = groundH(f.pos.x, f.pos.z); f.wander.copy(f.pos); f.t = Math.random() * 3; f.heading = Math.random() * 6;
  }
  function wanderFriend(f, dt) {
    f.t -= dt;
    if (f.t <= 0) { f.t = 2 + Math.random() * 4; const K = P.park; f.wander.set(K.x0 + 4 + Math.random() * (K.x1 - K.x0 - 8), 0, K.z0 + 3 + Math.random() * (K.z1 - K.z0 - 6)); f.run = Math.random() < 0.4; }
    stepToward(f, f.wander, f.run ? 6 : 2.2, dt, 0.6);
  }

  // ================= CHAPTERS =================
  const CHAPTERS = [
    { // 1 ---------------------------------------------------------------
      name: 'Rise and Shine', tag: 'Chapter 1', tod: 'morning', music: 'home', goal: 'Wake up and sniff out the 8 morning treats hidden around the yard.',
      setup() {
        player.pos.set(P.bed.x, floorAt(P.bed.x, P.bed.z), P.bed.z); player.heading = -2.4; player.mode = 'sleeping';
        B.lie = 1; B.sleep = 1;
        cam.yaw = player.heading + Math.PI + 0.6; cam.pitch = 0.45;
        mom.pos.set(-2.5, 0, 64); mom.heading = 0.5; dad.pos.set(1.6, 0, 49.5); dad.heading = Math.PI - 0.3;
        const spots = [[-17, 50], [-12, 62], [-18, 75], [-16, 89], [17, 50], [18, 68], [12, 88], [-3, 53], [4, 64], [15, 78], [-10, 84], [0, 89]];
        spots.sort(() => Math.random() - 0.5).slice(0, 8).forEach(([x, z]) => addTreat(x + (Math.random() - 0.5) * 3, z + (Math.random() - 0.5) * 2));
        addTreat(0, 90.5, 50, true); // hidden behind the house
        this.found = 0; this.stage = 0; this.wakeT = -1;
        $('prompt').textContent = isTouch ? 'Tap to wake Bronson' : 'Press any key to wake Bronson';
        input.any = false;
      },
      onTreat(t) { if (!t.golden) this.found++; },
      objective() {
        if (this.stage === 0) return [`Sniff out the morning treats`, `${this.found} / 8 treats` + (treats.some(t => t.golden && !t.taken) ? '  •  a golden one is hiding behind the house' : '')];
        return ['Dad has the leash! Meet him at the front gate.', 'Walk time!'];
      },
      update(dt) {
        if (player.mode === 'sleeping') {
          if (G.state === 'play') $('prompt').classList.add('on');
          if (Math.random() < dt * 1.2) fx(B.head.getWorldPosition(new V3()).add(new V3(0.2, 0.4, 0)), { tex: zTex, add: false, color: 0xe8f0ff, vy: 0.6, vx: 0.3, life: 1.8, size: 0.35 });
          if (input.any && G.state === 'play') { player.mode = 'waking'; this.wakeT = 0; $('prompt').classList.remove('on'); Sound.sfx.whistle(); }
          return;
        }
        if (player.mode === 'waking') {
          this.wakeT += dt; const k = this.wakeT;
          B.sleep = Math.max(0, 1 - k * 2); B.lie = Math.max(0, 1 - Math.max(0, k - 0.3) * 1.5);
          B.bow = k > 0.9 && k < 2.0 ? Math.sin((k - 0.9) / 1.1 * Math.PI) : 0;
          if (k > 2.0) { player.mode = 'free'; B.bow = 0; toast('Good morning, Bronson! Find those treats.'); G.elapsed = 0; }
          return;
        }
        if (this.stage === 0 && this.found >= 8) { this.stage = 1; Sound.sfx.chime(); toast('All treats found! Dad is waiting at the gate.'); dad.wave = 1; }
        if (this.stage === 1) {
          setBeacon(dad.pos);
          facePoint(dad, player.pos, dt);
          if (player.pos.distanceTo(dad.pos) < 2.4) complete(Math.max(0, Math.round(90 - G.elapsed)) * 2);
        } else {
          const n = treats.filter(t => !t.taken && !t.golden).sort((a, b) => (a.x - player.pos.x) ** 2 + (a.z - player.pos.z) ** 2 - ((b.x - player.pos.x) ** 2 + (b.z - player.pos.z) ** 2))[0];
          setBeacon(n ? new V3(n.x, 0, n.z) : null);
        }
        facePoint(mom, player.pos, dt);
      },
    },
    { // 2 ---------------------------------------------------------------
      name: 'Walkies to the Lake', tag: 'Chapter 2', tod: 'noon', music: 'walk', goal: 'Lead Mom and Dad down the trail through every checkpoint ring to the end of the dock.', timer: 55,
      setup() {
        player.pos.set(0, 0, 43); player.pos.y = floorAt(0, 43); player.heading = Math.PI; player.mode = 'free';
        cam.yaw = 0; cam.pitch = 0.4;
        dad.pos.set(1.6, 0, 46.5); dad.heading = Math.PI; mom.pos.set(-1.0, 0, 47.2); mom.heading = Math.PI;
        leash.visible = true;
        const fr = [0.13, 0.27, 0.41, 0.55, 0.69, 0.84];
        this.rings = fr.map(f => { const p = World.pathCurve.getPointAt(f), t = World.pathCurve.getTangentAt(f); return { p: new V3(p.x, groundH(p.x, p.z), p.z), ang: Math.atan2(t.x, t.z) }; });
        this.rings.push({ p: P.dockEnd.clone(), ang: Math.PI, final: true });
        this.ringMeshes = this.rings.map(r => {
          const g = new THREE.Group(); g.position.copy(r.p); g.rotation.y = r.ang;
          const m = new THREE.Mesh(new THREE.TorusGeometry(1.9, 0.12, 10, 40), new THREE.MeshStandardMaterial({ color: r.final ? 0xffd24a : 0x5fd1ff, emissive: r.final ? 0xffb020 : 0x2aa8ff, emissiveIntensity: 1.2, transparent: true, opacity: 0.9 }));
          m.position.y = 1.7; g.add(m); scene.add(g); return g;
        });
        this.next = 0;
        for (let i = 0; i < 18; i++) { const f = 0.04 + i * 0.053, p = World.pathCurve.getPointAt(Math.min(0.99, f)), t = World.pathCurve.getTangentAt(Math.min(0.99, f)), o = (i % 3 - 1) * 1.1; addTreat(p.x + t.z * o, p.z - t.x * o); }
        // bonus treats off the trail
        addTreat(-24, 4, 40, true); addTreat(22, -48, 40, true);
        const spots = (P.treeSpots || []).slice().sort(() => Math.random() - 0.5).slice(0, 6);
        spots.forEach(tr => { const a = Math.random() * 6; const home = new V3(tr.x + Math.cos(a) * 7, 0, tr.z + Math.sin(a) * 7); if (World.lakeE(home.x, home.z) > 1.15) addSquirrel(tr, home); });
      },
      teardown() { (this.ringMeshes || []).forEach(m => scene.remove(m)); leash.visible = false; },
      objective() { const left = this.rings.length - this.next; return [this.next >= this.rings.length - 1 ? 'Run to the end of the dock!' : 'Follow the trail through the checkpoint rings', `Ring ${Math.min(this.next + 1, this.rings.length)} of ${this.rings.length}  •  each ring adds time` + (left ? '' : '')]; },
      update(dt) {
        const r = this.rings[this.next];
        this.ringMeshes.forEach((m, i) => { m.visible = i >= this.next; m.children[0].material.opacity = i === this.next ? 0.95 : 0.25; m.children[0].rotation.z += dt * (i === this.next ? 1.5 : 0.3); });
        if (r) {
          setBeacon(r.p, r.final ? 0xffd24a : 0x5fd1ff);
          if (Math.hypot(player.pos.x - r.p.x, player.pos.z - r.p.z) < 2.3) {
            this.next++; Sound.sfx.chime(); burst(r.p.clone().add(new V3(0, 1.7, 0)), r.final ? 0xffd24a : 0x5fd1ff, 30, 4, 0.4);
            if (r.final) { complete(Math.round(G.timer) * 3); return; }
            G.timer += 9; addScore(15); pop(r.p.clone().add(new V3(0, 2, 0)), 'Checkpoint! +9s', 'bonus'); G.happyT = 1.2;
          }
        }
        // Dad holds the leash: he follows, and can't fall more than 4.5 m behind
        const fx_ = Math.sin(player.heading), fz_ = Math.cos(player.heading);
        const back = new V3(player.pos.x - fx_ * 2.3 + fz_ * 1.5, 0, player.pos.z - fz_ * 2.3 - fx_ * 1.5);
        stepToward(dad, back, Math.max(3, player.spd * 1.05 + 0.5), dt, 0.4);
        const dv = new V3().subVectors(dad.pos, player.pos); dv.y = 0;
        if (dv.length() > 4.5) { dv.setLength(4.5); dad.pos.x = player.pos.x + dv.x; dad.pos.z = player.pos.z + dv.z; dad.pos.y = floorAt(dad.pos.x, dad.pos.z); }
        const side = new V3(player.pos.x - fx_ * 2.6 - fz_ * 1.6, 0, player.pos.z - fz_ * 2.6 + fx_ * 1.6);
        stepToward(mom, side, Math.max(3, dad.spd * 1.1), dt, 0.3);
        if (mom.pos.distanceTo(dad.pos) > 8) { mom.pos.copy(side); mom.pos.y = floorAt(side.x, side.z); }
      },
    },
    { // 3 ---------------------------------------------------------------
      name: 'Fetch-Off at Bark Park', tag: 'Chapter 3', tod: 'afternoon', music: 'fetch', goal: 'Beat Daisy, Moose and Pepper to the ball. First to 3 fetches wins. Bark (E) at a friend carrying the ball to make them drop it!',
      setup() {
        player.pos.set(P.parkGate.x + 1, 0, P.parkGate.z + 1.5); player.pos.y = floorAt(player.pos.x, player.pos.z); player.heading = Math.PI / 2; player.mode = 'free';
        cam.yaw = -Math.PI / 2; cam.pitch = 0.36;
        dad.pos.copy(P.parkThrow); dad.pos.y = groundH(dad.pos.x, dad.pos.z); dad.heading = Math.PI / 2;
        mom.pos.set(33, 0, -9.6); mom.pos.y = groundH(33, -9.6) - 0.05; mom.heading = Math.PI; mom.sit = 1;
        friends.forEach((f, i) => { f.pos.set(P.parkThrow.x + 1.5, 0, P.parkThrow.z - 2.5 + i * 2.5); f.pos.y = groundH(f.pos.x, f.pos.z); f.heading = Math.PI / 2; f.state = 'wait'; f.sitting = true; f.stun = 0; f.score = 0; });
        this.score = 0; this.phase = 'ready'; this.t = 0; this.carrier = null; this.round = 0;
        ball.visible = true; this.ballPos = new V3(); this.ballVel = new V3();
      },
      teardown() { ball.visible = false; scene.add(ball); mom.sit = 0; friends.forEach((f, i) => parkIdle(f, i)); },
      objective() {
        const s = friends.map(f => `${f.name} ${f.score}`).join('  ');
        const msg = this.carrier === 'player' ? 'Bring the ball back to Dad!' : this.carrier ? `${this.carrier.name} has it! Bark (E) to make them drop it` : this.phase === 'loose' ? 'Get the ball!' : 'Get ready...';
        return [msg, `Bronson ${this.score}  •  ${s}  •  first to 3`];
      },
      throwBall() {
        const K = P.park, a = (Math.random() - 0.5) * 2.0, d = 10 + Math.random() * 10;
        const tx = Math.max(K.x0 + 3, Math.min(K.x1 - 3, dad.pos.x + Math.cos(a) * d)), tz = Math.max(K.z0 + 3, Math.min(K.z1 - 3, dad.pos.z + Math.sin(a) * d));
        this.from = new V3(dad.pos.x, dad.pos.y + 2.0, dad.pos.z); this.to = new V3(tx, groundH(tx, tz) + 0.08, tz); this.flight = 0; this.phase = 'flying';
        Sound.sfx.whistle();
        friends.forEach(f => { f.react = 0.35 + Math.random() * 0.6; f.sitting = false; f.state = 'wait'; });
      },
      dropBall(at) { this.carrier = null; this.phase = 'loose'; this.ballPos.copy(at); this.ballPos.y = groundH(at.x, at.z) + 0.08; scene.add(ball); ball.position.copy(this.ballPos); },
      onBark() {
        const c = this.carrier;
        if (c && c !== 'player' && player.stealCD <= 0) {
          const d = player.pos.distanceTo(c.pos);
          if (d < 5) {
            player.stealCD = 2.5; c.stun = 1.6; c.state = 'stun'; c.sitting = true;
            const at = c.pos.clone().add(new V3(Math.sin(c.heading) * 0.8, 0, Math.cos(c.heading) * 0.8));
            this.dropBall(at); pop(c.pos.clone().add(new V3(0, 1.4, 0)), `${c.name} dropped it!`, 'bonus'); Sound.sfx.point(true);
          }
        }
      },
      update(dt) {
        this.t += dt;
        const K = P.park;
        if (this.phase === 'ready') {
          ball.visible = true; dad.throwT = -1;
          const hand = new V3(); dad.arms[1].el.localToWorld(hand.set(0, -0.33, 0.04)); ball.position.copy(hand);
          if (this.t > 1.6) { this.phase = 'windup'; this.t = 0; }
        } else if (this.phase === 'windup') {
          dad.throwT = Math.min(1, this.t / 0.55);
          const hand = new V3(); dad.arms[1].el.localToWorld(hand.set(0, -0.33, 0.04)); ball.position.copy(hand);
          if (this.t > 0.42) { this.throwBall(); dad.throwT = 0.85; }
        } else if (this.phase === 'flying') {
          this.flight += dt / 1.25; const k = Math.min(1, this.flight);
          ball.position.lerpVectors(this.from, this.to, k); ball.position.y += Math.sin(k * Math.PI) * 6;
          if (k >= 1) { this.phase = 'loose'; this.ballPos.copy(this.to); Sound.sfx.thump(); dad.throwT = -1; }
        } else if (this.phase === 'loose') {
          ball.position.lerp(this.ballPos, 0.3); ball.position.y = this.ballPos.y + Math.abs(Math.sin(this.t * 6)) * 0.1 * Math.max(0, 1 - this.t * 0.2);
          if (Math.hypot(player.pos.x - this.ballPos.x, player.pos.z - this.ballPos.z) < 0.95) { this.carrier = 'player'; this.phase = 'carry'; B.mouthSlot.add(ball); ball.position.set(0, 0, 0); B.holding = true; Sound.sfx.point(true); G.happyT = 2; }
        }
        // friends
        friends.forEach(f => {
          f.stun -= dt;
          if (f.state === 'stun') { f.spd = 0; if (f.stun <= 0) { f.state = 'wait'; f.sitting = false; } return; }
          if (this.phase === 'loose' && this.carrier === null) {
            f.react -= dt;
            if (f.react <= 0) {
              const d = stepToward(f, this.ballPos, f.speed, dt, 0.1);
              if (d < 0.9 && this.carrier === null) { this.carrier = f; f.state = 'carry'; this.phase = 'carry'; f.dog.mouthSlot.add(ball); ball.position.set(0, 0, 0); Sound.sfx.point(false); }
            }
          } else if (this.carrier === f) {
            const d = stepToward(f, dad.pos, 5.6, dt, 1.6);
            if (d < 2.2) { f.score++; pop(f.pos.clone().add(new V3(0, 1.3, 0)), `${f.name} scores`, 'warn'); Sound.sfx.point(false); this.nextRound(); }
          } else if (this.phase === 'ready' || this.phase === 'windup') {
            const i = friends.indexOf(f); const spot = new V3(dad.pos.x + 1.6, 0, dad.pos.z - 2.5 + i * 2.5);
            if (stepToward(f, spot, 4, dt, 0.3) < 0.6) { f.sitting = true; facePoint(f, new V3(K.x1, 0, dad.pos.z), dt); }
          } else if (this.carrier === 'player') {
            // chase alongside Bronson, hoping he drops it
            const near = player.pos.clone().add(new V3(Math.cos(friends.indexOf(f) * 2) * 1.6, 0, Math.sin(friends.indexOf(f) * 2) * 1.6));
            stepToward(f, near, f.speed * 0.8, dt, 0.5);
          }
        });
        if (this.carrier === 'player') {
          setBeacon(dad.pos, 0x7dff9a);
          if (Math.hypot(player.pos.x - dad.pos.x, player.pos.z - dad.pos.z) < 2.3) {
            this.score++; addScore(50); B.holding = false; pop(player.pos.clone().add(new V3(0, 1.5, 0)), 'Fetch! +50', 'gold'); Sound.sfx.chime(); G.happyT = 2.5; burst(player.pos.clone().add(new V3(0, 1, 0)), 0xd4e83a, 20, 3, 0.3);
            this.nextRound();
          }
        } else if (this.phase === 'loose' || (this.carrier && this.carrier !== 'player')) setBeacon(this.phase === 'loose' ? this.ballPos : this.carrier.pos, 0xd4e83a);
        else setBeacon(null);
        dad.heading = lerpAngle(dad.heading, this.carrier ? Math.atan2((this.carrier === 'player' ? player.pos : this.carrier.pos).x - dad.pos.x, (this.carrier === 'player' ? player.pos : this.carrier.pos).z - dad.pos.z) : Math.PI / 2, 1 - Math.exp(-4 * dt));
        dad.spd = 0;
        Sound.setIntensity(Math.max(this.score, ...friends.map(f => f.score)) >= 2 ? 1 : 0);
      },
      nextRound() {
        B.holding = false; this.carrier = null; scene.add(ball);
        if (this.score >= 3) { complete(150); return; }
        const top = friends.find(f => f.score >= 3);
        if (top) { fail(`${top.name} won the fetch-off this time. Try barking at whoever has the ball!`); return; }
        this.phase = 'ready'; this.t = 0; this.round++;
      },
    },
    { // 4 ---------------------------------------------------------------
      name: 'Sunset Snooze', tag: 'Chapter 4', tod: 'sunset', music: 'dusk', goal: 'The sun is going down and Bronson is sleepy. Race home to your bed before dark. Fireflies add time!', timer: 50,
      setup() {
        player.pos.set(P.park.x0 - 2.5, 0, P.park.gateZ); player.pos.y = floorAt(player.pos.x, player.pos.z); player.heading = -Math.PI / 2; player.mode = 'free';
        cam.yaw = Math.PI / 2; cam.pitch = 0.32;
        mom.pos.set(P.bed.x - 2.2, 0, P.bed.z + 1.6); mom.heading = 2.2; dad.pos.set(P.bed.x + 1.8, 0, P.bed.z + 2.2); dad.heading = -2.4; dad.wave = 0;
        [[0.86, 1], [0.72, -1], [0.6, 1], [0.48, -1], [0.36, 1], [0.24, -1], [0.12, 1]].forEach(([f, s]) => { const p = World.pathCurve.getPointAt(f), t = World.pathCurve.getTangentAt(f); addOrb(p.x + t.z * 3.5 * s, p.z - t.x * 3.5 * s); });
        addOrb(12, -21); addOrb(-20, 30);
        for (let i = 0; i < 10; i++) { const f = 0.05 + i * 0.05, p = World.pathCurve.getPointAt(f); addTreat(p.x, p.z); }
      },
      objective() { return ['Get home to your bed before dark', `Fireflies caught: ${G.flags.fireflies || 0}  •  each one adds 4 seconds`]; },
      update(dt) {
        const k = Math.max(0, Math.min(1, G.elapsed / (G.elapsed + Math.max(0.01, G.timer))));
        this.todT = (this.todT || 0) - dt; if (this.todT <= 0) { this.todT = 0.2; World.applyTOD('sunset', 'night', k); }
        Sound.setIntensity(G.timer < 15 ? 1 : 0);
        setBeacon(P.bed, 0xffb36b);
        if (player.pos.distanceTo(new V3(P.bed.x, player.pos.y, P.bed.z)) < 3) { mom.wave = 1; dad.wave = 1; }
        facePoint(mom, player.pos, dt); facePoint(dad, player.pos, dt);
        if (Math.hypot(player.pos.x - P.bed.x, player.pos.z - P.bed.z) < 1.3) finale();
      },
    },
  ];

  // ---------- flow ----------
  function clearChapter() {
    if (G.ch && G.ch.teardown) G.ch.teardown();
    clearTreats(); clearSquirrels(); clearOrbs(); setBeacon(null); $('prompt').classList.remove('on');
    B.holding = false; B.lie = 0; B.sleep = 0; B.bow = 0; B.sit = 0;
  }
  function startChapter(i, keepScore) {
    clearChapter(); resetPeople();
    G.chapter = i; G.ch = CHAPTERS[i]; G.flags = {}; G.elapsed = 0; G.timer = G.ch.timer || 0;
    if (!keepScore) G.score = 0;
    G.chapterStart = G.score;
    store.set('checkpoint', { chapter: i, score: G.score });
    friends.forEach((f, k) => parkIdle(f, k));
    player.vy = 0; player.spd = 0; player.stamina = 100; player.tired = false; player.wet = false;
    G.ch.setup();
    World.applyTOD(G.ch.tod);
    renderer.toneMappingExposure = 1.05;
    cam.mode = 'follow'; cam.lastManual = -10; cam.dist = 5.4;
    camera.position.set(player.pos.x + Math.sin(cam.yaw) * 6, player.pos.y + 3, player.pos.z + Math.cos(cam.yaw) * 6); cam.target.copy(player.pos);
    Sound.play(G.ch.music); Sound.setIntensity(0);
    $('score').textContent = G.score.toLocaleString();
    $('chapLabel').textContent = `${G.ch.tag}  •  ${G.ch.name}`;
    $('timerBox').hidden = !G.ch.timer;
    showScreen(null); $('hud').hidden = false;
    $('touch').hidden = !document.body.classList.contains('touchy') && !isTouch;
    // chapter card
    $('cardTag').textContent = G.ch.tag; $('cardName').textContent = G.ch.name; $('cardGoal').textContent = G.ch.goal;
    $('card').hidden = false; $('card').classList.remove('out'); void $('card').offsetWidth; $('card').classList.add('in');
    G.state = 'card'; G.cardT = 3.2;
  }
  function complete(bonus) {
    if (G.state !== 'play') return;
    G.state = 'result'; setBeacon(null);
    addScore(bonus);
    Sound.sfx.win(); G.happyT = 4;
    const gained = G.score - G.chapterStart;
    const last = G.chapter >= CHAPTERS.length - 1;
    const extra = G.chapter === 1 && G.flags.squirrels ? `<li><span>Squirrels tagged</span><b>${G.flags.squirrels}</b></li>` : '';
    showResult('Chapter clear!', `${G.ch.name}`, `<ul class="stats"><li><span>Time bonus</span><b>+${bonus}</b></li>${extra}<li><span>Chapter points</span><b>${gained}</b></li><li><span>Total score</span><b>${G.score.toLocaleString()}</b></li></ul><p class="cp">Checkpoint saved. You can continue from the next chapter any time.</p>`, last ? 'Finish' : 'Next chapter', () => startChapter(G.chapter + 1, true));
    store.set('checkpoint', { chapter: Math.min(CHAPTERS.length - 1, G.chapter + 1), score: G.score });
  }
  function fail(msg) {
    if (G.state !== 'play') return;
    G.state = 'result'; Sound.sfx.fail(); setBeacon(null);
    showResult('Ruh-roh!', G.ch.name, `<p>${msg}</p><p class="cp">Restarting from the checkpoint at the start of this chapter.</p>`, 'Retry chapter', () => { G.score = G.chapterStart; startChapter(G.chapter, true); });
  }
  function finale() {
    if (G.state !== 'play') return;
    G.state = 'ending'; setBeacon(null); G.endT = 0; $('hud').hidden = true; $('touch').hidden = true;
    const bonus = Math.round(G.timer) * 3; addScore(bonus);
    player.mode = 'sleeping'; player.spd = 0;
    player.pos.set(P.bed.x, floorAt(P.bed.x, P.bed.z), P.bed.z);
    Sound.play('sleep'); Sound.sfx.chime();
    cam.mode = 'orbit'; cam.orbitCenter.set(P.bed.x, 0.6, P.bed.z); cam.orbitR = 4.5; cam.orbitH = 1.8; cam.orbitT = cam.yaw;
    camera.position.set(P.bed.x + Math.sin(cam.orbitT) * 6, groundH(P.bed.x, P.bed.z) + 2.6, P.bed.z + Math.cos(cam.orbitT) * 6);
    mom.sit = 1; mom.pos.set(P.bed.x - 1.6, groundH(P.bed.x, P.bed.z) - 0.4, P.bed.z + 1.2); mom.heading = 2.3; dad.sit = 1; dad.pos.set(P.bed.x + 1.5, groundH(P.bed.x, P.bed.z) - 0.4, P.bed.z + 1.5); dad.heading = -2.4; mom.wave = 0; dad.wave = 0;
    G.finalBonus = bonus;
    store.set('checkpoint', null);
  }
  function showEnding() {
    G.state = 'result';
    const best = Math.max(G.best, G.score); const isBest = G.score > G.best; G.best = best; store.set('best', best);
    showResult('Goodnight, Bronson', 'The End of a Very Big Day', `<ul class="stats"><li><span>Home-before-dark bonus</span><b>+${G.finalBonus}</b></li><li><span>Final score</span><b>${G.score.toLocaleString()}</b></li><li><span>Best score</span><b>${best.toLocaleString()}${isBest ? ' • new!' : ''}</b></li></ul><p class="cp">Good boy. Tomorrow is another big day.</p>`, 'Play again', () => startChapter(0, false), true);
  }
  function showResult(head, sub, html, btn, action, ending) {
    $('resHead').textContent = head; $('resSub').textContent = sub; $('resBody').innerHTML = html; $('resBtn').textContent = btn;
    G.resultAction = () => { G.resultAction = null; action(); };
    $('resMenu').hidden = !ending;
    showScreen('result');
  }
  $('resBtn').addEventListener('click', () => { Sound.start(); G.resultAction && G.resultAction(); });
  $('resMenu').addEventListener('click', () => toTitle());

  function showScreen(id) { ['title', 'howto', 'pause', 'result'].forEach(s => $(s).hidden = s !== id); }
  function togglePause() {
    if (G.state === 'play' || G.state === 'card') { G.prev = G.state; G.state = 'paused'; showScreen('pause'); }
    else if (G.state === 'paused') { G.state = G.prev; showScreen(null); }
  }
  function toggleMute() { const on = Sound.toggle(); $('mute').setAttribute('aria-pressed', String(!on)); $('mute').textContent = on ? 'Music on' : 'Music off'; }
  $('mute').addEventListener('click', () => { Sound.start(); toggleMute(); });
  $('pauseBtn').addEventListener('click', () => { Sound.start(); togglePause(); });
  $('resume').addEventListener('click', togglePause);
  $('restartCh').addEventListener('click', () => { G.score = G.chapterStart; startChapter(G.chapter, true); });
  $('quit').addEventListener('click', () => toTitle());

  function toTitle() {
    clearChapter(); resetPeople();
    G.state = 'title'; $('hud').hidden = true; $('touch').hidden = true; $('card').hidden = true;
    player.pos.set(P.bed.x, floorAt(P.bed.x, P.bed.z), P.bed.z); player.heading = -2.4; player.mode = 'sleeping'; B.lie = 1; B.sleep = 1;
    mom.pos.set(-2.5, 0, 64); mom.heading = 0.5; dad.pos.set(1.6, 0, 49.5); dad.heading = Math.PI - 0.3;
    friends.forEach((f, k) => parkIdle(f, k));
    World.applyTOD('morning');
    cam.mode = 'orbit'; cam.orbitCenter.set(P.bed.x, 0.8, P.bed.z); cam.orbitR = 6; cam.orbitH = 2.2;
    const cp = store.get('checkpoint', null);
    $('continue').hidden = !(cp && cp.chapter > 0);
    if (cp && cp.chapter > 0) $('continue').textContent = `Continue from ${CHAPTERS[cp.chapter].tag}`;
    $('bestLine').textContent = G.best ? `Best score: ${G.best.toLocaleString()}` : 'Four chapters. One very good boy.';
    showScreen('title'); Sound.play('title');
  }
  $('play').addEventListener('click', () => { Sound.start(); startChapter(0, false); });
  $('continue').addEventListener('click', () => { Sound.start(); const cp = store.get('checkpoint', null); if (cp) { G.score = cp.score || 0; startChapter(cp.chapter, true); } });
  $('howBtn').addEventListener('click', () => { Sound.start(); showScreen('howto'); });
  $('howBack').addEventListener('click', () => showScreen(G.state === 'paused' ? 'pause' : 'title'));
  $('howFromPause').addEventListener('click', () => showScreen('howto'));

  // ---------- HUD ----------
  const arrowEl = $('arrow'), distEl = $('dist');
  let objCache = '';
  function updateHUD(dt) {
    if (G.ch && G.ch.objective) {
      const [o, p] = G.ch.objective(); const k = o + '|' + p;
      if (k !== objCache) { objCache = k; $('objective').textContent = o; $('progress').textContent = p; }
    }
    const st = $('stam'); st.style.width = player.stamina + '%'; st.parentElement.classList.toggle('tired', player.tired);
    if (G.ch && G.ch.timer) {
      const t = Math.max(0, G.timer); $('timer').textContent = `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
      $('timerBox').classList.toggle('urgent', t < 12);
    }
    if (beaconTarget && G.state === 'play') {
      const dx = beaconTarget.x - player.pos.x, dz = beaconTarget.z - player.pos.z, d = Math.hypot(dx, dz);
      const camAng = Math.atan2(-Math.sin(cam.yaw), -Math.cos(cam.yaw)), tAng = Math.atan2(dx, dz);
      let rel = tAng - camAng; rel = Math.atan2(Math.sin(rel), Math.cos(rel));
      arrowEl.style.transform = `rotate(${-rel}rad)`; distEl.textContent = `${Math.round(d)} m`;
      $('compass').hidden = false;
    } else $('compass').hidden = true;
    if (toastT > 0) { toastT -= dt; if (toastT <= 0) $('toast').classList.remove('on'); }
  }

  // ---------- main loop ----------
  let clock = 0, last = performance.now(), tickT = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    let dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (G.state === 'paused') { renderer.render(scene, camera); return; }
    clock += dt;
    readInput();
    if (G.state === 'card') { G.cardT -= dt; if (G.cardT <= 0 || (input.any && G.cardT < 2.4 && G.chapter !== 0)) { G.state = 'play'; $('card').classList.remove('in'); $('card').classList.add('out'); setTimeout(() => { if (G.state !== 'card') $('card').hidden = true; }, 500); if (G.chapter !== 0) input.any = false; } }
    if (G.state === 'play') {
      G.elapsed += dt;
      if (G.ch.timer) {
        G.timer -= dt;
        if (G.timer < 10 && G.timer > 0) { tickT -= dt; if (tickT <= 0) { tickT = 1; Sound.sfx.tick(); } }
        if (G.timer <= 0) fail(G.chapter === 3 ? 'It got dark before Bronson made it home. He needs his beauty sleep!' : 'Bronson got distracted by a really good smell and ran out of time.');
      }
      if (G.ch.update) G.ch.update(dt);
    } else if (G.state === 'card' && G.ch && G.chapter === 0 && G.ch.update) {
      G.ch.update(dt); // keep the snoring going under the title card
    }
    G.happyT -= dt;
    updatePlayer(dt);
    updateTreats(dt); updateSquirrels(dt); updateOrbs(dt);
    // people and friends
    people.forEach(p => { if (p.wave) p.wave = Math.max(0, p.wave - dt * 0.15); syncPerson(p, dt); });
    if (G.chapter !== 2 || G.state === 'title') friends.forEach(f => wanderFriend(f, dt));
    friends.forEach(f => syncFriend(f, dt));
    updateLeash();
    if (beacon.visible && beaconTarget) { beacon.position.set(beaconTarget.x, groundH(beaconTarget.x, beaconTarget.z), beaconTarget.z); ring.scale.setScalar(1 + Math.sin(clock * 4) * 0.12); beamMat.opacity = 0.35 + Math.sin(clock * 3) * 0.1; }
    if (G.state === 'ending' || G.state === 'title' || (G.state === 'result' && G.chapter === 3 && player.mode === 'sleeping')) {
      B.lie += (1 - B.lie) * (1 - Math.exp(-2 * dt)); B.sleep += (1 - B.sleep) * (1 - Math.exp(-1.5 * dt));
      if (Math.random() < dt * 1.1) fx(B.head.getWorldPosition(new V3()).add(new V3(0.2, 0.4, 0)), { tex: zTex, add: false, color: 0xe8f0ff, vy: 0.6, vx: 0.3, life: 1.8, size: 0.35 });
    }
    if (G.state === 'ending') {
      G.endT += dt; World.applyTOD('night');
      if (G.endT > 0.5 && G.endT < 0.6) Sound.sfx.snore();
      if (G.endT > 4 && !G.endShown) { G.endShown = true; showEnding(); }
    } else G.endShown = false;
    updateFx(dt);
    updateCamera(dt);
    World.update(clock, dt, player.pos);
    if (G.state !== 'title') updateHUD(dt);
    renderer.render(scene, camera);
  }

  resize();
  toTitle();
  camera.position.set(P.bed.x + 6, 3, P.bed.z + 4);
  requestAnimationFrame(frame);
  $('loading').hidden = true;
  window.__bronson = { G, player, startChapter, CHAPTERS, cam, input, keys, treats, orbs, dad, friends }; // handy for debugging in the console
}
