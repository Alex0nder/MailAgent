# Operational Core — MailAgent

Deploy, CI/CD, env, secrets, testing, monitoring, security — из SETUP.md, docs/CI.md, docs/OPERATOR.md, package.json.

---

## Deploy

### Local dev
```bash
npm install
cp .dev.vars.example .dev.vars   # Worker secrets
cp .env.example .env               # MCP client
npm run db:migrate                 # needs DATABASE_URL
npm run dev                        # wrangler dev :8787
npm run verify                     # smoke local
```

Tunnel (cloudflared/ngrok) required for Resend webhook → local `/webhooks/resend`.

### Production
```bash
npx wrangler login
npx wrangler secret put DATABASE_URL
npx wrangler secret put RESEND_API_KEY
npx wrangler secret put RESEND_WEBHOOK_SECRET
npx wrangler secret put API_KEY
npx wrangler secret put INBOX_DOMAIN
npx wrangler r2 bucket create mailagent-raw-mime
npm run deploy
npm run db:migrate
```

Update Resend webhook URL to prod Worker. Custom API domain: `api.webmailagent.com` via Workers Custom Domain (not CNAME to workers.dev — 522).

**Trigger:** push to `main` touching `src/`, `public/`, `wrangler.jsonc`, `package-lock.json` → `.github/workflows/deploy-worker.yml`.

---

## Setup checklist

`npm run setup:check` / `node scripts/setup-check.mjs`

Full manual: **SETUP.md** (Neon 5min, Resend 10min, secrets, deploy).

Operator one-time: **docs/OPERATOR.md**, **docs/YOUR-TURN.md**, `npm run doctor:operator`.

---

## CI/CD

| Workflow | Trigger | Action |
|----------|---------|--------|
| `deploy-worker.yml` | push main (worker paths) | wrangler deploy → `test:prod:gate` |
| `qa-smoke.yml` | PR / qa/* | check + verify:codex + smoke + contract |
| `test-prod-full.yml` | manual | full `test:prod` |
| `security-baseline.yml` | push/PR, weekly | `doctor:security` |
| `publish-packages.yml` | tag v* | npm publish via OIDC |
| `hol-plugin-scanner.yml` | PR | Codex catalog score |

### GitHub Actions secrets

| Secret | Required | Purpose |
|--------|----------|---------|
| `CLOUDFLARE_API_TOKEN` | deploy | Workers Scripts Edit |
| `CLOUDFLARE_ACCOUNT_ID` | deploy | `42ae092824ce3429ee3f914b43603273` |
| `MAILAGENT_API_KEY` | prod gate | post-deploy smoke + contract |
| `DATABASE_URL` | optional | auto migrate on deploy |

Without `MAILAGENT_API_KEY`, deploy fails on contract — by design (OPERATOR.md).

---

## Environment variables

### Required (Worker secrets)

| Var | Source |
|-----|--------|
| `DATABASE_URL` | Neon connection string |
| `RESEND_API_KEY` | Resend dashboard |
| `RESEND_WEBHOOK_SECRET` | Resend webhook signing |
| `API_KEY` | generated; or `API_KEYS` comma-separated |
| `INBOX_DOMAIN` | Resend receiving domain |

### wrangler.jsonc vars (non-secret)

`DEFAULT_TTL_MINUTES=30`, `RATE_LIMIT_PER_MINUTE=120`, `RATE_LIMIT_KV_WRITE_EVERY=10`, `AUDIT_RETENTION_DAYS=90`

### Optional

| Var | When |
|-----|------|
| `OUTBOUND_FROM` | send/reply |
| `STRIPE_*` | billing |
| `OIDC_*` | MCP browser login |
| `MCP_OAUTH_*` | OAuth token TTL/JWT |
| `RAW_MIME_MAX_BYTES` | R2 limits |
| `SEARCH_EMBED_MODEL`, `EXTRACT_MODEL` | Workers AI |

### Client (.env for MCP)

```
MAILAGENT_API_URL=https://api.webmailagent.com
MAILAGENT_API_KEY=ma_…
```

---

## Secrets management

- **Worker:** `npx wrangler secret put <NAME>` — never in git.
- **Local:** `.dev.vars` (gitignored), `.env` for MCP.
- **CI:** GitHub Actions secrets only.
- **Team keys:** `npm run issue:key:db` — hashed in `api_keys` table.
- **Operator human:** docs/OPERATOR.md — one-time only.

`.dev.vars.example` and `.env.example` document shape without values.

---

## Testing

### Doctor commands
```bash
npm run doctor              # local env
npm run doctor:qa           # API key + diagnose smoke
npm run doctor:billing      # Stripe readiness
npm run doctor:security     # trust docs, npm audit
npm run doctor:oidc         # OIDC config
```

### Smoke (prod API)
```bash
MAILAGENT_API_URL=https://api.webmailagent.com \
MAILAGENT_API_KEY=ma_… \
  npm run smoke:qa          # lifecycle
  npm run smoke:agent       # MCP + OAuth
  npm run smoke:prod        # basic prod check
```

### Contract (simulate, no DATABASE_URL)
```bash
npm run test:contract:qa           # inbox/simulate/extract
npm run test:contract:qa:agent     # agent.ts, MCP hub
npm run test:contract:qa:attachments
npm run test:contract:qa:team-keys
npm run test:contract:qa:billing
npm run test:contract:all
```

### Full prod gate
```bash
npm run test:prod        # smoke + all contracts + Playwright
npm run test:prod:gate   # smoke only (~15 API calls, CI default)
```

### Unit/scripts
`test:allowlist`, `test:extract`, `test:structured-extract`, `test:message-search`, `test:thread-resolve`

### Playwright
`examples/playwright/`, `test:pw:simulate`

Guide: **docs/AUTOTESTS.md**, **AGENTS.md** (matrix: what to run after changing what).

---

## Monitoring

- `GET /health` — DB ping.
- `GET /v1/stats` — inbox/message counters 24h.
- Cloudflare Workers logs / observability (dashboard).
- Queue DLQ `mailagent-email-dlq` — failed ingest jobs.
- Cron purge logs: `console.log("cron purge", …)`.
- CI failure → GitHub Actions; post-deploy gate blocks bad deploys.

No dedicated APM documented in repo; Cloudflare + Resend dashboards are primary.

---

## Security (operational)

- `npm run doctor:security` — trust docs, verify:codex, npm audit high+.
- `npm run harden:repo` — enable GitHub secret scanning.
- Pentest scope: **docs/PENTEST-PREP.md**.
- SOC2 prep: **docs/SOC2.md**.
- Scoped API keys: **docs/SCOPED-API-KEYS.md**.
- Allowlist on inbox create — unexpected senders dropped at ingest.
- Webhook signature verification (Resend svix, Stripe).
- Rate limiting per API key via KV (sampled writes).
- Audit log: `GET /v1/audit`, retention `AUDIT_RETENTION_DAYS`.

### npm publish
Trusted Publishing OIDC — no `NPM_TOKEN` in CI (docs/PUBLISH.md).
