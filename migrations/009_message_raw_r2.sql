-- Raw MIME в R2: ключ объекта для полного .eml (Resend raw.download_url)

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS raw_r2_key TEXT;

CREATE INDEX IF NOT EXISTS idx_messages_raw_r2_key
  ON messages (raw_r2_key)
  WHERE raw_r2_key IS NOT NULL;
