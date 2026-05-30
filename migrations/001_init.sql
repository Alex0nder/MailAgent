-- MailAgent: временные inbox для агентов (Neon Postgres)

CREATE TABLE IF NOT EXISTS inboxes (
  id TEXT PRIMARY KEY,
  address TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inboxes_expires_at ON inboxes (expires_at);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  inbox_id TEXT NOT NULL REFERENCES inboxes (id) ON DELETE CASCADE,
  provider_id TEXT NOT NULL UNIQUE,
  from_addr TEXT NOT NULL,
  subject TEXT NOT NULL DEFAULT '',
  text_preview TEXT,
  html_preview TEXT,
  otp TEXT,
  links_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_inbox_received
  ON messages (inbox_id, received_at DESC);
