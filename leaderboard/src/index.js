// Bronson's Big Day leaderboard: a Cloudflare Worker backed by D1 (binding DB).
// Fastest full-game time wins (play time from Chapter 1 to the finale; pauses and menus don't count).
//
//   POST /run                                        -> {run}          when a new game starts at Chapter 1
//   POST /scores  {run, initials, time, splits, score, diff} -> {ok, rank}   when the finale is reached
//   GET  /scores?limit=10&diff=easy|normal|hard      -> {scores:[{initials, time, score, diff, at}]}  (no diff: all)
//
// Times are measured in the player's browser, so no check here can make cheating impossible.
// These make it harder: a time needs a run started on this server, each run posts once,
// the time cannot beat the real time since the run started, every chapter has a minimum,
// and each address is rate limited.

const CH_MIN = [15, 15, 35, 10, 74, 8];           // seconds: fastest plausible time per chapter
const CH_MAX = 3600;                              // seconds per chapter
const MIN_TIME = CH_MIN.reduce((a, b) => a + b, 0), MAX_TIME = 4 * 3600;
const RUN_TTL = 7 * 24 * 3600e3;                  // a run may span several sessions (checkpoints)
const RUNS_PER_HOUR = 30, SCORES_PER_HOUR = 10;   // per address
const SCORE_MAX = 100000;
const DIFFS = ['easy', 'normal', 'hard'];          // every difficulty has its own board, and they all show together too
// a short list of 3-letter combinations that shouldn't show on a family leaderboard
const BLOCKED = new Set(['ASS', 'FUK', 'FUC', 'FCK', 'FKU', 'CUM', 'DIK', 'DIC', 'KKK', 'NIG', 'NGR', 'FAG', 'CNT', 'KUM', 'TIT', 'SEX', 'WTF', 'XXX', 'SHT', 'HOE', 'VAG', 'NAZ']);

export default {
  async fetch(req, env) {
    const origin = req.headers.get('Origin') || '';
    const allowed = (env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
    const cors = {
      'Access-Control-Allow-Origin': allowed.includes(origin) ? origin : '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
      'Vary': 'Origin',
    };
    const json = (body, status = 200, extra = {}) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...cors, ...extra } });
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    const url = new URL(req.url);
    // browsers always send Origin on cross-site POSTs; refuse writes from sites that are not the game
    if (req.method === 'POST' && !allowed.includes(origin)) return json({ error: 'origin not allowed' }, 403);
    try {
      if (url.pathname === '/run' && req.method === 'POST') return json(await startRun(req, env));
      if (url.pathname === '/scores' && req.method === 'POST') return json(await postScore(req, env));
      if (url.pathname === '/scores' && req.method === 'GET') return json(await getScores(url, env), 200, { 'Cache-Control': 'public, max-age=15' });
      return json({ error: 'not found' }, 404);
    } catch (e) {
      if (e instanceof Bad) return json({ error: e.message }, e.status);
      console.error(e);
      return json({ error: 'server error' }, 500);
    }
  },
};

class Bad extends Error { constructor(msg, status = 400) { super(msg); this.status = status; } }

async function body(req) {
  const text = await req.text();
  if (text.length > 2048) throw new Bad('request too large', 413);
  if (!text) return {};
  try { return JSON.parse(text); } catch { throw new Bad('invalid JSON'); }
}

async function ipHash(req, env) {
  const ip = req.headers.get('CF-Connecting-IP') || 'unknown';
  const data = new TextEncoder().encode((env.IP_SALT || 'bronson') + '|' + ip);
  const h = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(h)].slice(0, 16).map(b => b.toString(16).padStart(2, '0')).join('');
}

const num = (v, lo, hi) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;

