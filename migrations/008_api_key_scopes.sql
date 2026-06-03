-- Scoped API keys: label prefix + read-only (CI / agent sub-keys)

ALTER TABLE api_keys
  ADD COLUMN IF NOT EXISTS scope_label_prefix TEXT,
  ADD COLUMN IF NOT EXISTS scope_read_only BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_api_keys_scope_prefix ON api_keys (scope_label_prefix)
  WHERE scope_label_prefix IS NOT NULL;
