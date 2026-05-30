-- Лог POST на callbackUrl (отладка CI webhook)

CREATE TABLE IF NOT EXISTS callback_deliveries (
  id TEXT PRIMARY KEY,
  inbox_id TEXT NOT NULL REFERENCES inboxes (id) ON DELETE CASCADE,
  message_id TEXT,
  callback_url TEXT NOT NULL,
  status_code INT,
  ok BOOLEAN NOT NULL DEFAULT false,
  error_text TEXT,
  duration_ms INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_callback_deliveries_inbox
  ON callback_deliveries (inbox_id, created_at DESC);
