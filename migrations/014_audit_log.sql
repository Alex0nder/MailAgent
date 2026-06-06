-- v0.24: team-scoped audit log for enterprise / SOC 2 prep

CREATE TABLE IF NOT EXISTS audit_events (
  id TEXT PRIMARY KEY,
  team_id TEXT REFERENCES teams (id) ON DELETE CASCADE,
  api_key_hint TEXT NOT NULL,
  api_key_id TEXT,
  action TEXT NOT NULL,
  resource_type TEXT,
  resource_id TEXT,
  meta JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_team_created
  ON audit_events (team_id, created_at DESC)
  WHERE team_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_audit_hint_created
  ON audit_events (api_key_hint, created_at DESC)
  WHERE team_id IS NULL;
