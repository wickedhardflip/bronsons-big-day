# Leaderboard Worker

A small Cloudflare Worker (`bronson-leaderboard`) in front of a D1 database. The game calls it at
`https://bronson-leaderboard.bri-wag.workers.dev`.

- Ranking: fastest full-game time (Chapter 1 to the finale). Only play time counts; menus, chapter cards and pauses don't, retries do.
- Players post 3-letter initials. Each time records its difficulty (`easy`, `normal` or `hard`); the game shows one board with all of them and a tab for each.
- Lake Haigler Dash (the race mode) has its own board: one row per set of initials, holding that player's best time and the path of that run, so other players can race it.
- Tables: `bronson_runs` and `bronson_scores` for the story, `bronson_race_runs` and `bronson_race_times` for the race (see `schema.sql`). They share a D1 database with another game's leaderboard; this Worker never touches any other table.

## API

| Method | Path | Body | Returns |
| --- | --- | --- | --- |
| POST | `/run` | `{}` | `{run}`, called when Play starts Chapter 1 |
| POST | `/scores` | `{run, initials, time, splits, score, diff}` | `{ok, rank, initials, time, diff}` (rank within that difficulty) |
| GET | `/scores?limit=10&diff=hard` | | `{scores: [{initials, time, score, diff, at}]}`; leave out `diff` for all difficulties |
| POST | `/race/run` | `{}` | `{run}`, called at GO |
| POST | `/race/times` | `{run, initials, time, path, ver}` | `{ok, rank, initials, time, improved}`; the board keeps a player's time only when it beats their best |
| GET | `/race/times?limit=50` | | `{times: [{initials, time, at}]}`, best time per player |
| GET | `/race/path?initials=ABC` | | `{initials, time, path}`, that player's best run |

A race path is base64 of five little-endian int16s per 0.1 s frame: x/0.02, y/0.01, z/0.02, heading×10000, and
speed×10 in the low byte with flags in the high byte (see `src/race.js` in the game).

## Anti-spam

Times are measured in the browser, so cheating can't be made impossible. These checks make it harder:

- A time must use a run issued by the server, and each run posts once.
- The time can't be shorter than the real time since the run started.
- Every chapter has a minimum plausible time, and the chapter times must add up to the total.
- Each address is rate limited (30 runs and 10 posts per hour; 60 races and 20 race posts per hour).
- A race time must come with its path, and the path must be a real lap: it starts and ends at the line, passes every flag in order, never jumps, its length fits the time, and its frame count matches the time.
- A short blocklist keeps rude initials off the board.
- POSTs are only accepted from the game's GitHub Pages origin.

## Deploying

Bindings: `DB` (D1), `ALLOWED_ORIGINS` (plain text, comma separated) and `IP_SALT` (secret). The salt and any API
tokens live only in Cloudflare and must never be committed. Apply `schema.sql` once (a database made before difficulty levels also needs `migrations/0002_difficulty.sql`, and one made before the race mode needs `migrations/0003_race.sql`), then upload `src/index.js`
as an ES module (Wrangler, or the Workers API).
