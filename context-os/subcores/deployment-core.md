# Deployment Core

Специализированное ядро: развёртывание MailAgent.

## Как развернуть проект

### Prerequisites
1. Cloudflare account (account_id in wrangler.jsonc)
2. Neon Postgres project
3. Resend account (receiving domain + webhook)
4. Node.js + npm

### Step-by-step (from SETUP.md + README)

```bash
# 1. Clone & install
git clone https://github.com/Alex0nder/MailAgent.git
cd MailAgent
npm install

# 2. Neon
cp .env.example .env
# DATABASE_URL=postgresql://...
npm run db:migrate

# 3. Local secrets
cp .dev.vars.example .dev.vars
# Fill: DATABASE_URL, RESEND_API_KEY, RESEND_WEBHOOK_SECRET,
#       API_KEY, INBOX_DOMAIN

# 4. Resend webhook (dev needs tunnel)
# email.received → https://<tunnel>/webhooks/resend

# 5. Local run
npm run dev          # :8787
npm run verify       # smoke

# 6. Production deploy
npx wrangler login
npx wrangler secret put DATABASE_URL
npx wrangler secret put RESEND_API_KEY
npx wrangler secret put RESEND_WEBHOOK_SECRET
npx wrangler secret put API_KEY
npx wrangler secret put INBOX_DOMAIN
npx wrangler r2 bucket create mailagent-raw-mime
npm run deploy
npm run db:migrate

# 7. Update Resend webhook to prod URL
# 8. Optional: api.webmailagent.com custom domain (SETUP.md §6)
```

### CI deploy (automatic)
Push to `main` with changes in `src/`, `public/`, `wrangler.jsonc`, `package-lock.json`:
→ GitHub Actions `deploy-worker.yml` → `wrangler deploy` → `test:prod:gate`.

Requires secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `MAILAGENT_API_KEY`.

## Какие env нужны

### Required (Worker secrets via wrangler)
| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | Neon pooled connection string |
| `RESEND_API_KEY` | Resend API key |
| `RESEND_WEBHOOK_SECRET` | Webhook signing secret (whsec_) |
| `API_KEY` | Master API key (or use `API_KEYS`) |
| `INBOX_DOMAIN` | Resend receiving domain |

### Set in wrangler.jsonc (non-secret)
`DEFAULT_TTL_MINUTES`, `RATE_LIMIT_PER_MINUTE`, `RATE_LIMIT_KV_WRITE_EVERY`, `AUDIT_RETENTION_DAYS`

### Optional
`OUTBOUND_FROM`, `STRIPE_*`, `OIDC_*`, `MCP_OAUTH_*`, `RAW_MIME_*`, `SEARCH_EMBED_MODEL`, `EXTRACT_MODEL`

### MCP client (.env)
`MAILAGENT_API_URL`, `MAILAGENT_API_KEY`

## Какие команды использовать

| Command | Purpose |
|---------|---------|
| `npm run dev` | Local Worker |
| `npm run deploy` | Production deploy |
| `npm run db:migrate` | Apply SQL migrations |
| `npm run setup:check` | Validate local config |
| `npm run doctor` | Env health check |
| `npm run verify` | Local smoke test |
| `npm run types` | Generate wrangler types |
| `npm run check` | TypeScript check |
| `npm run issue:key:db` | Create team API key |
| `npm run build:mcp` | Build MCP package |
| `npm run test:prod:gate` | Post-deploy smoke |

## First deploy side effects

Creates Cloudflare Queues:
- `mailagent-email`
- `mailagent-email-dlq`

Creates/binds:
- KV `RATE_LIMIT`
- R2 `mailagent-raw-mime`
- Durable Object `InboxWait`

## Custom domain setup

**Landing:** webmailagent.com (static via ASSETS).

**API:** api.webmailagent.com — Workers Custom Domain (NOT CNAME to workers.dev).

**Inbound email:** MX on subdomain or Resend `.resend.app` domain.

See: SETUP.md §6, docs/HOSTING-CLOUDFLARE.md, docs/DEDICATED-DOMAINS.md.

## npm packages publish

Tag `v*` → `publish-packages.yml` → `@mailagent/mcp`, `@mailagent/agent`, `@mailagent/qa`.

## Operator checklist

docs/OPERATOR.md — GitHub secrets + Worker secrets one-time setup.