async function startRun(req, env) {
  await body(req);
  const ip = await ipHash(req, env), now = Date.now();
  const { n } = await env.DB.prepare('SELECT COUNT(*) AS n FROM bronson_runs WHERE ip_hash = ? AND started_at > ?').bind(ip, now - 3600e3).first();
  if (n >= RUNS_PER_HOUR) throw new Bad('too many runs, try again later', 429);
  const id = crypto.randomUUID();
  await env.DB.batch([
    env.DB.prepare('DELETE FROM bronson_runs WHERE started_at < ?').bind(now - RUN_TTL), // housekeeping: unposted runs expire
    env.DB.prepare('INSERT INTO bronson_runs (id, started_at, ip_hash) VALUES (?, ?, ?)').bind(id, now, ip),
  ]);
  return { run: id };
}

async function postScore(req, env) {
  const b = await body(req);
  if (typeof b.run !== 'string' || b.run.length > 64) throw new Bad('missing run');
  const initials = String(b.initials || '').toUpperCase();
  if (!/^[A-Z]{3}$/.test(initials)) throw new Bad('initials must be 3 letters');
  if (BLOCKED.has(initials)) throw new Bad('please pick different initials', 422);
  if (!num(b.score, 0, SCORE_MAX) || !Number.isInteger(b.score)) throw new Bad('bad score');
  if (!Array.isArray(b.splits) || b.splits.length !== CH_MIN.length) throw new Bad('bad splits');
  b.splits.forEach((s, i) => { if (!num(s, CH_MIN[i], CH_MAX)) throw new Bad(`chapter ${i + 1} time is not plausible`, 422); });
  if (!num(b.time, MIN_TIME, MAX_TIME)) throw new Bad('bad time');
  const sum = b.splits.reduce((a, s) => a + s, 0);
  if (Math.abs(sum - b.time) > 1) throw new Bad('chapter times do not add up', 422);

  const ip = await ipHash(req, env), now = Date.now();
  const { n } = await env.DB.prepare('SELECT COUNT(*) AS n FROM bronson_scores WHERE ip_hash = ? AND created_at > ?').bind(ip, now - 3600e3).first();
  if (n >= SCORES_PER_HOUR) throw new Bad('too many scores, try again later', 429);

  // claim the run atomically so it can only post once
  const run = await env.DB.prepare('UPDATE bronson_runs SET used = 1 WHERE id = ? AND used = 0 RETURNING started_at').bind(b.run).first();
  if (!run) throw new Bad('unknown or already used run', 409);
  if (b.time > (now - run.started_at) / 1000 + 5) throw new Bad('time does not match the run', 422);

  const timeMs = Math.round(b.time * 1000), diff = DIFFS.includes(b.diff) ? b.diff : 'normal';
  await env.DB.prepare('INSERT INTO bronson_scores (initials, time_ms, score, splits, created_at, ip_hash, diff) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(initials, timeMs, b.score, JSON.stringify(b.splits.map(s => Math.round(s * 10) / 10)), now, ip, diff).run();
  const { r } = await env.DB.prepare('SELECT COUNT(*) + 1 AS r FROM bronson_scores WHERE diff = ? AND time_ms < ?').bind(diff, timeMs).first();
  return { ok: true, rank: r, initials, time: timeMs / 1000, diff };
}

async function getScores(url, env) {
  const limit = Math.min(50, Math.max(1, +url.searchParams.get('limit') || 10));
  const diff = url.searchParams.get('diff');
  const q = DIFFS.includes(diff)
    ? env.DB.prepare('SELECT initials, time_ms, score, diff, created_at FROM bronson_scores WHERE diff = ? ORDER BY time_ms ASC, created_at ASC LIMIT ?').bind(diff, limit)
    : env.DB.prepare('SELECT initials, time_ms, score, diff, created_at FROM bronson_scores ORDER BY time_ms ASC, created_at ASC LIMIT ?').bind(limit);
  const { results } = await q.all();
  return { scores: results.map(r => ({ initials: r.initials, time: r.time_ms / 1000, score: r.score, diff: r.diff, at: r.created_at })) };
}
