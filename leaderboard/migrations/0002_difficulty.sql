-- Run once on a database created before difficulty levels existed (schema.sql already includes this for new ones).
ALTER TABLE bronson_scores ADD COLUMN diff TEXT NOT NULL DEFAULT 'normal';
CREATE INDEX IF NOT EXISTS bronson_scores_diff ON bronson_scores (diff, time_ms, created_at);
