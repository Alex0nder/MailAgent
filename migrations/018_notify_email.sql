-- Developer email relay: OTP summary to real inbox while signup uses temp address

ALTER TABLE inboxes
  ADD COLUMN IF NOT EXISTS notify_email TEXT,
  ADD COLUMN IF NOT EXISTS notify_mode TEXT NOT NULL DEFAULT 'off';

CREATE TABLE IF NOT EXISTS notify_deliveries (
  id TEXT PRIMARY KEY,
  inbox_id TEXT NOT NULL REFERENCES inboxes (id) ON DELETE CASCADE,
  message_id TEXT,
  notify_email TEXT NOT NULL,
  resend_id TEXT,
  ok BOOLEAN NOT NULL DEFAULT false,
  error_text TEXT,
  duration_ms INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notify_deliveries_inbox
  ON notify_deliveries (inbox_id, created_at DESC);
