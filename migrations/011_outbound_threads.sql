-- Outbound send + email threads (AgentMail parity)

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS direction TEXT NOT NULL DEFAULT 'inbound',
  ADD COLUMN IF NOT EXISTS thread_id TEXT,
  ADD COLUMN IF NOT EXISTS in_reply_to TEXT,
  ADD COLUMN IF NOT EXISTS to_addrs JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS rfc_message_id TEXT;

UPDATE messages SET thread_id = id WHERE thread_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_messages_thread
  ON messages (inbox_id, thread_id, received_at DESC);

CREATE INDEX IF NOT EXISTS idx_messages_direction
  ON messages (inbox_id, direction, received_at DESC);
