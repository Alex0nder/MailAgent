-- Workspace Agent action log.

CREATE TABLE IF NOT EXISTS workspace_actions (
  id TEXT PRIMARY KEY,
  owner_key TEXT NOT NULL,
  team_id TEXT,
  api_key_hint TEXT NOT NULL,
  reminder_id TEXT,
  thread_id TEXT,
  message_id TEXT,
  action_type TEXT NOT NULL,
  title TEXT NOT NULL,
  note TEXT,
  status TEXT NOT NULL DEFAULT 'done',
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workspace_actions_owner_created
  ON workspace_actions (owner_key, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_workspace_actions_owner_reminder
  ON workspace_actions (owner_key, reminder_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_workspace_actions_owner_thread
  ON workspace_actions (owner_key, thread_id, created_at DESC);
