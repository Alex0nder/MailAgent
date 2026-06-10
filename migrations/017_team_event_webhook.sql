-- Team-wide event webhook (all inboxes for team keys)

ALTER TABLE teams
  ADD COLUMN IF NOT EXISTS event_webhook_url TEXT;
