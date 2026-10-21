# Leaderboard Worker

A small Cloudflare Worker (`bronson-leaderboard`) in front of a D1 database. The game calls it at
`https://bronson-leaderboard.bri-wag.workers.dev`.

- Ranking: fastest full-game time (Chapter 1 to the finale). Only play time counts; menus, chapter cards and pauses don't, retries do.
- Players post 3-letter initials. Each time records its difficulty (`easy`, `normal` or `hard`); the game shows one board with all of them and a tab for each.
- Tables: `bronson_runs` and `bronson_scores` (see `schema.sql`). They share a D1 database with another game's leaderboard; this Worker never touches any other table.

## API

| Method | Path | Body | Returns |
| --- | --- | --- | --- |
| POST | `/run` | `{}` | `{run}`, called when Play starts Chapter 1 |
| POST | `/scores` | `{run, initials, time, splits, score, diff}` | `{ok, rank, initials, time, diff}` (rank within that difficulty) |
| GET | `/scores?limit=10&diff=hard` | | `{scores: [{initials, time, score, diff, at}]}`; leave out `diff` for all difficulties |

## Anti-spam

Times are measured in the browser, so cheating can't be made impossible. These checks make it harder:

- A time must use a run issued by the server, and each run posts once.
- The time can't be shorter than the real time since the run started.
- Every chapter has a minimum plausible time, and the chapter times must add up to the total.
- Each address is rate limited (30 runs and 10 posts per hour).
- A short blocklist keeps rude initials off the board.
- POSTs are only accepted from the game's GitHub Pages origin.

## Deploying

Bindings: `DB` (D1), `ALLOWED_ORIGINS` (plain text, comma separated) and `IP_SALT` (secret). The salt and any API
tokens live only in Cloudflare and must never be committed. Apply `schema.sql` once (a database made before difficulty levels also needs `migrations/0002_difficulty.sql`), then upload `src/index.js`
as an ES module (Wrangler, or the Workers API).
