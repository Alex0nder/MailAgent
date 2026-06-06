-- v0.19: custom domains (team-scoped, Resend DNS)

CREATE TABLE IF NOT EXISTS domains (
  id TEXT PRIMARY KEY,
  team_id TEXT REFERENCES teams (id) ON DELETE CASCADE,
  api_key_hint TEXT,
  name TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending',
  resend_domain_id TEXT NOT NULL UNIQUE,
  dns_records JSONB NOT NULL DEFAULT '[]'::jsonb,
  region TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  verified_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_domains_team ON domains (team_id);
CREATE INDEX IF NOT EXISTS idx_domains_hint ON domains (api_key_hint);
CREATE INDEX IF NOT EXISTS idx_domains_status ON domains (status);

ALTER TABLE inboxes
  ADD COLUMN IF NOT EXISTS domain_id TEXT REFERENCES domains (id);

CREATE INDEX IF NOT EXISTS idx_inboxes_domain ON inboxes (domain_id);
