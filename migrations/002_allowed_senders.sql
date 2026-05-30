-- Allowlist отправителей per inbox (пустой массив = принимать всех)

ALTER TABLE inboxes
  ADD COLUMN IF NOT EXISTS allowed_senders TEXT[] NOT NULL DEFAULT '{}'::text[];
