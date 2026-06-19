-- Workspace Agent autonomy policies and idempotent reply executions.

CREATE TABLE IF NOT EXISTS workspace_autonomy_policies (
  owner_key TEXT PRIMARY KEY,
  team_id TEXT,
  api_key_hint TEXT NOT NULL,
  mode TEXT NOT NULL DEFAULT 'draft_only',
  allowed_recipient_domains TEXT[] NOT NULL DEFAULT '{}',
  min_confidence TEXT NOT NULL DEFAULT 'high',
  max_sends_per_hour INTEGER NOT NULL DEFAULT 5,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS workspace_executions (
  id TEXT PRIMARY KEY,
  owner_key TEXT NOT NULL,
  team_id TEXT,
  api_key_hint TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  reminder_id TEXT,
  inbox_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  denial_code TEXT,
  request JSONB NOT NULL DEFAULT '{}'::jsonb,
  result JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (owner_key, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_workspace_executions_owner_created
  ON workspace_executions (owner_key, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_workspace_executions_owner_status_created
  ON workspace_executions (owner_key, status, created_at DESC);
