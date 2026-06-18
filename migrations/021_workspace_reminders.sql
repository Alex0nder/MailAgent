-- Workspace Agent reminders / follow-ups.

CREATE TABLE IF NOT EXISTS workspace_reminders (
  id TEXT PRIMARY KEY,
  owner_key TEXT NOT NULL,
  team_id TEXT,
  api_key_hint TEXT NOT NULL,
  title TEXT NOT NULL,
  due_at TIMESTAMPTZ,
  due_hint TEXT,
  source TEXT,
  source_thread_id TEXT,
  source_message_id TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_workspace_reminders_owner_status_due
  ON workspace_reminders (owner_key, status, due_at NULLS LAST, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_workspace_reminders_owner_updated
  ON workspace_reminders (owner_key, updated_at DESC);
