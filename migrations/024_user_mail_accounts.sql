-- P1: user mailbox read connectors (Gmail OAuth, read-only)

CREATE TABLE IF NOT EXISTS user_mail_accounts (
  id TEXT PRIMARY KEY,
  owner_key TEXT NOT NULL,
  team_id TEXT REFERENCES teams (id) ON DELETE CASCADE,
  api_key_hint TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'gmail',
  email TEXT NOT NULL,
  refresh_token_cipher TEXT NOT NULL,
  scopes TEXT[] NOT NULL DEFAULT '{}',
  connected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_sync_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_mail_accounts_active_email
  ON user_mail_accounts (owner_key, provider, email)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_user_mail_accounts_owner
  ON user_mail_accounts (owner_key)
  WHERE revoked_at IS NULL;
