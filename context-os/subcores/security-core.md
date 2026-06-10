# Security Core

Специализированное ядро: риски, секреты, контроль доступа.

## Какие риски существуют

### Documented in docs/PENTEST-PREP.md

| Risk area | Description |
|-----------|-------------|
| IDOR | Cross-team inbox/message/domain access |
| API key leakage | Bearer token in logs, CI, browser storage |
| Webhook bypass | Unsigned Resend/Stripe payloads |
| Allowlist bypass | Unexpected senders stored if misconfigured |
| Rate limit abuse | API flooding |
| MCP session hijack | Remote MCP session binding |
| OIDC flow | State/PKCE if browser login enabled |
| Untrusted inbound email | Content injection — agents must not execute email HTML |
| Dashboard | `dashboard.html` stores API key in browser localStorage |

### Operational risks (audit/risks.md)
- Single Worker = blast radius for all tenants
- Neon/Resend/Cloudflare shared responsibility
- DLQ unprocessed = silent mail loss
- Allowlist drop = silent (no error to sender)

## Где находятся секреты

| Secret | Storage | Never in git |
|--------|---------|--------------|
| `DATABASE_URL` | wrangler secret, `.dev.vars` | ✓ |
| `RESEND_API_KEY` | wrangler secret, `.dev.vars` | ✓ |
| `RESEND_WEBHOOK_SECRET` | wrangler secret, `.dev.vars` | ✓ |
| `API_KEY` / `API_KEYS` | wrangler secret, `.dev.vars` | ✓ |
| `STRIPE_SECRET_KEY` | wrangler secret | ✓ |
| `STRIPE_WEBHOOK_SECRET` | wrangler secret | ✓ |
| `OIDC_CLIENT_SECRET` | wrangler secret | ✓ |
| `MCP_OAUTH_JWT_SECRET` | wrangler secret (default: API_KEY) | ✓ |
| Team Resend keys | DB `team_dedicated_resend` (encrypted via team-secrets) | ✓ |
| API key plaintext | Only at issuance (`issue-api-key.mjs`); stored as hash | ✓ |

**Examples only:** `.dev.vars.example`, `.env.example` — no real values.

**CI:** GitHub Actions secrets (`OPERATOR.md`).

**Client:** `MAILAGENT_API_KEY` in env for MCP/QA — not committed.

## Какие ограничения доступа используются

### Authentication
- All `/v1/inboxes/*`, `/v1/team/*`, etc. require `Authorization: Bearer`.
- `requireApiKey` → `resolveAuth()` in `src/lib/auth.ts`.
- Supports: DB-hashed team keys, legacy `API_KEY`/`API_KEYS`, OAuth `mat_` JWT.

### Authorization / scoping
- **Tenant isolation:** queries filter by `api_key_hint` or `team_id`.
- **Scoped keys** (`migrations/008`):
  - `scope_label_prefix` — can only create/read inboxes with matching label
  - `scope_read_only` — blocks create/delete/write
- **Plan limits:** `src/lib/plans.ts` — rate, inbox quota, domains, dedicated Resend.

### Sender allowlist
- `allowed_senders` / `expectFrom` / `service` preset on inbox create.
- `isSenderAllowed()` in queue — non-matching From **dropped**, not stored.

### Webhook auth
- Resend: `resend.webhooks.verify` with svix headers.
- Stripe: signature verification (`STRIPE_WEBHOOK_SECRET`).
- Team webhook: per-team secret from DB.

### Rate limiting
- `src/lib/rate-limit.ts` — KV-backed, per API key, plan-based limit.
- Sampled KV writes (`RATE_LIMIT_KV_WRITE_EVERY=10`).

### MCP OAuth
- `requireMcpAuth` returns `WWW-Authenticate` with resource metadata (RFC 9728).
- Session validation: `validateMcpSession` binds to `apiKeyHint`.

### HTTPS
- Force HTTPS redirect for prod hosts in `src/index.ts`.

### Audit
- `GET /v1/audit` — team-scoped audit log.
- Retention: `AUDIT_RETENTION_DAYS` (default 90).

## Security tooling

```bash
npm run doctor:security    # trust docs, verify:codex, npm audit high+
npm run harden:repo        # GitHub secret scanning
```

CI: `.github/workflows/security-baseline.yml` (weekly + PR).

## Pentest / compliance docs

- docs/PENTEST-PREP.md — scope, test cases
- docs/SOC2.md — compliance prep
- docs/SCOPED-API-KEYS.md — key scoping guide
- public/docs/security.html — public summary

## Safe testing without production risk

Contract tests use `simulate` — no real email, no `DATABASE_URL`:
```bash
MAILAGENT_API_URL=https://api.webmailagent.com \
MAILAGENT_API_KEY=ma_… \
  npm run test:contract:qa
```

Provide pentest keys with `labelPrefix: pentest-` and documented expiry (PENTEST-PREP.md).
