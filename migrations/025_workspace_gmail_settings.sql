-- P1.11: per-team Gmail read retention and scan limits for Workspace Agent

CREATE TABLE IF NOT EXISTS workspace_gmail_settings (
  owner_key TEXT PRIMARY KEY,
  team_id TEXT,
  api_key_hint TEXT NOT NULL,
  thread_lookback_days INTEGER NOT NULL DEFAULT 7,
  max_threads_per_scan INTEGER NOT NULL DEFAULT 25,
  digest_max_threads INTEGER NOT NULL DEFAULT 15,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
