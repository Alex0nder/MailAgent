# Security Core — MailAgent

Узкое ядро Context OS для **router hits** по безопасности: pentest scope, allowlist, webhook auth, dashboard localStorage, `doctor:security`. Полная модель auth/billing, OAuth MCP, Stripe, scoped keys — в каноническом ядре.

**См. также:** [auth-billing-core.md](./auth-billing-core.md) — source of truth по `resolveAuth`, `PLAN_LIMITS`, `mat_*`, OIDC, team keys.

---

## Purpose

MailAgent — multi-tenant hosted API с Bearer keys, optional OAuth для remote MCP, inbound webhooks от Resend/Stripe, static dashboard на Netlify. Безопасность строится на **tenant isolation**, **hashed secrets**, **signature verification** и **scoped CI/pentest keys**.

Это ядро отвечает, когда роутер попал в **security** / **pentest** / **allowlist** / **risk**, но не нужен полный auth-billing-core (~870 строк):

1. **Карта рисков** — IDOR, key leakage, webhook bypass, abuse.
2. **Pentest scope** — in/out of scope, test account, priority cases.
3. **Sender allowlist** — правила, bypass scenarios, silent drop.
4. **Webhook authentication** — Resend Svix, Stripe, team path.
5. **Dashboard localStorage** — риск хранения API key в браузере.
6. **`doctor:security`** — что проверяет, CI baseline.
7. **Где секреты** — таблица storage, never-in-git.

Для изменений в `src/lib/auth.ts`, scopes, billing — читать **auth-billing-core**.

---

## Entities

### Risk categories (documented)

| Area | Entity / surface | Primary control |
|------|------------------|-----------------|
| Tenant isolation | `inboxes`, `messages`, `domains` | `api_key_hint`, `team_id` filters |
| Credential | API keys, `mat_*`, OIDC | Hash at rest, TTL, PKCE |
| Inbound trust | Resend email content | Allowlist, no HTML execution |
| Webhook integrity | `/webhooks/*` | Svix / Stripe signatures |
| Abuse | REST `/v1/*` | Rate limit KV, plan quotas |
| Client exposure | dashboard.html, Codex plugin | No keys in bundles |
| Supply chain | npm deps | `doctor:security` audit |
| Ops | Single Worker | Shared blast radius |

### Security artifacts

