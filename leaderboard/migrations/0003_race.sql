-- Run once on a database created before the race mode existed (schema.sql already includes this for new ones).
-- Creates only the two new bronson_race_* tables; nothing else in the database is changed.
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
