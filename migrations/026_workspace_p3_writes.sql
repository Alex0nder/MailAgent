-- P3: approval-gated external writes (Gmail drafts, Calendar events)

ALTER TABLE workspace_autonomy_policies
  ADD COLUMN IF NOT EXISTS gmail_draft_writes BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS calendar_event_writes BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS workspace_write_executions (
  id TEXT PRIMARY KEY,
  owner_key TEXT NOT NULL,
  team_id TEXT,
  api_key_hint TEXT NOT NULL,
  kind TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  account_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  denial_code TEXT,
  request JSONB NOT NULL DEFAULT '{}'::jsonb,
  result JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (owner_key, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_workspace_write_executions_owner_created
  ON workspace_write_executions (owner_key, created_at DESC);
