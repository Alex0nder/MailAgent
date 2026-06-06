-- QA: test run label + webhook on message (CI)

ALTER TABLE inboxes
  ADD COLUMN IF NOT EXISTS label TEXT,
  ADD COLUMN IF NOT EXISTS callback_url TEXT;

CREATE INDEX IF NOT EXISTS idx_inboxes_label ON inboxes (label)
  WHERE label IS NOT NULL;
