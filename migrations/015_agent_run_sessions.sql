-- v0.35: multi-step agent run state (JSON + step log)

CREATE TABLE IF NOT EXISTS agent_run_sessions (
  run_id TEXT NOT NULL,
  owner_key TEXT NOT NULL,
  state JSONB NOT NULL DEFAULT '{}'::jsonb,
  steps JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (run_id, owner_key)
);

CREATE INDEX IF NOT EXISTS idx_agent_run_sessions_owner_updated
  ON agent_run_sessions (owner_key, updated_at DESC);
