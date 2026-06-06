-- OIDC login (Auth0/Google) → team for MCP authorization_code flow

CREATE TABLE IF NOT EXISTS oidc_identities (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL REFERENCES teams (id) ON DELETE CASCADE,
  issuer TEXT NOT NULL,
  sub TEXT NOT NULL,
  email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (issuer, sub)
);

CREATE INDEX IF NOT EXISTS idx_oidc_identities_team ON oidc_identities (team_id);
