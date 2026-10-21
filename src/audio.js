// Procedural music + sound effects (WebAudio). The bark is a real recording (CC0, see assets/CREDITS.md),
// inlined as base64 MP3 clips by build.js; everything else is synthesized.
const BARK_CLIPS = /*__BARKS__*/[];
const Sound = (() => {
  let ac = null, master, musicBus, sfxBus, reverb, revSend;
  let enabled = true, musicVol = 0.55;
  const tracks = {};
  let current = null, stepIdx = 0, nextTime = 0, timer = null;
  let intensity = 0; // 0..1, used by some tracks for extra layers

  const mtof = m => 440 * Math.pow(2, (m - 69) / 12);

  function init() {
    if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ac = new AC();
    master = ac.createGain(); master.gain.value = 0.9;
    const comp = ac.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4;
    master.connect(comp); comp.connect(ac.destination);
    musicBus = ac.createGain(); musicBus.gain.value = enabled ? musicVol : 0; musicBus.connect(master);
    sfxBus = ac.createGain(); sfxBus.gain.value = 0.8; sfxBus.connect(master);
    // generated impulse reverb
    reverb = ac.createConvolver();
    const len = ac.sampleRate * 2.2, ir = ac.createBuffer(2, len, ac.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = ir.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
    }
    reverb.buffer = ir;
    revSend = ac.createGain(); revSend.gain.value = 0.35;
    revSend.connect(reverb); reverb.connect(master);
    noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const nd = noiseBuf.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    timer = setInterval(schedule, 25);
    loadBarks();
  }
  let noiseBuf;
  const barkBufs = []; let lastBark = -1;
  function loadBarks() {
    BARK_CLIPS.forEach(uri => {
      try {
        const bin = atob(uri.slice(uri.indexOf(',') + 1)), u8 = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
        ac.decodeAudioData(u8.buffer, b => barkBufs.push(b), () => { lastError = 'bark decode failed'; });
      } catch (e) { lastError = String(e); }
    });
  }

  // ---------- instruments ----------
  function env(g, t, a, peak, d, sus, rel, dur) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak * sus), t + a + d);
    g.gain.setValueAtTime(Math.max(0.0001, peak * sus), t + Math.max(a + d, dur));
    g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(a + d, dur) + rel);
  }
  function out(node, dest, wet) {
    node.connect(dest);
    if (wet) { const s = ac.createGain(); s.gain.value = wet; node.connect(s); s.connect(revSend); }
  }
  function osc(type, f, t, stop) {
    const o = ac.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t);
    o.start(t); o.stop(stop); return o;
  }
  const I = {
    pad(dest, t, notes, dur, vol = 0.05, cutoff = 1400) {
      const g = ac.createGain(); const f = ac.createBiquadFilter();
      f.type = 'lowpass'; f.frequency.value = cutoff; f.Q.value = 0.5;
      env(g, t, dur * 0.3, vol, dur * 0.3, 0.8, dur * 0.5, dur * 0.7);
      notes.forEach(n => {
        [-7, 7].forEach(det => {
          const o = osc('sawtooth', mtof(n), t, t + dur * 1.3 + 0.1); o.detune.value = det; o.connect(f);
        });
      });
      f.connect(g); out(g, dest, 0.6);
    },
    pluck(dest, t, n, dur, vol = 0.12, type = 'triangle', wet = 0.3) {
      const g = ac.createGain(); env(g, t, 0.005, vol, dur * 0.8, 0.2, 0.15, 0.01);
      const o = osc(type, mtof(n), t, t + dur + 0.4); o.connect(g); out(g, dest, wet);
    },
    bell(dest, t, n, vol = 0.1) {
      const g = ac.createGain(); env(g, t, 0.004, vol, 1.2, 0.01, 0.3, 0.01);
      const o1 = osc('sine', mtof(n), t, t + 2); o1.connect(g);
      const g2 = ac.createGain(); env(g2, t, 0.002, vol * 0.4, 0.3, 0.01, 0.1, 0.01);
      const o2 = osc('sine', mtof(n) * 3.01, t, t + 1); o2.connect(g2); g2.connect(g);
      out(g, dest, 0.5);
    },
    lead(dest, t, n, dur, vol = 0.07, type = 'square', vib = true) {
      const g = ac.createGain(); env(g, t, 0.02, vol, 0.1, 0.7, 0.12, dur);
      const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 2600;
      const o = osc(type, mtof(n), t, t + dur + 0.3);
      if (vib) { const l = osc('sine', 5.5, t, t + dur + 0.3); const lg = ac.createGain(); lg.gain.value = 6; l.connect(lg); lg.connect(o.detune); }
      o.connect(f); f.connect(g); out(g, dest, 0.35);
    },
    brass(dest, t, notes, dur, vol = 0.05) {
      const g = ac.createGain(); env(g, t, 0.03, vol, 0.15, 0.6, 0.15, dur);
      const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = 3;
      f.frequency.setValueAtTime(400, t); f.frequency.linearRampToValueAtTime(2800, t + 0.06); f.frequency.exponentialRampToValueAtTime(900, t + dur + 0.1);
      notes.forEach(n => { const o = osc('sawtooth', mtof(n), t, t + dur + 0.3); o.connect(f); });
      f.connect(g); out(g, dest, 0.3);
    },
    bass(dest, t, n, dur, vol = 0.16, type = 'sawtooth', cutoff = 500) {
      const g = ac.createGain(); env(g, t, 0.008, vol, dur * 0.6, 0.5, 0.06, dur * 0.8);
      const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = cutoff;
      const o = osc(type, mtof(n), t, t + dur + 0.2); o.connect(f); f.connect(g); out(g, dest, 0);
    },
    kick(dest, t, vol = 0.5) {
      const g = ac.createGain(); env(g, t, 0.002, vol, 0.25, 0.01, 0.05, 0.01);
      const o = osc('sine', 150, t, t + 0.4); o.frequency.exponentialRampToValueAtTime(42, t + 0.14);
      o.connect(g); out(g, dest, 0);
    },
    noise(dest, t, dur, vol, ftype, freq, q = 1, wet = 0.15) {
      const s = ac.createBufferSource(); s.buffer = noiseBuf;
      const f = ac.createBiquadFilter(); f.type = ftype; f.frequency.value = freq; f.Q.value = q;
      const g = ac.createGain(); env(g, t, 0.002, vol, dur, 0.01, 0.03, 0.01);
      s.connect(f); f.connect(g); out(g, dest, wet); s.start(t); s.stop(t + dur + 0.1);
    },
    snare(dest, t, vol = 0.22) {
      I.noise(dest, t, 0.16, vol, 'bandpass', 1800, 0.8, 0.25);
      const g = ac.createGain(); env(g, t, 0.002, vol * 0.6, 0.08, 0.01, 0.02, 0.01);
      const o = osc('triangle', 190, t, t + 0.2); o.connect(g); out(g, dest, 0);
    },
    hat(dest, t, vol = 0.05, open = false) { I.noise(dest, t, open ? 0.2 : 0.04, vol, 'highpass', 7500, 1, 0.05); },
    tom(dest, t, f0 = 110, vol = 0.35) {
      const g = ac.createGain(); env(g, t, 0.003, vol, 0.5, 0.01, 0.1, 0.01);
      const o = osc('sine', f0, t, t + 0.8); o.frequency.exponentialRampToValueAtTime(f0 * 0.55, t + 0.4);
      o.connect(g); out(g, dest, 0.3);
    },
  };

  // ---------- tracks ----------
  // each track: bpm, step(i, t, sd, dest)  (i = 16th note index)
  const chordTones = (root, minor) => [root, root + (minor ? 3 : 4), root + 7];
  function defTrack(name, bpm, step) { tracks[name] = { name, bpm, step, bus: null }; }

  // Title: warm, adventurous (F major)
  defTrack('title', 100, (i, t, sd, d) => {
    const prog = [[53, 0], [48, 0], [50, 1], [46, 0]];
    const bar = Math.floor(i / 16) % 4, s = i % 16, [r, m] = prog[bar], ct = chordTones(r, m);
    if (s === 0) { I.pad(d, t, ct.map(n => n + 12), sd * 16, 0.035); I.bass(d, t, r - 12, sd * 6, 0.14); }
    if (s === 10) I.bass(d, t, r - 5, sd * 4, 0.1);
    const arp = [0, 1, 2, 1, 0, 2, 1, 2];
    if (s % 2 === 0) I.bell(d, t, ct[arp[(s / 2) % 8]] + 24 + (s === 12 ? 2 : 0), 0.05);
    const mel = [77, null, 76, 74, 72, null, 74, null, 76, null, 77, 79, 81, null, null, null];
    if (bar % 2 === 1 && s % 2 === 0 && mel[s] !== undefined && mel[s] !== null) I.lead(d, t, mel[s] - 12 + (bar === 3 ? -2 : 0), sd * 2, 0.04, 'triangle');
    if (s === 0 || s === 8) I.kick(d, t, 0.25);
    if (s === 4 || s === 12) I.snare(d, t, 0.06);
    if (s % 2 === 1) I.hat(d, t, 0.02);
  });

  // Home morning: gentle, bouncy (C major)
  defTrack('home', 92, (i, t, sd, d) => {
    const prog = [[48, 0], [45, 1], [41, 0], [43, 0]];
    const bar = Math.floor(i / 16) % 4, s = i % 16, [r, m] = prog[bar], ct = chordTones(r, m);
    if (s === 0) { I.pad(d, t, ct.map(n => n + 12), sd * 16, 0.03, 1000); I.bass(d, t, r - 12, sd * 3, 0.13, 'triangle', 800); }
    if (s === 6) I.bass(d, t, r - 12, sd * 2, 0.1, 'triangle', 800);
    if (s === 8) I.bass(d, t, r - 5, sd * 3, 0.11, 'triangle', 800);
    if (s % 2 === 0) { const arp = [0, 2, 1, 2]; I.pluck(d, t, ct[arp[(s / 2) % 4]] + 24, sd * 2, 0.07); }
    const mel = [[72, 74, 76, null, 79, null, 76, null], [76, null, 72, null, 69, null, null, null], [69, 72, 77, null, 76, 74, 72, null], [74, null, 71, null, 67, null, null, null]];
    if (s % 2 === 0 && Math.floor(i / 64) % 2 === 1) { const n = mel[bar][s / 2]; if (n) I.lead(d, t, n, sd * 2.2, 0.035, 'sine'); }
    if (s === 0 || s === 8) I.kick(d, t, 0.18);
    if (s % 4 === 2) I.hat(d, t, 0.025);
  });

  // Walk: upbeat strut (G major)
  defTrack('walk', 118, (i, t, sd, d) => {
    const prog = [[43, 0], [38, 0], [40, 1], [36, 0]];
    const bar = Math.floor(i / 16) % 4, s = i % 16, [r, m] = prog[bar], ct = chordTones(r, m);
    const bp = [0, null, 7, null, 12, null, 7, 0, null, 0, 7, null, 12, 10, 7, null];
    if (bp[s] !== null) I.bass(d, t, r - 12 + bp[s], sd * 1.6, 0.15, 'square', 700);
    if (s === 0 || s === 8) I.pad(d, t, ct.map(n => n + 12), sd * 7, 0.025);
    if (s === 2 || s === 6 || s === 10 || s === 14) I.pluck(d, t, ct[1] + 24, sd, 0.05, 'square', 0.1);
    if (s === 0 || s === 7 || s === 10) I.kick(d, t, 0.42);
    if (s === 4 || s === 12) I.snare(d, t, 0.18);
    I.hat(d, t, s % 2 ? 0.02 : 0.04, s === 14);
    const phrase = Math.floor(i / 64) % 2;
    const mel = phrase === 0
      ? [[79, null, 81, 83, null, 81, 79, null], [78, null, 74, null, 76, 78, null, null], [79, 81, 83, null, 86, null, 83, null], [81, null, 79, null, 76, null, null, null]]
      : [[83, null, 86, null, 83, 81, 79, null], [81, 79, 78, null, 74, null, null, null], [76, 78, 79, null, 83, null, 81, 79], [79, null, null, null, 74, 76, 78, null]];
    if (s % 2 === 0) { const n = mel[bar][s / 2]; if (n) I.lead(d, t, n - 12, sd * 1.8, 0.045, 'square'); }
  });

  // Fetch-off: dramatic, driving (D minor)
  defTrack('fetch', 138, (i, t, sd, d) => {
    const prog = [[50, 1], [46, 0], [48, 0], [45, 0]];
    const bar = Math.floor(i / 16) % 4, s = i % 16, [r, m] = prog[bar], ct = chordTones(r, m);
    I.bass(d, t, r - 12 + (s % 4 === 2 ? 12 : 0), sd * 0.9, 0.15, 'sawtooth', 600 + intensity * 600);
    const stab = [1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 1, 0, 1, 0, 0, 0];
    if (stab[s]) I.brass(d, t, ct.map(n => n + 12), sd * 1.2, 0.04);
    if (s % 1 === 0) I.pluck(d, t, ct[(s >> 1) % 3] + 24 + (s % 2 ? 12 : 0), sd * 0.6, 0.035, 'sawtooth', 0.1);
    if (s === 0 || s === 6 || s === 8 || s === 11) I.kick(d, t, 0.5);
    if (s === 4 || s === 12) I.snare(d, t, 0.25);
    if (bar === 3 && s >= 8) I.snare(d, t, 0.08 + (s - 8) * 0.02);
    if (s === 0 && bar === 0) I.tom(d, t, 70, 0.5);
    if (bar === 3 && (s === 12 || s === 14)) I.tom(d, t, s === 12 ? 130 : 100, 0.3);
    I.hat(d, t, 0.03 + (s % 4 === 2 ? 0.03 : 0));
    if (Math.floor(i / 64) % 2 === 1 && s % 4 === 0) {
      const mel = [[74, 77, 81, 79], [77, 74, 70, 74], [72, 76, 79, 76], [73, 76, 79, 81]];
      I.lead(d, t, mel[bar][s / 4], sd * 3.6, 0.04, 'sawtooth');
    }
  });

  // Dusk race home: tense pulse (A minor), more layers when intensity rises
  defTrack('dusk', 108, (i, t, sd, d) => {
    const prog = [[45, 1], [41, 0], [48, 0], [43, 0]];
    const bar = Math.floor(i / 16) % 4, s = i % 16, [r, m] = prog[bar], ct = chordTones(r, m);
    if (s === 0) I.pad(d, t, ct.map(n => n + 12), sd * 16, 0.03, 900 + intensity * 1200);
    if (s % 2 === 0) I.bass(d, t, r - 12, sd * 1.2, 0.12, 'square', 400 + intensity * 500);
    if (s === 0 || s === 3) I.kick(d, t, 0.32); // heartbeat
    if (s % 4 === 2) I.hat(d, t, 0.035); // clock tick
    if (intensity > 0.5) { if (s % 2 === 1) I.hat(d, t, 0.025); if (s === 4 || s === 12) I.snare(d, t, 0.12); }
    const arp = [0, 1, 2, 1];
    if (s % 2 === 0) I.pluck(d, t, ct[arp[(s / 2) % 4]] + 24, sd * 2, 0.045, 'triangle', 0.4);
    if (Math.floor(i / 64) % 2 === 1 && s % 4 === 0) {
      const mel = [[76, 74, 72, 71], [72, null, 69, null], [72, 74, 76, 79], [74, null, 71, null]];
      const n = mel[bar][s / 4]; if (n) I.lead(d, t, n, sd * 3.5, 0.035, 'triangle');
    }
  });

  // Duck hunt: misty marsh with a hunting-horn call (E minor); intensity adds drums while a duck is down
  defTrack('lake', 100, (i, t, sd, d) => {
    const prog = [[40, 1], [36, 0], [43, 0], [38, 0]];
    const bar = Math.floor(i / 16) % 4, s = i % 16, [r, m] = prog[bar], ct = chordTones(r, m);
    if (s === 0) { I.pad(d, t, ct.map(n => n + 12), sd * 16, 0.032, 800 + intensity * 900); I.bass(d, t, r - 12, sd * 6, 0.13, 'triangle', 600); }
    if (s === 8) I.bass(d, t, r - 5, sd * 5, 0.1, 'triangle', 600);
    if (s % 4 === 2) I.pluck(d, t, ct[(s >> 2) % 3] + 24, sd * 3, 0.04, 'triangle', 0.5);
    if (s === 0 || s === 10) I.tom(d, t, 75, 0.22 + intensity * 0.15);
    if (intensity > 0.5) { if (s === 4 || s === 12) I.snare(d, t, 0.1); if (s % 2 === 0) I.hat(d, t, 0.025); if (s === 6 || s === 8) I.kick(d, t, 0.3); }
    if (Math.floor(i / 64) % 2 === 1 && s % 4 === 0) {
      const mel = [[64, 67, 71, null], [72, 71, 67, null], [67, 71, 74, 76], [74, null, 71, null]];
      const n = mel[bar][s / 4]; if (n) I.brass(d, t, [n - 12, n - 5], sd * 3.4, 0.032);
    }
  });

  // Picnic: sunny and playful (Bb major); intensity adds a skipping counter-melody while a thief is close
  defTrack('picnic', 112, (i, t, sd, d) => {
    const prog = [[46, 0], [43, 1], [39, 0], [41, 0]];
    const bar = Math.floor(i / 16) % 4, s = i % 16, [r, m] = prog[bar], ct = chordTones(r, m);
    const bp = [0, null, null, 7, null, null, 12, null, 0, null, 7, null, 12, null, 7, null];
    if (bp[s] !== null) I.bass(d, t, r - 12 + bp[s], sd * 1.8, 0.12, 'triangle', 900);
    if (s % 2 === 0) I.pluck(d, t, ct[[0, 1, 2, 1, 2, 1, 0, 2][(s / 2) % 8]] + 24, sd * 1.5, 0.055, 'triangle', 0.15);
    if (s === 0 || s === 8) I.kick(d, t, 0.25);
    if (s === 4 || s === 12) I.snare(d, t, 0.08);
    if (s % 2 === 1) I.hat(d, t, 0.018);
    const mel = [[74, null, 77, 79, 82, null, 79, null], [79, 77, 75, null, 74, null, null, null], [75, null, 79, 82, 84, null, 82, 79], [77, null, 81, null, 82, null, null, null]];
    if (Math.floor(i / 64) % 2 === 1 && s % 2 === 0) { const n = mel[bar][s / 2]; if (n) I.lead(d, t, n - 12, sd * 1.9, 0.035, 'sine'); }
    if (intensity > 0.5 && s % 2 === 0) I.pluck(d, t, ct[(s >> 1) % 3] + 36, sd, 0.03, 'square', 0.1);
  });

  // Sleep lullaby: music box (F major)
  defTrack('sleep', 66, (i, t, sd, d) => {
    const prog = [[41, 0], [46, 0], [48, 0], [41, 0], [38, 1], [46, 0], [48, 0], [41, 0]];
    const bar = Math.floor(i / 16) % 8, s = i % 16, [r, m] = prog[bar], ct = chordTones(r, m);
    if (s === 0) { I.pad(d, t, ct.map(n => n + 12), sd * 16, 0.025, 700); I.pluck(d, t, r - 12 + 12, sd * 8, 0.06, 'sine', 0.5); }
    const mel = [[77, null, 81, null, 84, null, 81, null], [82, null, 81, null, 79, null, null, null], [79, null, 82, null, 81, 79, 76, null], [77, null, null, null, null, null, null, null],
      [74, null, 77, null, 81, null, 77, null], [79, null, 77, null, 74, null, 70, null], [72, null, 76, null, 79, null, 76, 72], [77, null, null, null, null, null, null, null]];
    if (s % 2 === 0) { const n = mel[bar][s / 2]; if (n) I.bell(d, t, n, 0.07); }
    if (s % 4 === 2) I.bell(d, t, ct[(s >> 2) % 3] + 24, 0.02);
  });

  function schedule() {
    if (!ac || !current) return;
    const tr = tracks[current];
    const sd = 60 / tr.bpm / 4;
    while (nextTime < ac.currentTime + 0.15) {
      if (nextTime < ac.currentTime - 0.2) nextTime = ac.currentTime + 0.02;
      try { tr.step(stepIdx, nextTime, sd, tr.bus); } catch (e) { lastError = String(e && e.stack || e); } // keep music alive
      stepIdx++; nextTime += sd;
    }
  }

  function play(name) {
    if (!ac || current === name) { if (!ac) pending = name; return; }
    const now = ac.currentTime;
    if (current && tracks[current].bus) {
      const b = tracks[current].bus; b.gain.cancelScheduledValues(now);
      b.gain.setValueAtTime(b.gain.value, now); b.gain.linearRampToValueAtTime(0, now + 1.2);
      setTimeout(() => b.disconnect(), 4000);
    }
    const tr = tracks[name]; if (!tr) { current = null; return; }
    tr.bus = ac.createGain(); tr.bus.gain.setValueAtTime(0, now); tr.bus.gain.linearRampToValueAtTime(1, now + 0.8);
    tr.bus.connect(musicBus);
    current = name; stepIdx = 0; nextTime = now + 0.1;
  }
  let pending = null, lastError = null;
  // Mobile unlock: resume the context inside a user gesture, play a tiny buffer, and keep a silent
  // <audio> element running so iPhones route Web Audio through the media channel (ignores the silent switch).
  let silentEl = null;
  function silentWav() {
    const n = 4000, buf = new Uint8Array(44 + n), dv = new DataView(buf.buffer), w = (o, s) => [...s].forEach((c, i) => buf[o + i] = c.charCodeAt(0));
    w(0, 'RIFF'); dv.setUint32(4, 36 + n, true); w(8, 'WAVEfmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
    dv.setUint32(24, 8000, true); dv.setUint32(28, 8000, true); dv.setUint16(32, 1, true); dv.setUint16(34, 8, true); w(36, 'data'); dv.setUint32(40, n, true);
    buf.fill(128, 44);
    let s = ''; buf.forEach(b => s += String.fromCharCode(b)); return 'data:audio/wav;base64,' + btoa(s);
  }
  function unlock() {
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) { /* not supported */ }
    try {
      if (!silentEl) { silentEl = document.createElement('audio'); silentEl.setAttribute('playsinline', ''); silentEl.setAttribute('x-webkit-airplay', 'deny'); silentEl.loop = true; silentEl.preload = 'auto'; silentEl.src = silentWav(); }
      if (silentEl.paused) { const p = silentEl.play(); if (p && p.catch) p.catch(() => { }); }
    } catch (e) { /* media element blocked; Web Audio may still work */ }
    if (!ac) return;
    if (ac.state !== 'running') { const r = ac.resume(); if (r && r.catch) r.catch(() => { }); }
    try { const b = ac.createBuffer(1, 1, 22050), s = ac.createBufferSource(); s.buffer = b; s.connect(ac.destination); s.start(0); } catch (e) { /* ignore */ }
  }
  function start() { init(); unlock(); if (pending) { const p = pending; pending = null; play(p); } }

  // ---------- SFX ----------
  const sfx = {
    // o.rate < 1 deepens the voice (Bronson is a big dog); friends pass their own rate and volume
    bark(o = {}) {
      if (!ac) return; const t = ac.currentTime;
      if (barkBufs.length) {
        const twice = o.twice !== undefined ? o.twice : Math.random() < 0.3;
        [0, 0.24].slice(0, twice ? 2 : 1).forEach((dt, k) => {
          let i = Math.floor(Math.random() * barkBufs.length); if (i === lastBark && barkBufs.length > 1) i = (i + 1) % barkBufs.length; lastBark = i;
          const src = ac.createBufferSource(); src.buffer = barkBufs[i];
          src.playbackRate.value = (o.rate || 0.78) * (1 + (Math.random() - 0.5) * 0.06) * (k ? 1.03 : 1);
          const body = ac.createBiquadFilter(); body.type = 'lowshelf'; body.frequency.value = 260; body.gain.value = o.rate && o.rate > 0.95 ? 0 : 5;
          const g = ac.createGain(); g.gain.value = (o.vol || 1) * (k ? 0.8 : 1) * 1.4;
          src.connect(body); body.connect(g);
          if (o.pan && ac.createStereoPanner) { const p = ac.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, o.pan)); g.connect(p); out(p, sfxBus, 0.12); } else out(g, sfxBus, 0.12);
          src.start(t + dt);
        });
        return;
      }
      [0, 0.17].forEach((o, k) => {
        const tt = t + o, g = ac.createGain(); env(g, tt, 0.005, 0.5, 0.11, 0.05, 0.05, 0.01);
        const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = 1.4;
        const s = osc('sawtooth', 430 - k * 40, tt, tt + 0.25); s.frequency.exponentialRampToValueAtTime(210, tt + 0.13);
        s.connect(f); f.connect(g); out(g, sfxBus, 0.2);
        I.noise(sfxBus, tt, 0.07, 0.25, 'bandpass', 1300, 1, 0.1);
      });
    },
    treat() {
      if (!ac) return; const t = ac.currentTime;
      I.noise(sfxBus, t, 0.05, 0.25, 'bandpass', 3000, 2, 0);
      I.noise(sfxBus, t + 0.07, 0.04, 0.2, 'bandpass', 2400, 2, 0);
      [84, 88, 91].forEach((n, k) => I.bell(sfxBus, t + 0.05 + k * 0.06, n, 0.06));
    },
    chime() { if (!ac) return; const t = ac.currentTime; [72, 76, 79, 84].forEach((n, k) => I.bell(sfxBus, t + k * 0.09, n, 0.09)); },
    win() {
      if (!ac) return; const t = ac.currentTime;
      [60, 64, 67, 72, 76, 79, 84].forEach((n, k) => I.pluck(sfxBus, t + k * 0.07, n, 0.3, 0.1, 'square', 0.3));
      I.brass(sfxBus, t + 0.5, [60, 64, 67, 72], 1.2, 0.07);
    },
    fail() { if (!ac) return; const t = ac.currentTime; [67, 63, 60, 55].forEach((n, k) => I.lead(sfxBus, t + k * 0.22, n, 0.25, 0.07, 'triangle', false)); },
    jump() { if (!ac) return; const t = ac.currentTime; const g = ac.createGain(); env(g, t, 0.005, 0.08, 0.12, 0.01, 0.02, 0.01); const o = osc('sine', 300, t, t + 0.2); o.frequency.exponentialRampToValueAtTime(700, t + 0.12); o.connect(g); out(g, sfxBus, 0); },
    splash() { if (!ac) return; const t = ac.currentTime; I.noise(sfxBus, t, 0.35, 0.3, 'lowpass', 1400, 0.7, 0.3); I.noise(sfxBus, t + 0.05, 0.25, 0.15, 'bandpass', 3000, 0.7, 0.3); },
    squeak() { if (!ac) return; const t = ac.currentTime; const g = ac.createGain(); env(g, t, 0.003, 0.06, 0.08, 0.01, 0.02, 0.01); const o = osc('sine', 1800, t, t + 0.15); o.frequency.exponentialRampToValueAtTime(2600, t + 0.06); o.connect(g); out(g, sfxBus, 0.1); },
    whistle() { if (!ac) return; const t = ac.currentTime; const g = ac.createGain(); env(g, t, 0.02, 0.08, 0.2, 0.8, 0.1, 0.35); const o = osc('sine', 1500, t, t + 0.6); o.frequency.linearRampToValueAtTime(2200, t + 0.15); o.frequency.linearRampToValueAtTime(1700, t + 0.4); o.connect(g); out(g, sfxBus, 0.2); },
    point(good) { if (!ac) return; const t = ac.currentTime; (good ? [76, 81, 88] : [64, 60]).forEach((n, k) => I.pluck(sfxBus, t + k * 0.08, n, 0.2, 0.09, 'square', 0.2)); },
    thump() { if (!ac) return; I.tom(sfxBus, ac.currentTime, 90, 0.4); },
    step(vol = 0.03) { if (!ac) return; I.noise(sfxBus, ac.currentTime, 0.03, vol, 'lowpass', 600, 1, 0); },
    tick() { if (!ac) return; I.noise(sfxBus, ac.currentTime, 0.02, 0.08, 'highpass', 5000, 1, 0); },
    shutter() { if (!ac) return; const t = ac.currentTime; I.noise(sfxBus, t, 0.025, 0.3, 'highpass', 2500, 1, 0); I.noise(sfxBus, t + 0.07, 0.04, 0.22, 'bandpass', 1800, 1, 0.02); },
    snore() { if (!ac) return; const t = ac.currentTime; I.noise(sfxBus, t, 0.9, 0.05, 'lowpass', 300, 2, 0.2); },
    // distant shotgun: sharp crack, low boom and a long lake echo
    shot() { if (!ac) return; const t = ac.currentTime; I.noise(sfxBus, t, 0.08, 0.5, 'highpass', 1200, 0.7, 0.6); I.noise(sfxBus, t, 0.5, 0.45, 'lowpass', 420, 0.8, 0.7); I.tom(sfxBus, t, 70, 0.5); I.noise(sfxBus, t + 0.35, 0.6, 0.06, 'bandpass', 600, 0.6, 0.8); },
    quack(o = {}) {
      if (!ac) return; const t = ac.currentTime + (o.delay || 0);
      const g = ac.createGain(); env(g, t, 0.01, (o.vol || 0.12), 0.12, 0.4, 0.05, 0.1);
      const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1100; f.Q.value = 3;
      const s = osc('sawtooth', 330 * (o.pitch || 1), t, t + 0.25); s.frequency.exponentialRampToValueAtTime(220 * (o.pitch || 1), t + 0.18);
      s.connect(f); f.connect(g); out(g, sfxBus, 0.2);
    },
    gull() {
      if (!ac) return; const t = ac.currentTime;
      [0, 0.22, 0.42].forEach((o, k) => { const g = ac.createGain(); env(g, t + o, 0.02, 0.05, 0.15, 0.3, 0.05, 0.12); const s = osc('triangle', 1400 - k * 80, t + o, t + o + 0.3); s.frequency.exponentialRampToValueAtTime(900, t + o + 0.2); const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1500; f.Q.value = 2; s.connect(f); f.connect(g); out(g, sfxBus, 0.3); });
    },
    whoosh() { if (!ac) return; const t = ac.currentTime; const s = ac.createBufferSource(); s.buffer = noiseBuf; const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 2; f.frequency.setValueAtTime(500, t); f.frequency.exponentialRampToValueAtTime(2200, t + 0.35); const g = ac.createGain(); env(g, t, 0.05, 0.12, 0.3, 0.2, 0.1, 0.3); s.connect(f); f.connect(g); out(g, sfxBus, 0.1); s.start(t); s.stop(t + 0.7); },
  };

  return {
    start, play, sfx,
    setIntensity(v) { intensity = v; },
    toggle() { enabled = !enabled; if (musicBus) musicBus.gain.setTargetAtTime(enabled ? musicVol : 0, ac.currentTime, 0.1); if (sfxBus) sfxBus.gain.setTargetAtTime(enabled ? 0.8 : 0, ac.currentTime, 0.1); return enabled; },
    get enabled() { return enabled; },
    debug() { return { state: ac && ac.state, current, stepIdx, lastError }; },
  };
})();
