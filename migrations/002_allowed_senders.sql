-- Sender allowlist per inbox (empty array = accept all)

ALTER TABLE inboxes
  ADD COLUMN IF NOT EXISTS allowed_senders TEXT[] NOT NULL DEFAULT '{}'::text[];
