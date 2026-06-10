# Technical Core — MailAgent

Архитектура на основе README, wrangler.jsonc, src/index.ts, src/env.ts.

## Stack

| Слой | Технология |
|------|------------|
| Runtime | Cloudflare Workers + Hono |
| Static | `public/` via ASSETS binding |
| DB | Neon Postgres (`@neondatabase/serverless`) |
| Inbound email | Resend Inbound + webhooks |
| Async | Cloudflare Queues + DLQ |
| Real-time | Durable Objects (SSE) |
| Object storage | R2 (`mailagent-raw-mime`) |
| Rate limit | KV namespace `RATE_LIMIT` |
| AI | Workers AI binding (`AI`) — embeddings, structured extract |
| Auth | API keys (DB + legacy), OAuth mat_ JWT, OIDC (Auth0) |
| Billing | Stripe webhooks |
| MCP | stdio (`mcp/`) + remote HTTP (`/mcp`) |

Prod URLs: `webmailagent.com` (static), `api.webmailagent.com` (API).

---

## Cloudflare Worker

**Entry:** `src/index.ts`

**Routing logic:**
- `/v1`, `/webhooks`, `/mcp`, `/.well-known`, `/health` → Hono app
- Everything else → `env.ASSETS.fetch()` (landing, dashboard, docs HTML)
- HTTPS redirect for prod hosts
- `www` → apex redirect

**Handlers:**
- `fetch` — HTTP
- `queue` — `handleQueueBatch` → `processInboundEmail`
- `scheduled` — cron `0 * * * *` → `purgeExpired` + `purgeExpiredAuditEvents`

**Durable Object export:** `InboxWait` from `src/durable-objects/inbox-wait.ts`

**wrangler.jsonc bindings:**
- `MAIL_QUEUE` → `mailagent-email` (DLQ: `mailagent-email-dlq`)
- `INBOX_WAIT` → Durable Object class `InboxWait`
- `RAW_MIME` → R2 bucket
- `RATE_LIMIT` → KV
- `AI` → Workers AI
- `ASSETS` → `./public`

---

## API

Hono route modules (`src/routes/`):

| Mount | Module | Auth |
|-------|--------|------|
| `/health` | health.ts | none |
| `/webhooks/*` | webhooks.ts | Resend/Stripe signatures |
| `/v1` | api-meta.ts | partial |
| `/v1/openapi.json` | openapi.ts | none |
| `/v1/inboxes` | inboxes.ts | Bearer |
| `/v1/stats` | stats.ts | Bearer |
| `/v1/me` | me.ts | Bearer |
| `/v1/billing` | billing.ts | Bearer |
| `/v1/console` | console.ts | Bearer |
| `/v1/audit` | audit.ts | Bearer |
| `/v1/team` | team.ts | Bearer |
| `/v1/domains` | domains.ts | Bearer |
| `/v1/agent` | agent.ts | Bearer |
| `/v1/oauth` | oauth.ts | mixed |
| `/mcp` | mcp-http.ts | Bearer / OAuth |
| `/.well-known` | oauth.ts | none |

OpenAPI spec: `src/openapi/spec.ts` → `GET /v1/openapi.json`

Auth middleware: `requireApiKey` → `resolveAuth` (API key hash in DB or legacy `API_KEY`/`API_KEYS`, or `mat_` OAuth token).

---

## Database (Neon Postgres)

Client: `src/db/client.ts` (`getDb(env)`).

Migrations: `migrations/001_init.sql` … `016_team_dedicated_resend.sql` (16 files).

**Critical tables:**

| Table | Purpose |
|-------|---------|
| `inboxes` | Temporary addresses, TTL, allowlist, label, callback |
| `messages` | Inbound mail, otp, links, provider_id (UNIQUE), raw_r2_key |
| `teams` | Multi-tenant, plan, Stripe IDs |
| `api_keys` | Hashed keys, scopes (labelPrefix, readOnly) |
| `custom_domains` | Team domains via Resend |
| `message_attachments` | Attachment metadata + R2 cache |
| `callback_deliveries` | QA callback log |
| `message_search` | Full-text + embeddings |
| `audit_events` | Team audit trail |
| `agent_run_sessions` | Multi-step agent state |
| `oidc_identities` | MCP browser login |
| `team_dedicated_resend` | Enterprise per-team Resend |

Run migrations: `npm run db:migrate` (needs `DATABASE_URL`).

---

## Neon

