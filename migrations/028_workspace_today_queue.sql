-- P5: durable Today queue for proposed workspace actions.

CREATE TABLE IF NOT EXISTS workspace_action_candidates (
  id TEXT PRIMARY KEY,
  owner_key TEXT NOT NULL,
  team_id TEXT,
  api_key_hint TEXT NOT NULL,
  source_key TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  account_id TEXT,
  monitor_id TEXT REFERENCES workspace_monitors (id) ON DELETE SET NULL,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT,
  suggested_action TEXT NOT NULL,
  confidence TEXT NOT NULL DEFAULT 'medium',
  status TEXT NOT NULL DEFAULT 'new',
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  decided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (owner_key, source_key)
);

CREATE INDEX IF NOT EXISTS idx_workspace_action_candidates_owner_status
  ON workspace_action_candidates (owner_key, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_workspace_action_candidates_monitor
  ON workspace_action_candidates (monitor_id, updated_at DESC)
  WHERE monitor_id IS NOT NULL;
