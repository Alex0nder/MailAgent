-- Inbox isolation by API key hash (first 16 hex of SHA-256)

ALTER TABLE inboxes
  ADD COLUMN IF NOT EXISTS api_key_hint TEXT;

CREATE INDEX IF NOT EXISTS idx_inboxes_key_hint_label
  ON inboxes (api_key_hint, label)
  WHERE api_key_hint IS NOT NULL;
