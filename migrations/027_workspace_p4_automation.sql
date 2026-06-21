-- P4: autonomous rules, scheduled monitors, digest delivery

ALTER TABLE workspace_autonomy_policies
  ADD COLUMN IF NOT EXISTS automation_enabled BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS workspace_automation_rules (
  id TEXT PRIMARY KEY,
  owner_key TEXT NOT NULL,
  team_id TEXT,
  api_key_hint TEXT NOT NULL,
  name TEXT NOT NULL,
  kind TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  gmail_account_id TEXT,
  calendar_account_id TEXT,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workspace_automation_rules_owner
  ON workspace_automation_rules (owner_key, enabled);

CREATE TABLE IF NOT EXISTS workspace_monitors (
  id TEXT PRIMARY KEY,
  owner_key TEXT NOT NULL,
  team_id TEXT,
  api_key_hint TEXT NOT NULL,
  name TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  schedule_hours INTEGER NOT NULL DEFAULT 24,
  gmail_account_id TEXT,
  calendar_account_id TEXT,
  digest_webhook_url TEXT,
  digest_email TEXT,
  rule_kinds TEXT[] NOT NULL DEFAULT '{}',
  last_run_at TIMESTAMPTZ,
  next_run_at TIMESTAMPTZ,
  last_status TEXT,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workspace_monitors_due
  ON workspace_monitors (next_run_at)
  WHERE enabled = TRUE;

CREATE TABLE IF NOT EXISTS workspace_monitor_runs (
  id TEXT PRIMARY KEY,
  monitor_id TEXT NOT NULL REFERENCES workspace_monitors (id) ON DELETE CASCADE,
  owner_key TEXT NOT NULL,
  status TEXT NOT NULL,
  summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  delivered_via TEXT,
  delivery_ok BOOLEAN,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workspace_monitor_runs_monitor
  ON workspace_monitor_runs (monitor_id, created_at DESC);