| Artifact | Path |
|----------|------|
| Pentest scope | [docs/PENTEST-PREP.md](../../docs/PENTEST-PREP.md) |
| Public summary | [public/docs/security.html](https://webmailagent.com/docs/security.html) |
| SOC2 prep | [docs/SOC2.md](../../docs/SOC2.md) |
| Operator access | [docs/OPERATOR-ACCESS.md](../../docs/OPERATOR-ACCESS.md) |
| Scoped keys guide | [docs/SCOPED-API-KEYS.md](../../docs/SCOPED-API-KEYS.md) |
| Security policy | [SECURITY.md](../../SECURITY.md) |
| Baseline script | `scripts/doctor-security.mjs` |
| CI workflow | `.github/workflows/security-baseline.yml` |
| Audit risks | [context-os/audit/risks.md](../audit/risks.md) |

### Auth modules (pointers)

| Module | Path |
|--------|------|
| resolveAuth | `src/lib/auth.ts`, `src/services/api-key-store.ts` |
| Scope guards | `src/lib/scope-guard.ts`, `src/lib/key-scope.ts` |
| Rate limit | `src/lib/rate-limit.ts` |
| Allowlist | `src/lib/sender-allowlist.ts` |
| Webhooks | `src/routes/webhooks.ts` |
| Team secrets cipher | `src/lib/team-secrets.ts` |
| MCP OAuth | `src/services/mcp-oauth.ts`, `src/lib/mcp-jwt.ts` |
| HTTPS redirect | `src/index.ts` |

---

## Decision history

| # | Решение | Статус |
|---|---------|--------|
| S1 | Cross-team resource access → **404** not 403 | active — no existence leak |
| S2 | API keys SHA-256 hash only in Neon | active |
| S3 | Legacy env keys plan `legacy`, no team | active — transitional |
| S4 | Allowlist mismatch → **silent drop** (no bounce) | active — abuse trade-off |
| S5 | Resend webhook unsigned → 401 | active |
| S6 | Contract tests safe on prod (`simulate`) | active — pentest/CI |
| S7 | `doctor:security` без prod secrets | active — CI weekly |
| S8 | Dashboard stores key in localStorage | accepted risk — documented |
| S9 | Untrusted email HTML never executed server-side | active — agents must not eval |
| S10 | Dedicated Resend secrets encrypted at rest (016) | active — `team-secrets` |

Детали OAuth, Stripe, scoped keys — [auth-billing-core.md § Decision history](./auth-billing-core.md).

---

## Sources

| Document | Content |
|----------|---------|
| [PENTEST-PREP.md](../../docs/PENTEST-PREP.md) | Vendor scope package |
| [SECURITY.md](../../SECURITY.md) | Disclosure policy |
| [SCOPED-API-KEYS.md](../../docs/SCOPED-API-KEYS.md) | labelPrefix, readOnly |
| [OPERATOR.md](../../docs/OPERATOR.md) | Secrets placement |
| [AGENTS.md](../../AGENTS.md) | `doctor:security` command |
| [risks.md](../audit/risks.md) | Operational risk register |

---

## Pentest scope

Документ для передачи vendor перед SOC 2 Type II. **Не отчёт** — scope package со scoped API key.

Публичная версия: [security.html](https://webmailagent.com/docs/security.html).

### In scope

| Surface | URL / entry | Notes |
|---------|-------------|-------|
| REST API | `https://api.webmailagent.com` | Bearer API key; team-scoped |
| Remote MCP | `POST https://api.webmailagent.com/mcp` | OAuth `mat_` or API key |
| OAuth discovery | `/.well-known/oauth-authorization-server` | RFC 8414 |
| Dashboard (static) | `https://webmailagent.com/dashboard.html` | API key in browser storage |
| Inbound webhooks | `POST /webhooks/resend` · `POST /webhooks/resend/team/:teamId` | Signature verification |
| Stripe webhook | `POST /webhooks/stripe` | Disabled until billing live |

### Out of scope (unless agreed)

- Cloudflare / Neon / Resend control planes (shared responsibility)
- Customer SMTP senders (untrusted inbound content — abuse policy)
- Auth0 tenant admin (IdP config)
- DDoS / volumetric only (Cloudflare edge)
- Social engineering of operator

### Test account provisioning

Выдать vendor **dedicated team API key**:

- `labelPrefix: pentest-` (scoped create)
- Not `readOnly`
- Documented expiry and revocation in dashboard

Безопасные flows без real SMTP:

```bash
MAILAGENT_API_URL=https://api.webmailagent.com \
MAILAGENT_API_KEY=ma_… \
  npm run test:contract:qa
```

Uses `POST …/simulate` — no `DATABASE_URL`, no real email.

### Priority test cases

**Auth:** key on `/v1/*`; cross-team IDOR → 404; scoped `readOnly`/`labelPrefix`; `mat_*` expiry; OIDC PKCE.  
**Webhooks:** Resend bypass → 401; wrong `teamId` → no cross-tenant; Stripe unsigned → 400.  
**Data:** no secrets in API responses/bundles; MIME/attachments team-scoped.  
**Abuse:** rate limit 429; size limits; simulate no cross-team inbox.

### Vendor deliverables

- Executive summary + severity-rated findings (CVSS or equivalent)
- Remediation retest window (e.g. 30 days)
- No public disclosure before coordinated fix

---

## Risk register (summary)

### Documented in PENTEST-PREP + audit/risks.md

| Risk | Description | Mitigation |
|------|-------------|------------|
| IDOR | Cross-team inbox/message/domain | hint + team filters, 404 |
| API key leakage | Bearer in logs, CI, browser | Hash at rest, secret scanning |
| Webhook bypass | Unsigned payloads accepted | Svix verify, 401 |
| Allowlist bypass | Unexpected senders stored | `isSenderAllowed` at queue |
| Rate limit abuse | API flooding | KV per key, plan limits |
| MCP session hijack | Remote MCP binding | `validateMcpSession`, hint bind |
| OIDC flow | State/PKCE bypass | Standard OAuth hardening |
| Untrusted inbound email | HTML/attachment injection | No server-side HTML exec |
| Dashboard XSS + key | localStorage API key | Static site, user education |
| Single Worker blast radius | All tenants one deploy | Cloudflare isolation model |
| DLQ unprocessed | Silent mail loss | Ops monitoring (not auth) |
| Allowlist silent drop | Sender confusion | Documented behavior |

---

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
| `TEAM_SECRETS_KEY` | wrangler secret | ✓ |
| Team Resend keys | DB `teams.*_cipher` (encrypted) | ✓ |
| API key plaintext | Only at issuance; stored as hash | ✓ |

**Examples only:** `.dev.vars.example`, `.env.example` — no real values.

**CI:** GitHub Actions secrets — [OPERATOR.md](../../docs/OPERATOR.md).

**Client:** `MAILAGENT_API_KEY` in env for MCP/QA — not committed.

**Выдача ключей:** `npm run issue:key:db`, `POST /v1/team/keys` — plaintext один раз в response.

---

## Ограничения доступа (кратко)

### Authentication

- Все `/v1/inboxes/*`, `/v1/team/*`, etc. require `Authorization: Bearer`.
- `requireApiKey` → `resolveAuth()` in `src/lib/auth.ts`.
- Credentials: DB team keys (`ma_*`), legacy `API_KEY`/`API_KEYS`, OAuth `mat_*` JWT.

### Authorization / scoping

- **Tenant isolation:** queries filter by `api_key_hint` or `team_id`.
- **Scoped keys** (migration 008):
  - `scope_label_prefix` — create/read only inboxes with matching label
  - `scope_read_only` — blocks create/delete/write
- **Plan limits:** `src/lib/plans.ts` — rate, inbox quota, domains, dedicated Resend.

Полная таблица `PLAN_LIMITS` и `resolveAuth` flow — [auth-billing-core.md](./auth-billing-core.md).

### Rate limiting

- `src/lib/rate-limit.ts` — KV-backed, per API key hint, plan-based limit.
- Sampled KV writes (`RATE_LIMIT_KV_WRITE_EVERY=10` default).
- Exceeded → HTTP 429.

### MCP OAuth

- `requireMcpAuth` → `WWW-Authenticate` with resource metadata (RFC 9728).
- `validateMcpSession` binds to `apiKeyHint`.
- `mat_*` TTL: `MCP_OAUTH_TOKEN_TTL_SEC` (default 3600s).

### HTTPS

- Force HTTPS redirect for prod hosts in `src/index.ts`.

### Audit

- `GET /v1/audit` — team-scoped audit log.
- Retention: `AUDIT_RETENTION_DAYS` (default 90, cron hourly).

---

## Sender allowlist

### Назначение

Ограничить, какие отправители могут заполнить inbox. Задаётся при create: `expectFrom`, `allowedSenders`, или preset `service` (resolves to allowlist).

**Модуль:** `src/lib/sender-allowlist.ts`  
**Проверка:** queue consumer `src/services/resend-mail.ts` — **после** `findInboxByAddress`, **до** `insertMessage`.

### Правила нормализации (`normalizeAllowedSenders`)

| Input | Normalized rule |
|-------|-----------------|
| `user@example.com` | exact address (lowercase) |
| `@example.com` | domain rule |
| `example.com` | `@example.com` |
| array | dedupe, lowercase |
| undefined / empty | `[]` = **accept all senders** |

### Matching (`isSenderAllowed`)

- Parse `From` header — extract email from `"Name <a@b.com>"`.
- Exact email rule: full address match.
- Domain rule: `host === domain` OR `host.endsWith('.' + domain)` (subdomains OK).
- **Empty allowlist** → return `true` (any sender).

### Security properties

| Property | Behavior |
|----------|----------|
| Mismatch | Message **dropped**, not stored, no error to sender |
| Bypass attempt | Spoofed From — relies on Resend receiving integrity |
| Empty allowlist | Intentionally permissive — product default for quick signup tests |
| API simulate | Bypasses Resend but still runs through same insert path; From in body |

### Pentest angles

- Inbox with strict allowlist — send simulate with wrong From → no message
- Cannot read another team's allowlist via IDOR — inbox 404
- `readOnly` key cannot change allowlist (no create with new list)

### Ops risk

Allowlist drop = **silent** — no bounce to sender. QA должен использовать `mailagent_diagnose_inbox` или check message count.

---

## Webhook authentication

### Resend global — `POST /webhooks/resend`

```typescript
// src/routes/webhooks.ts
event = resend.webhooks.verify({
  payload,
  headers: { id, timestamp, signature },  // svix-* headers
  webhookSecret: c.env.RESEND_WEBHOOK_SECRET,
});
// catch → 401 { error: "invalid_signature" }
```

| Header | Purpose |
|--------|---------|
| `svix-id` | Message id |
| `svix-timestamp` | Replay window |
| `svix-signature` | HMAC signature |

**Secret:** `RESEND_WEBHOOK_SECRET=whsec_…` from Resend dashboard.  
**Wrong secret / missing headers:** 401 — no queue, no ingest.

### Resend team — `POST /webhooks/resend/team/:teamId`

1. Load per-team secret from `teams.dedicated_resend_webhook_secret_cipher`
2. Decrypt via `decryptTeamSecret` (`TEAM_SECRETS_KEY`)
3. Same Svix verify with team secret
4. `teamId` mismatch or not configured → 404

**Pentest:** wrong teamId must not deliver to another tenant's inboxes.

### Stripe — `POST /webhooks/stripe`

- Requires `STRIPE_WEBHOOK_SECRET`
- Stripe SDK signature verification on raw body
- Invalid → 400
- Disabled when billing not configured

### Team event webhook (outbound from MailAgent)

`teams.event_webhook_url` — MailAgent **calls** customer HTTPS endpoint on inbound (not incoming auth to MailAgent). Customer should verify MailAgent delivery (document in integration guides).

### Callback URL (per-inbox)

`inboxes.callback_url` — MailAgent POSTs to customer on new message. Validated HTTPS only at create (`parseCallbackUrl`). No shared signing secret in v1 — customer endpoint security is customer responsibility.

---

## Dashboard localStorage risk

### Surface

Static `public/dashboard.html` served via Netlify (`webmailagent.com`). User pastes API key to manage inboxes in browser.

### Risk

| Threat | Impact |
|--------|--------|
| XSS on dashboard origin | Steal key from `localStorage` |
| Shared computer | Key persists in browser |
| Browser extensions | Read storage |
| Screenshot / shoulder surf | Key visible in UI |

### Mitigations (current)

- Dashboard is **optional** dev/ops tool — not required for MCP/agents
- Keys are team-scoped — blast radius limited vs master operator key
- Recommend scoped keys with `labelPrefix`, `readOnly` where possible
- Prod agents should use env `MAILAGENT_API_KEY`, not dashboard
- Pentest scope explicitly lists this surface

### Not in scope of Worker auth

Dashboard talks to same API — key is Bearer like any client. **No special dashboard token** — compromise = full key permissions.

### Recommendations for users

- Use dedicated team key, not personal master
- Revoke key after use (`DELETE /v1/team/keys/:id`)
- Prefer MCP env over dashboard paste
- Do not use dashboard on untrusted machines

---

## doctor:security

### Command

```bash
npm run doctor:security
# → node scripts/doctor-security.mjs
```

**Не требует** operator secrets, `MAILAGENT_API_KEY`, или `DATABASE_URL`. Safe in CI.

### What it checks

1. **Policy files** — `SECURITY.md`, `SOC2.md`, `OPERATOR-ACCESS.md`, `PENTEST-PREP.md`, privacy/terms/security/sla HTML.
2. **Codex** — `plugin.json` exists + `npm run verify:codex`.
3. **npm audit** — fail on critical/high.
4. **GitHub** (local `gh`) — secret scanning + push protection; CI skips → `npm run harden:repo`.
5. **CI artifact** — `hol-plugin-scanner.yml`.

Exit `0` OK / `1` failures → см. PENTEST-PREP, SOC2.

### CI integration

`.github/workflows/security-baseline.yml`:

- On every PR/push to `main`
- Weekly schedule
- Only `GITHUB_TOKEN` — no prod API key

Related:

```bash
npm run harden:repo    # GitHub secret scanning setup verify
npm run verify:codex   # Codex plugin checks (subset of doctor:security)
```

**Compliance map:** npm audit (deps), secret scanning (leakage), hol-plugin-scanner (supply chain), policy files (trust). Prod auth — отдельно `test:contract:qa` (нужен key).

| Command | Needs prod key? |
|---------|-----------------|
| `doctor:security`, `harden:repo`, `verify:codex` | No |
| `test:contract:qa`, `test:prod`, `doctor:qa` | Yes |

---

## Safe testing without production risk

Contract tests use `simulate` — no real email, no DB:

```bash
MAILAGENT_API_URL=https://api.webmailagent.com \
MAILAGENT_API_KEY=ma_… \
  npm run test:contract:qa
```

Pentest keys: `labelPrefix: pentest-`, documented expiry ([PENTEST-PREP.md](../../docs/PENTEST-PREP.md)).

**Simulate cannot target another team's inbox** — auth required, inbox 404 cross-tenant.

---

## Untrusted inbound email

MailAgent stores previews and extracted OTP/links — **не выполняет** HTML/JS из писем на сервере.

| Risk | Guidance |
|------|----------|
| HTML injection in preview | Escaped in API consumers; agents must not `eval` HTML |
| Malicious attachments | Size limits; optional R2; download via authenticated GET |
| Phishing links in `links_json` | Agent must validate URL before navigation |
| Header injection | Parsed by Resend; From used for allowlist only |

Abuse policy: unexpected senders dropped silently if allowlist set.

---

## Scoped API keys (security UX)

Create via `POST /v1/team/keys`:

```json
{
  "label": "ci-pilot",
  "scope": {
    "labelPrefix": "ci-",
    "readOnly": false
  }
}
```

| Scope | Effect |
|-------|--------|
| `readOnly: true` | No create/delete/patch write endpoints |
| `labelPrefix: "ci-"` | Only inboxes with label starting `ci-` |
| Both | CI/pentest least privilege |

Guide: [SCOPED-API-KEYS.md](../../docs/SCOPED-API-KEYS.md).  
Implementation: `src/lib/scope-guard.ts`.

---

## Transport и incident response

- Prod API force HTTPS (`src/index.ts`); callback URL только HTTPS.
- Key leaked → revoke `DELETE /v1/team/keys/:id`; webhook secret → rotate в Resend + `wrangler secret put`.
- Suspected IDOR → `npm run test:contract:qa`. Disclosure: [SECURITY.md](../../SECURITY.md).

**Router FAQ:** `/health` публичный; unsigned webhook → 401; allowlist drop тихий; baseline → `npm run doctor:security`.

---

## See also

- **[auth-billing-core.md](./auth-billing-core.md)** — resolveAuth, mat_ JWT, OIDC, Stripe, PLAN_LIMITS, scoped keys detail
- [database-core.md](./database-core.md) — tenant isolation via api_key_hint
- [deployment-core.md](./deployment-core.md) — wrangler secrets, Resend webhook setup
- [inbox-core.md](./inbox-core.md) — allowlist on create
- [email-core.md](./email-core.md) — ingest pipeline
- [PENTEST-PREP.md](../../docs/PENTEST-PREP.md) — vendor handoff
- [SOC2.md](../../docs/SOC2.md) — compliance mapping
- [SCOPED-API-KEYS.md](../../docs/SCOPED-API-KEYS.md) — least privilege keys
