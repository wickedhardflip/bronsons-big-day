// Lake Haigler Dash: recorded runs ("tracks"), playing them back as rivals, progress around the lap,
// and the pre-recorded runs of the three starter dogs. Pure logic (no scene objects), so the game,
// the tests and the leaderboard Worker all read and write the same track format.
//
// A track is one frame every 0.1 s: [x, y, z, heading, speed, flags]. On the wire it is base64 of
// little-endian int16s, five per frame: x/0.02, y/0.01, z/0.02, heading*10000, (speed*10 & 0xff) | flags << 8.
// It is meant to be reusable as-is for live races later (send the newest frame instead of the whole list).
const Race = (() => {
  const HZ = 10, FL = { swim: 1, air: 2, gallop: 4 };
  const clamp16 = v => Math.max(-32768, Math.min(32767, Math.round(v)));
  const wrapA = a => { a = (a + Math.PI) % (Math.PI * 2); if (a < 0) a += Math.PI * 2; return a - Math.PI; };
  const toB64 = u8 => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
  const fromB64 = b64 => { const s = atob(b64), u8 = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u8[i] = s.charCodeAt(i); return u8; };

  function encode(frames) {
    const dv = new DataView(new ArrayBuffer(frames.length * 10));
    frames.forEach((f, i) => {
      const o = i * 10;
      dv.setInt16(o, clamp16(f[0] / 0.02), true); dv.setInt16(o + 2, clamp16(f[1] / 0.01), true); dv.setInt16(o + 4, clamp16(f[2] / 0.02), true);
      dv.setInt16(o + 6, clamp16(wrapA(f[3]) * 10000), true); dv.setUint16(o + 8, (Math.min(255, Math.max(0, Math.round(f[4] * 10))) | ((f[5] & 0xff) << 8)), true);
    });
    return toB64(new Uint8Array(dv.buffer));
  }
  function decode(b64) {
    const u8 = fromB64(b64), n = Math.floor(u8.length / 10), dv = new DataView(u8.buffer), out = new Array(n);
    for (let i = 0; i < n; i++) {
      const o = i * 10, w = dv.getUint16(o + 8, true);
      out[i] = [dv.getInt16(o, true) * 0.02, dv.getInt16(o + 2, true) * 0.01, dv.getInt16(o + 4, true) * 0.02, dv.getInt16(o + 6, true) / 10000, (w & 0xff) / 10, w >> 8];
    }
    return out;
  }
  // where a track is at time t (seconds since GO): position, heading and speed blended between frames
  function sample(frames, t, out = {}) {
    const f = Math.max(0, t * HZ), i = Math.min(frames.length - 1, Math.floor(f)), j = Math.min(frames.length - 1, i + 1), k = Math.min(1, f - i);
    const a = frames[i], b = frames[j];
    out.x = a[0] + (b[0] - a[0]) * k; out.y = a[1] + (b[1] - a[1]) * k; out.z = a[2] + (b[2] - a[2]) * k;
    out.h = a[3] + wrapA(b[3] - a[3]) * k; out.spd = a[4] + (b[4] - a[4]) * k; out.fl = (k < 0.5 ? a : b)[5];
    out.done = f >= frames.length - 1;
    return out;
  }
  // distance covered around the lap, unwrapped across the start line and never jumping by more than half a lap
  function tracker(C) {
    return {
      d: 0, prev: 0,
      update(x, z) {
        const n = C.near(x, z); if (n.d > 30) return this.d; // far off the trail (mid-cove): hold until back near it
        let ds = n.s - this.prev; ds -= Math.round(ds / C.LEN) * C.LEN;
        this.prev = n.s; this.d += ds; return this.d;
      },
    };
  }
  // progress at each frame (kept rising, so a stumble backwards doesn't count twice): what "behind by" is measured against
  function progressOf(C, frames) {
    const tr = tracker(C), p = new Float32Array(frames.length); let best = -1e9;
    frames.forEach((f, i) => { best = Math.max(best, tr.update(f[0], f[2])); p[i] = best; });
    return p;
  }
  // the time (s) a track first reached progress d
  function timeAt(prog, d) {
    if (!prog.length || d <= prog[0]) return 0;
    let lo = 0, hi = prog.length - 1; if (d > prog[hi]) return hi / HZ;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (prog[m] < d) lo = m; else hi = m; }
    const k = (d - prog[lo]) / Math.max(1e-6, prog[hi] - prog[lo]);
    return (lo + k) / HZ;
  }
  // progress at time t
  function progAt(prog, t) { const f = Math.max(0, t * HZ), i = Math.min(prog.length - 1, Math.floor(f)), j = Math.min(prog.length - 1, i + 1); return prog[i] + (prog[j] - prog[i]) * (f - i); }

  // A starter dog's run, made up from the trail rather than recorded: a sprint and jog rhythm tuned to finish near
  // `time` seconds, a lane a little off the centre, hops over the logs and a slog through the mud.
  // env: {groundH, waterAt, WL}; obstacles: {logs: [s], mud: [[s, half length]]}; o.swim takes the cove swim.
  function synth(C, env, obstacles, o) {
    let seed = o.seed || 1; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const frames = [], LEN = C.LEN;
    const inMud = s => obstacles.mud.some(([m, h]) => Math.abs(((s - m + LEN * 1.5) % LEN) - LEN / 2) < h);
    // speed shape: relative pace at distance s (1 = average), so the clock ends close to the target time
    const rel = s => {
      const u = s / LEN;
      let v = 1 + 0.16 * Math.sin(u * Math.PI * 2 * 7 + o.seed) + 0.08 * Math.sin(u * Math.PI * 2 * 17 + o.seed * 2);
      if (inMud(s)) v *= 0.6;
      const g = (env.groundH(...xz(s + 2)) - env.groundH(...xz(s - 2))) / 4; v *= Math.max(0.82, Math.min(1.12, 1 - g * 1.3)); // slower uphill
      if (s < 12) v *= 0.45 + 0.55 * s / 12; // getting going off the line
      return v;
    };
    const lane = o.lane || 0;
    function xz(s) { const p = C.at(s), t = C.tanAt(s); return [p.x - t.z * lane, p.z + t.x * lane]; }
    // the cove swim: a straight line from just before the cove to just after it
    const sw = o.swim ? { a: C.COVE_S[0] - 2, b: C.COVE_S[1] + 2 } : null;
    let swimP = null, swimLen = 0;
    if (sw) { const A = xz(sw.a), Bp = xz(sw.b); swimP = [A, Bp]; swimLen = Math.hypot(Bp[0] - A[0], Bp[1] - A[1]); }
    // integrate once with unit speed to find the scale that hits the target time
    const run = (scale, emit) => {
      let s = 0, t = 0, swimD = -1;
      const dt = 1 / HZ;
      for (let guard = 0; guard < 20000; guard++) {
        let x, z, y, h, spd, fl = 0;
        if (swimD >= 0) {
          spd = 2.8 * (o.swimPace || 1); swimD += spd * dt;
          const k = Math.min(1, swimD / swimLen), [A, Bp] = swimP;
          x = A[0] + (Bp[0] - A[0]) * k; z = A[1] + (Bp[1] - A[1]) * k; h = Math.atan2(Bp[0] - A[0], Bp[1] - A[1]);
          y = Math.max(env.groundH(x, z), env.waterAt(x, z) - 0.42); fl = env.groundH(x, z) < env.waterAt(x, z) - 0.5 ? FL.swim : 0;
          if (k >= 1) { swimD = -1; s = sw.b; }
        } else {
          spd = rel(s) * scale; s += spd * dt;
          if (sw && s >= sw.a && s < sw.b) { swimD = 0; s = sw.a; }
          [x, z] = xz(s); const t2 = C.tanAt(s); h = Math.atan2(t2.x, t2.z);
          y = env.groundH(x, z);
          // a hop over each log: up 0.9 m over 2.4 m of trail
          for (const L of obstacles.logs) { const d = ((s - L + LEN * 1.5) % LEN) - LEN / 2; if (Math.abs(d) < 1.6) { y += 0.75 * (1 - (d / 1.6) ** 2); fl |= FL.air; } }
          if (spd > 6.4) fl |= FL.gallop;
        }
        if (emit) emit([x, y, z, h, spd, fl]);
        t += dt;
        if (s >= LEN + 1) return t;
      }
      return t;
    };
    let scale = LEN / o.time;
    for (let k = 0; k < 4; k++) scale *= run(scale) / o.time;
    run(scale, f => frames.push(f));
    // a few frames standing on the line before GO is not needed: frame 0 is the moment of GO
    return frames;
  }
  return { HZ, FL, encode, decode, sample, tracker, progressOf, timeAt, progAt, synth, wrapA };
})();
if (typeof module !== 'undefined') module.exports = Race;
