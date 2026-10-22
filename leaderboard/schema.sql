-- Bronson's Big Day leaderboard tables. They live in the shared D1 database next to
-- Hippo Heist's own tables (runs, scores), which this game never reads or writes.
CREATE TABLE IF NOT EXISTS bronson_runs (
  id TEXT PRIMARY KEY,
  started_at INTEGER NOT NULL,
  ip_hash TEXT NOT NULL,
  used INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS bronson_runs_ip ON bronson_runs (ip_hash, started_at);
CREATE INDEX IF NOT EXISTS bronson_runs_started ON bronson_runs (started_at);
CREATE TABLE IF NOT EXISTS bronson_scores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  initials TEXT NOT NULL,
  time_ms INTEGER NOT NULL,
  score INTEGER NOT NULL,
  splits TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  ip_hash TEXT NOT NULL,
  diff TEXT NOT NULL DEFAULT 'normal'
);
CREATE INDEX IF NOT EXISTS bronson_scores_diff ON bronson_scores (diff, time_ms, created_at);
CREATE INDEX IF NOT EXISTS bronson_scores_board ON bronson_scores (time_ms, created_at);
CREATE INDEX IF NOT EXISTS bronson_scores_ip ON bronson_scores (ip_hash, created_at);
-- Lake Haigler Dash (race mode): its own runs, and one best time per set of initials with that run's path.
CREATE TABLE IF NOT EXISTS bronson_race_runs (
  id TEXT PRIMARY KEY,
  started_at INTEGER NOT NULL,
  ip_hash TEXT NOT NULL,
  used INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS bronson_race_runs_ip ON bronson_race_runs (ip_hash, started_at);
CREATE INDEX IF NOT EXISTS bronson_race_runs_started ON bronson_race_runs (started_at);
CREATE TABLE IF NOT EXISTS bronson_race_times (
  initials TEXT PRIMARY KEY,
  time_ms INTEGER NOT NULL,
  path TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  ip_hash TEXT NOT NULL,
  ver INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS bronson_race_times_board ON bronson_race_times (time_ms, created_at);
