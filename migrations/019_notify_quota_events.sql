-- Durable daily quota events for developer email relay.
-- Separate from notify_deliveries because delivery logs cascade with inbox deletion.

CREATE TABLE IF NOT EXISTS notify_quota_events (
  id TEXT PRIMARY KEY,
  team_id TEXT,
  api_key_hint TEXT NOT NULL,
  inbox_id TEXT NOT NULL,
  notify_email TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notify_quota_events_team_created
  ON notify_quota_events (team_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notify_quota_events_hint_created
  ON notify_quota_events (api_key_hint, created_at DESC);