- Serverless Postgres, connection string in `DATABASE_URL` secret.
- SETUP.md: enable connection pooling, remove `channel_binding=require` if blocks driver.
- Health: `GET /health` pings DB.
- Contract tests intentionally **do not** need `DATABASE_URL` — use `simulate` endpoint against prod API.

---

## Resend

**Inbound:**
- Domain: `INBOX_DOMAIN` (e.g. `xxxx.resend.app` or custom MX).
- Webhook `email.received` → `POST /webhooks/resend`.
- Verification: `resend.webhooks.verify` with `RESEND_WEBHOOK_SECRET`.

**Fetch body:** `resend.emails.receiving.get(emailId)` in queue consumer (not webhook).

**Outbound:** `src/services/outbound-mail.ts`, `OUTBOUND_FROM` env.

**Enterprise:** per-team API key + webhook at `/webhooks/resend/team/:teamId`.

---

## SSE (Server-Sent Events)

- Durable Object `InboxWait` holds subscriber writers.
- Client: `GET /v1/inboxes/:id/events` → proxies to DO `/subscribe`.
- On message ingest: queue consumer calls DO `/notify` → `event: message` broadcast.
- MCP stdio client also uses SSE (`mcp/src/sse.ts`) for wait.

Fallback: `GET /v1/inboxes/:id/wait` — server-side poll every 500ms (`src/services/wait.ts`).

---

## Queues

- Producer: webhook enqueues `EmailQueueMessage`.
- Consumer: `src/queue/consumer.ts` — batch process, ack/retry.
- Config: `max_batch_size: 5`, `max_retries: 5`, DLQ `mailagent-email-dlq`.
- OTP extraction happens **in queue**, not webhook (fast 200 response).

---

## Durable Objects

- Class: `InboxWait` (`src/durable-objects/inbox-wait.ts`).
- One DO instance per inbox id (`idFromName(inbox.id)`).
- Endpoints: `/subscribe` (SSE), `/notify` (POST from queue).
- Migration tag `v1` with `new_sqlite_classes: ["InboxWait"]`.

---

## MCP

**Manifest:** `src/mcp/manifest.ts` — 23 tools, version 0.8.1.

**Handlers:** `src/mcp/handlers.ts`, session: `src/mcp/session.ts`.

**Transports:**
1. stdio — `mcp/src/index.ts` (npm `@mailagent/mcp`)
2. remote HTTP — `POST /mcp` JSON-RPC (`src/routes/mcp-http.ts`)

**OAuth:** `/.well-known/oauth-*`, `/v1/oauth/*`, `mat_` JWT (`src/lib/mcp-jwt.ts`).

**Discovery:** `GET /v1/agent` lists tools, recipes, docs links.

---

## Критические компоненты

1. **Resend webhook + queue** — единственный путь real inbound mail.
2. **Neon** — все inbox/message state.
3. **Queue consumer** — extract, store, notify.
4. **INBOX_WAIT DO** — real-time wait для agents.
5. **API key auth** — все `/v1/inboxes/*`.
6. **INBOX_DOMAIN DNS** — без MX письма не придут.

---

## Точки отказа

| Компонент | Симптом | Mitigation |
|-----------|---------|------------|
| Resend webhook down | 0 messages | Resend dashboard events; tunnel in dev |
| Queue consumer error | delayed/missing mail | retries → DLQ; logs |
| Neon unreachable | 500, health fail | Neon status; connection string |
| DO disconnect | SSE wait fails | fallback `/wait` poll |
| Allowlist mismatch | mail dropped silently | `diagnose`, check `allowedSenders` |
| Rate limit / quota | 429 | `/v1/me`, cleanup inboxes |
| R2 unavailable | no raw MIME | extract still works from Resend body |
| Workers AI off | no semantic search / structured extract | keyword search fallback |

---

## Зависимости (runtime)

```
Worker
 ├── Neon (DATABASE_URL)
 ├── Resend (RESEND_API_KEY, INBOX_DOMAIN, RESEND_WEBHOOK_SECRET)
 ├── Cloudflare Queues (MAIL_QUEUE)
 ├── Durable Objects (INBOX_WAIT)
 ├── KV (RATE_LIMIT) — optional sampled writes
 ├── R2 (RAW_MIME) — optional
 ├── Workers AI (AI) — optional
 ├── Stripe (STRIPE_*) — optional billing
 └── OIDC (OIDC_*) — optional MCP browser auth
```

External clients depend on: `MAILAGENT_API_URL` + `MAILAGENT_API_KEY`.
