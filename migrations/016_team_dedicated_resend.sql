-- v0.46: per-team Resend account (enterprise dedicated domains)

ALTER TABLE teams
  ADD COLUMN IF NOT EXISTS dedicated_resend_api_key_cipher TEXT,
  ADD COLUMN IF NOT EXISTS dedicated_resend_webhook_secret_cipher TEXT,
  ADD COLUMN IF NOT EXISTS dedicated_resend_configured_at TIMESTAMPTZ;
