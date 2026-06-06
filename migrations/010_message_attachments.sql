-- Inbound message attachments (metadata + optional R2)

CREATE TABLE IF NOT EXISTS message_attachments (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL REFERENCES messages (id) ON DELETE CASCADE,
  provider_id TEXT NOT NULL,
  filename TEXT NOT NULL DEFAULT 'attachment',
  content_type TEXT,
  size_bytes INTEGER,
  content_disposition TEXT,
  content_id TEXT,
  r2_key TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_message_attachments_message
  ON message_attachments (message_id);
