# Technical Core — MailAgent

Архитектурное ядро Context OS: runtime Cloudflare Worker, bindings, маршрутизация, async pipeline (Queue → DO → SSE), интеграции Neon/Resend/Workers AI, MCP transports, точки отказа. Загружай для вопросов про **инфраструктуру и код Worker**, не про deploy/CI (→ `operational-core`) и не про auth/schema (→ `auth-billing-core`, `data-model-core`).

---

## Purpose

Technical Core отвечает на вопросы **как устроен runtime MailAgent**:

- Какой стек и где entry point (`src/index.ts`, `wrangler.jsonc`)?
- Как HTTP делится на API vs static assets?
- Как письмо проходит Resend webhook → Queue → Neon → Durable Object → SSE?
- Какие Cloudflare bindings обязательны, какие optional?
- Как работают stdio MCP и remote `/mcp`?
- Что ломается первым при инциденте и какой fallback?

**Когда загружать:**

| Вопрос | Секция |
|--------|--------|
| «Где routing Worker?» | Cloudflare Worker, `handleFetch` |
| «Какие bindings в wrangler?» | Entities → Wrangler bindings |
| «Почему SSE через DO?» | Decision history → Durable Objects |
| «DLQ, retries queue» | Queues |
| «Где OTP extract?» | Decision history → Queue ingest |
| «Prod URLs» | Production URLs |
| «522 на api.*» | Decision history → Custom domain |

**Не загружать для:** Stripe checkout flow → `auth-billing-core`. Таблицы/migrations → `data-model-core`. Deploy secrets, CI matrix → `operational-core` / `deployment-testing-core`.

**Пары:** `worker-core` (узкий индекс файлов), `email-core` (Resend pipeline детали), `api-core` (endpoint contracts).

---

## Entities

### Runtime stack

| Слой | Технология | Файлы |
|------|------------|-------|
| Runtime | Cloudflare Workers + Hono | `src/index.ts`, `src/routes/*` |
| Static site | `public/` via `ASSETS` binding | `public/*.html`, docs |
| Database | Neon Postgres serverless | `src/db/client.ts`, `migrations/*.sql` |
| Inbound email | Resend Inbound + Svix webhooks | `src/routes/webhooks.ts`, `src/services/resend-mail.ts` |
| Async ingest | Cloudflare Queues + DLQ | `src/queue/consumer.ts`, `wrangler.jsonc` |
| Real-time wait | Durable Object `InboxWait` | `src/durable-objects/inbox-wait.ts` |
| Object storage | R2 `mailagent-raw-mime` | `src/services/raw-mime-r2.ts` |
| Rate limit | KV `RATE_LIMIT` (sampled writes) | `src/lib/rate-limit.ts` |
| AI | Workers AI binding `AI` | `src/services/message-search.ts`, `structured-extract.ts` |
| Auth | API keys (DB hash + legacy), `mat_` JWT, OIDC | `src/lib/auth.ts`, `api-key-store.ts` |
| Billing | Stripe webhooks | `src/routes/webhooks.ts`, `src/services/billing.ts` |
| MCP | stdio package + remote HTTP | `mcp/`, `src/routes/mcp-http.ts`, `src/mcp/*` |
| OpenAPI | Spec + route | `src/openapi/spec.ts`, `src/routes/openapi.ts` |

### Wrangler bindings (`wrangler.jsonc`)

| Binding | Тип CF | Ресурс | Env interface |
|---------|--------|--------|---------------|
| `ASSETS` | Assets | `./public`, `run_worker_first: true` | `Fetcher` |
| `MAIL_QUEUE` | Queue producer | `mailagent-email` | `Queue<EmailQueueMessage>` |
| *(consumer)* | Queue consumer | `mailagent-email`, DLQ `mailagent-email-dlq` | worker `queue` handler |
| `INBOX_WAIT` | Durable Object | class `InboxWait` | `DurableObjectNamespace` |
| `RAW_MIME` | R2 | bucket `mailagent-raw-mime` | `R2Bucket?` |
| `RATE_LIMIT` | KV | namespace id in wrangler | `KVNamespace?` |
| `AI` | Workers AI | platform binding | `Ai?` |
| Secrets | wrangler secret | см. `src/env.ts` | string fields on `Env` |
| Vars | wrangler `vars` | TTL, rate limit, audit retention | string fields on `Env` |

Worker export handlers:

```typescript
export default {
  fetch: handleFetch,           // HTTP: API vs static
  queue: handleQueueBatch,      // async email ingest
  scheduled: purge cron,        // hourly TTL purge
};
export { InboxWait };           // DO class registration
```

Cron trigger: `0 * * * *` — `purgeExpired(inboxes)` + `purgeExpiredAuditEvents`.

Queue consumer config: `max_batch_size: 5`, `max_batch_timeout: 2`, `max_retries: 5`, DLQ `mailagent-email-dlq`.

DO migration tag `v1`: `new_sqlite_classes: ["InboxWait"]`.

Account: `42ae092824ce3429ee3f914b43603273`. Worker name: `mailagent`. Compatibility: `2026-01-15`, flag `nodejs_compat_v2`.

### HTTP routing entities

**API prefix detection** (`handleFetch` in `src/index.ts`):

```
isApi =
  path.startsWith("/v1") ||
  path.startsWith("/webhooks") ||
  path.startsWith("/mcp") ||
  path.startsWith("/.well-known") ||
  path === "/health"
```

Если `isApi` → Hono `app.fetch`. Иначе → `env.ASSETS.fetch(request)`.

**Prod redirects:**

- HTTP → HTTPS для `webmailagent.com`, `www.webmailagent.com`, `api.webmailagent.com` (301).
- `www.webmailagent.com` → apex `webmailagent.com` (301).

**Hono mount table:**

| Mount | Module | Auth |
|-------|--------|------|
| `/health` | `health.ts` | none |
| `/webhooks/*` | `webhooks.ts` | Resend Svix / Stripe signature |
| `/v1` | `statusRoutes`, `apiMetaRoutes` | partial |
| `/v1/openapi.json` | `openapi.ts` | none |
| `/v1/inboxes` | `inboxes.ts` | Bearer API key / `mat_` |
| `/v1/stats` | `stats.ts` | Bearer |
| `/v1/me` | `me.ts` | Bearer |
| `/v1/billing` | `billing.ts` | Bearer |
| `/v1/console` | `console.ts` | Bearer |
| `/v1/audit` | `audit.ts` | Bearer |
| `/v1/team` | `team.ts` | Bearer |
| `/v1/domains` | `domains.ts` | Bearer |
| `/v1/agent` | `agent.ts` | Bearer |
| `/v1/oauth` | `oauth.ts` | mixed (token endpoint) |
| `/mcp` | `mcp-http.ts` | Bearer / OAuth |
| `/.well-known` | `oauth.ts` | none (OIDC discovery) |

Global middleware: `cors()` на все routes.

Auth resolution: `requireApiKey` → `resolveAuth` — hash в `api_keys`, legacy `API_KEY`/`API_KEYS`, или JWT `mat_` OAuth token.

404: `{ "error": "not_found" }`.

### Email pipeline entities

| Stage | Component | Output |
|-------|-----------|--------|
| 1 Webhook | `POST /webhooks/resend` | verify Svix → enqueue `EmailQueueMessage` → 200 fast |
| 2 Queue | `handleQueueBatch` | `processInboundEmail` per message |
| 3 Fetch body | Resend API `emails.receiving.get(emailId)` | raw HTML/text (не в webhook) |
| 4 Match inbox | address → `inboxes` row | tenant + allowlist check |
| 5 Extract | `extract.ts` at ingest | `otp`, `links`, `primaryLink` persisted |
| 6 Store | Neon `messages` + optional R2 raw | `provider_id` UNIQUE idempotency |
| 7 Notify | DO `POST /notify` | SSE `event: message` |
| 8 Callback | `callback.ts` | POST to `callbackUrl` if set |

Enterprise path: `POST /webhooks/resend/team/:teamId` — per-team webhook secret + `resendTeamId` on queue job.

Simulate path (QA): `POST /v1/inboxes/:id/simulate` — bypass Resend, inject message synchronously or via same services.

### Durable Object `InboxWait`

One DO instance per inbox: `env.INBOX_WAIT.idFromName(inbox.id)`.

| Endpoint | Method | Role |
|----------|--------|------|
| `/subscribe` | GET | SSE stream, `event: connected` then `event: message` |
| `/notify` | POST | Called from queue consumer after message stored |

Client API: `GET /v1/inboxes/:id/events` proxies to DO subscribe.

Fallback wait: `GET /v1/inboxes/:id/wait` — server poll every 500ms (`src/services/wait.ts`), не держит Worker connection как long-poll на DO напрямую из route (route orchestrates).

### MCP entities

| Transport | Entry | Package |
|-----------|-------|---------|
| stdio | `mcp/src/index.ts` | `@mailagent/mcp` npm |
| remote HTTP | `POST /mcp` JSON-RPC | `src/routes/mcp-http.ts` |
| discovery | `GET /v1/agent` | tools, recipes, docs links |

Manifest: `src/mcp/manifest.ts` — **28 tools**, version `0.8.2`. Handlers: `src/mcp/handlers.ts`, session state: `src/mcp/session.ts`.

OAuth for browser MCP: `/.well-known/oauth-authorization-server`, `/v1/oauth/*`, stateless `mat_` JWT (`src/lib/mcp-jwt.ts`).

Stdio client also opens SSE to API for wait (`mcp/src/sse.ts`).

### External dependency entities

```
Worker (mailagent)
 ├── Neon Postgres (DATABASE_URL) — all durable state
 ├── Resend (RESEND_API_KEY, INBOX_DOMAIN, RESEND_WEBHOOK_SECRET)
 ├── Cloudflare Queue mailagent-email (+ DLQ)
 ├── Durable Object INBOX_WAIT
 ├── KV RATE_LIMIT (optional sampled)
 ├── R2 RAW_MIME (optional archive)
 ├── Workers AI (optional search/extract)
 ├── Stripe (optional billing webhooks)
 └── OIDC IdP (optional MCP browser login)
```

Clients: `MAILAGENT_API_URL` + `MAILAGENT_API_KEY` (or OAuth token).

---

## Decision history (table + narratives)

| Решение | Альтернатива | Почему выбрали |
|---------|--------------|----------------|
| **Worker + Hono monolith** | Separate API service | Один deploy unit; edge latency; CF-native bindings |
| **Webhook fast-ack + Queue** | Sync process in webhook | Resend timeout; heavy extract/fetch off hot path |
| **Extract at queue ingest** | Extract on read | OTP computed once; consistent DB; faster GET extract |
| **DO for SSE, not Worker stream** | Long-poll on Worker | Workers have CPU/time limits; DO holds subscribers |
| **`run_worker_first: true` on ASSETS** | Pages-only static | Same hostname serves API + landing; custom redirects in Worker |
| **Custom domain api.webmailagent.com** | CNAME → workers.dev | CNAME to `*.workers.dev` → **522** on API |
| **Neon serverless driver** | Hyperdrive/PlanetScale | `@neondatabase/serverless` fits Workers; pooled URL in SETUP |
| **R2 optional for raw MIME** | Always inline in DB | Large `.eml` off Postgres; extract works from Resend body |
| **Workers AI optional** | External OpenAI only | No extra vendor for embeddings/structured extract on CF |
| **Simulate endpoint for QA** | Real SMTP in tests | Contract tests без Resend inbound и без DATABASE_URL |
| **Rate limit KV sampled writes** | Every request write | KV write quota; `RATE_LIMIT_KV_WRITE_EVERY=10` default |
| **Hourly cron purge** | TTL-only lazy delete | Bounded table size; audit retention `AUDIT_RETENTION_DAYS` |

### Narrative: Webhook → Queue → fast 200

Resend ожидает быстрый ответ на webhook. Тело письма **не** приходит в webhook payload — только metadata (`email_id`, from, to, subject). Поэтому `webhooks.ts` только:

1. Verify signature (`resend.webhooks.verify` + `RESEND_WEBHOOK_SECRET`).
2. Filter `email.received`.
3. `MAIL_QUEUE.send(job)`.
4. Return `{ ok: true, queued: true }`.

Fetch полного body, allowlist, OTP extraction, INSERT в Neon, R2 upload, callback — всё в `processInboundEmail` внутри queue consumer. Retry на failure (`msg.retry()`), после 5 попыток — DLQ `mailagent-email-dlq`.

### Narrative: Почему Durable Object для SSE

Agents и MCP clients ждут письмо минутами. Держать открытый HTTP request на обычном Worker handler — хрупко (limits, isolate recycle). `InboxWait` DO:

- Хранит `Set<WritableStreamDefaultWriter>` подписчиков per inbox.
- Queue consumer после persist вызывает internal `fetch("http://do/notify")`.
- Broadcast `event: message` с JSON payload (verification fields included).

При обрыве SSE клиент использует `GET …/wait` poll или MCP retry with diagnose.

### Narrative: API vs static на одном Worker

`handleFetch` — единая точка маршрутизации. Marketing site, `dashboard.html`, docs HTML живут в `public/` и отдаются через `ASSETS`. API paths явно whitelist'ятся в `isApi`. Это позволяет:

- HTTPS/www redirects централизованно.
- `api.webmailagent.com` и `webmailagent.com` на одном Worker script с разными custom domains в Cloudflare dashboard.

Landing может также зеркалиться на Netlify (комментарий в deploy workflow), но Worker assets — canonical для docs paths bundled in repo.

### Narrative: Idempotency через provider_id

Resend может ретраить webhook delivery. Queue может retry consumer. UNIQUE constraint на `messages.provider_id` предотвращает дубликаты. Consumer должен gracefully handle duplicate insert.

### Narrative: Allowlist silent drop

Если `from` не в `allowedSenders` inbox — письмо **не сохраняется** (security). Symptom: empty wait, diagnose shows no matching messages. Not a Resend failure — intentional filter at ingest.

### Narrative: Enterprise dedicated Resend

Teams with dedicated Resend API key get webhook at `/webhooks/resend/team/:teamId`. Queue job carries `resendTeamId` so consumer fetches body with team credentials. Isolates enterprise inbound from shared platform Resend account.

### Narrative: MCP dual transport

Agents in Cursor/Codex use stdio MCP (`node mcp/dist/index.js`). Remote agents use `POST https://api.webmailagent.com/mcp` with same tool names from `manifest.ts`. Single handler layer (`src/mcp/handlers.ts`) avoids tool drift. `GET /v1/agent` is discovery hub for humans and IDE installers.

### Narrative: Workers AI graceful degradation

If `AI` binding unavailable or model errors:

- Semantic search falls back to keyword/`tsvector` paths.
- Structured extract may return heuristic JSON or skip LLM fields.

Core verify flow (OTP regex) does **not** depend on AI.

### Narrative: nodejs_compat_v2

Resend SDK, Stripe, crypto patterns expect Node APIs. Flag enabled in wrangler for compatibility without bundling full Node runtime externally.

---

## Sources

| # | Path | Содержание |
|---|------|------------|
| 1 | [src/index.ts](../../src/index.ts) | Entry: fetch/queue/scheduled, routing, Hono mounts |
| 2 | [wrangler.jsonc](../../wrangler.jsonc) | Bindings, queues, cron, account_id, vars |
| 3 | [src/env.ts](../../src/env.ts) | Full `Env` type, `EmailQueueMessage`, notify payload |
| 4 | [src/routes/*](../../src/routes/) | HTTP layer per domain |
| 5 | [src/services/*](../../src/services/) | Business logic |
| 6 | [src/queue/consumer.ts](../../src/queue/consumer.ts) | Queue batch + DO notify |
| 7 | [src/durable-objects/inbox-wait.ts](../../src/durable-objects/inbox-wait.ts) | SSE DO implementation |
| 8 | [src/mcp/manifest.ts](../../src/mcp/manifest.ts) | 24 MCP tools, version |
| 9 | [src/mcp/handlers.ts](../../src/mcp/handlers.ts) | Tool dispatch |
| 10 | [src/routes/mcp-http.ts](../../src/routes/mcp-http.ts) | Remote MCP JSON-RPC |
| 11 | [mcp/src/index.ts](../../mcp/src/index.ts) | stdio MCP server |
| 12 | [src/openapi/spec.ts](../../src/openapi/spec.ts) | OpenAPI 3 spec |
| 13 | [migrations/*.sql](../../migrations/) | Schema evolution |
| 14 | [README.md](../../README.md) | High-level architecture table |
| 15 | [SETUP.md](../../SETUP.md) | Neon/Resend wiring |
| 16 | `context-os/subcores/worker-core.md` | File index (narrow) |
| 17 | `context-os/subcores/email-core.md` | Resend pipeline detail |
| 18 | `context-os/subcores/data-model-core.md` | Tables, FK, search |

---

## Cloudflare Worker stack

### Architecture diagram

```
                    ┌─────────────────────────────────────────┐
                    │         Cloudflare Worker (mailagent)    │
                    │  src/index.ts — fetch | queue | cron    │
                    └─────────────────────────────────────────┘
                      │              │                │
           isApi?     │              │                │
              ├───────┴──────┐       │                │
              ▼              ▼       ▼                ▼
         Hono /v1/*    /webhooks   /mcp         ASSETS (public/)
              │              │       │
              ▼              ▼       ▼
         Neon SQL      MAIL_QUEUE   MCP handlers
              ▲              │
              │              ▼
              │      queue consumer
              │      processInboundEmail
              │              │
              ├──────────────┤
              ▼              ▼
         R2 RAW_MIME    INBOX_WAIT DO ──SSE──► clients
              │
         Workers AI (optional)
```

### `src/index.ts` routing (детально)

**Step 1 — TLS and host canonicalization**

```typescript
const HTTPS_HOSTS = new Set([
  "webmailagent.com",
  "www.webmailagent.com",
  "api.webmailagent.com",
]);
```

`isInsecureRequest` checks `X-Forwarded-Proto` and `CF-Visitor` JSON `{ scheme }`.

**Step 2 — Hono app construction**

Routes mounted once at module load. CORS on `*`. `notFound` → JSON 404.

**Step 3 — Non-API static**

Docs, landing, dashboard HTML from `public/`. Worker runs first (`run_worker_first`) so redirects apply before asset fetch.

### Scheduled handler

```typescript
async scheduled(_controller, env) {
  const result = await purgeExpired(env);
  const audit = await purgeExpiredAuditEvents(env);
  console.log("cron purge", { ...result, auditDeleted: audit.deleted });
}
```

Purges expired inboxes (TTL from `DEFAULT_TTL_MINUTES` default 30) and old `audit_events` per `AUDIT_RETENTION_DAYS` (default 90).

---

## Hono routes overview

**Inboxes** (`inboxes.ts`): CRUD, `open`, wait, events (SSE proxy), extract, simulate, diagnose, attachments, search, send.

**Agent** (`agent.ts`): `GET /v1/agent` discovery, `POST /v1/agent/verify`, run session CRUD.

**Webhooks** (`webhooks.ts`): Resend platform + team webhooks; Stripe billing — signature verified, no Bearer.

**Other:** `me`, `stats`, `billing`, `console`, `audit`, `team`, `domains`, `oauth`, `mcp-http`, `well-known`, `health`, `openapi`.

Routes thin → services; quota via plans + rate limit middleware.

---

## Queue processing

### Message shape (`EmailQueueMessage`)

```typescript
interface EmailQueueMessage {
  provider: "resend";
  emailId: string;
  from: string;
  to: string[];
  subject: string;
  receivedAt: string;
  resendTeamId?: string;  // enterprise fetch
}
```

### Consumer flow (`src/queue/consumer.ts`)

For each message in batch:

1. `processInboundEmail(env, body, notifyCallback)`
2. On success: `msg.ack()`
3. On error: log + `msg.retry()`

Notify callback posts to DO:

```typescript
const id = env.INBOX_WAIT.idFromName(inbox.id);
await env.INBOX_WAIT.get(id).fetch("http://do/notify", { method: "POST", body: JSON.stringify(payload) });
```

### DLQ operations

Monitor queue `mailagent-email-dlq` in Cloudflare dashboard. Messages land here after `max_retries: 5`. Typical causes: Neon outage, Resend API error fetching body, unhandled exception in extract.

Recovery: fix root cause, replay or manual simulate for affected inboxes.

---

## Durable Objects & SSE

### Client connection

Browser/agent:

```
GET /v1/inboxes/{id}/events
Authorization: Bearer ma_...
```

Route validates auth, resolves inbox tenant, proxies to DO `/subscribe`.

### Event format

```
event: connected
data: {}

event: message
data: {"id":"…","otp":"123456","primaryLink":"https://…",…}
```

MCP stdio uses same API SSE endpoint internally for efficient wait.

### Failure: DO unavailable

Symptoms: SSE disconnects, 5xx on events route.

Mitigation: `GET …/wait` polling; MCP tools retry; check CF DO status.

---

## R2 raw MIME storage

Binding: `RAW_MIME` → bucket `mailagent-raw-mime`.

Purpose:

- Store full `.eml` after ingest (`raw_r2_key` on message row).
- Cache attachment bytes over `ATTACHMENT_MAX_STORE_BYTES` threshold.

Limits (env overrides):

- `RAW_MIME_MAX_BYTES` — default 15MB ingest cap
- `RAW_MIME_AGENT_MAX_BYTES` — default 512KB returned to agents via MCP
- `ATTACHMENT_MAX_STORE_BYTES` — default 2MB per attachment in R2

If R2 write fails, message row still created from Resend body — extract unaffected.

---

## KV rate limiting

Binding: `RATE_LIMIT` KV namespace.

Logic: `src/lib/rate-limit.ts` — per API key sliding window, limit from `RATE_LIMIT_PER_MINUTE` (default 120).

Optimization: `RATE_LIMIT_KV_WRITE_EVERY` (default 10) — write to KV every Nth request to reduce write quota usage. Important for CI prod gate hitting same key repeatedly.

Response on exceed: HTTP 429 with plan/quota hints; check `GET /v1/me`.

---

## Workers AI

Binding: `AI` (optional).

Uses:

| Feature | Service | Default model env |
|---------|---------|-------------------|
| Semantic search embeddings | `message-search.ts` | `SEARCH_EMBED_MODEL` → `@cf/baai/bge-base-en-v1.5` |
| Structured extract | `structured-extract.ts` | `EXTRACT_MODEL` → `@cf/meta/llama-3.1-8b-instruct` |

Requires pgvector column in `message_search` (migration). Fallback to keyword search if embedding fails.

OTP regex extract in `extract.ts` — **не** использует AI.

---

## Neon Postgres integration

Client: `getDb(env)` in `src/db/client.ts` using `@neondatabase/serverless`.

Connection: `DATABASE_URL` secret — use **pooled** connection string from Neon dashboard.

SETUP notes:

- Remove `channel_binding=require` if driver errors.
- Health check: `GET /health` executes simple query.

Migrations: `npm run db:migrate` (16 files `001_init.sql` … `016_team_dedicated_resend.sql`).

Critical tables (runtime perspective):

| Table | Runtime role |
|-------|----------------|
| `inboxes` | Address, TTL, allowlist, callback URL |
| `messages` | Parsed mail + extract fields + `provider_id` UNIQUE |
| `teams` | Tenant, plan, Stripe IDs |
| `api_keys` | Hashed keys, scopes |
| `message_search` | FTS + embeddings |
| `message_attachments` | Attachment metadata |
| `agent_run_sessions` | Agent multi-step JSON state |
| `audit_events` | Team audit trail |

Full schema: `data-model-core.md`.

---

## Resend integration

### Inbound

- Receiving domain: `INBOX_DOMAIN` (e.g. `xxxx.resend.app` or custom MX to Resend).
- Webhook event: `email.received`.
- Verification: Svix headers + `RESEND_WEBHOOK_SECRET`.

### Body fetch

Webhook does **not** include HTML body. Consumer calls:

```typescript
resend.emails.receiving.get(emailId)
```

Uses platform `RESEND_API_KEY` or team key when `resendTeamId` set.

### Outbound

`src/services/outbound-mail.ts` — send/reply via Resend. `OUTBOUND_FROM` env for verified sender. Gated to prevent open relay abuse.

### Dev tunnel

Local `wrangler dev` needs cloudflared/ngrok exposing `/webhooks/resend` — Resend cannot reach localhost.

---

## MCP transports

### 1. stdio (`@mailagent/mcp`)

```bash
node mcp/dist/index.js
# or
npx -y -p @mailagent/mcp@0.2.7 mailagent-mcp
```

Calls REST API with `MAILAGENT_API_URL` + `MAILAGENT_API_KEY` from env.

Cursor config: `.cursor/mcp.json`.

### 2. Remote HTTP

```
POST https://api.webmailagent.com/mcp
Authorization: Bearer ma_…
Content-Type: application/json
```

JSON-RPC 2.0 — same tool names as manifest.

OAuth path for browser clients: OIDC login → `mat_` access token.

### Discovery

```bash
curl -s -H "Authorization: Bearer $MAILAGENT_API_KEY" \
  https://api.webmailagent.com/v1/agent | jq .
```

Returns `mcpTools`, `auth.oidc`, `remoteMcp`, `docs`.

### Tool count sync

28 tools in `src/mcp/manifest.ts`. After changes run `npm run sync:context-os` and update AGENTS.md markers.

---

## Failure modes

| Компонент | Симптом | Диагностика | Mitigation |
|-----------|---------|-------------|------------|
| Resend webhook down / wrong URL | 0 new messages, Resend dashboard shows failures | Resend Events log; verify prod URL | Fix webhook URL; tunnel in dev |
| Invalid webhook secret | 401 on `/webhooks/resend` | Worker logs | Rotate `RESEND_WEBHOOK_SECRET` both sides |
| Queue consumer error | Delayed mail, retries | CF Queues metrics; Worker logs | Fix code/DB; inspect DLQ |
| DLQ backlog | Messages never appear | Queue `mailagent-email-dlq` | Replay after fix; simulate for QA |
| Neon unreachable | 500 on API, `/health` fail | Neon status, connection string | Fix `DATABASE_URL`; pooling |
| DO disconnect / error | SSE wait fails | CF DO metrics | Use `/wait` poll; MCP retry |
| Allowlist mismatch | Silent drop — empty inbox | `GET …/diagnose` | Fix `service` preset or `allowedSenders` |
| Rate limit / plan quota | 429 on create/wait | `GET /v1/me` | Delete stale inboxes; upgrade plan |
| R2 unavailable | No raw MIME / attachment cache | R2 dashboard | Extract still works from Resend body |
| Workers AI off / error | No semantic search / structured extract | Logs in search service | Keyword search fallback |
| Wrong API domain (522) | Timeouts from clients | curl api URL | Use Workers Custom Domain, not workers.dev CNAME |
| Stripe webhook misconfigured | Billing state drift | Stripe event log | Fix `STRIPE_WEBHOOK_SECRET` |
| OIDC misconfigured | MCP browser login fails | `npm run doctor:oidc` | Fix `OIDC_*` secrets |

### Incident triage order

1. `GET https://api.webmailagent.com/health`
2. `GET /v1/stats` (auth) — message volume 24h
3. Cloudflare Worker logs + Queue depth + DLQ
4. Resend dashboard inbound events
5. Neon dashboard connectivity
6. For single inbox: `GET …/diagnose`

---

## Dependency diagram (runtime)

```
External clients (Cursor, Codex, CI, Playwright)
        │
        │  HTTPS  MAILAGENT_API_KEY / mat_ JWT
        ▼
┌─────────────────── api.webmailagent.com ───────────────────┐
│  Worker fetch handler                                       │
│    ├─ Hono API ──────────────────────────────────────────┐ │
│    │    auth → rate limit → routes → services → Neon     │ │
│    └─ ASSETS ──► public/ (webmailagent.com static)       │ │
└──────────────────────────────────────────────────────────┘
        │                    ▲
        │ MAIL_QUEUE.send    │ queue consumer
        ▼                    │
   mailagent-email ──────────┘
        │ (fail ×5)
        ▼
   mailagent-email-dlq

Resend inbound ──webhook──► /webhooks/resend ──► MAIL_QUEUE

Queue consumer ──► Resend API (body)
                ──► Neon INSERT
                ──► R2 PUT (optional)
                ──► INBOX_WAIT /notify
                ──► callback URL POST

SSE clients ◄── INBOX_WAIT DO ◄── /notify
```

---

## Critical components (ranked)

1. **Resend webhook + Queue** — единственный путь real inbound mail на platform account.
2. **Neon Postgres** — source of truth для inboxes, messages, auth, billing state.
3. **Queue consumer (`processInboundEmail`)** — extract, persist, notify, callback.
4. **`INBOX_WAIT` Durable Object** — real-time agent wait; без него только poll.
5. **API key auth (`resolveAuth`)** — gate для всех tenant data on `/v1/inboxes/*`.
6. **`INBOX_DOMAIN` DNS/MX** — без корректного receiving domain письма не поступают.
7. **`provider_id` idempotency** — защита от duplicate messages при retries.
8. **Allowlist at ingest** — security boundary; misconfig looks like "mail never arrived".
9. **MCP manifest/handlers parity** — stdio and remote must stay in sync.
10. **OpenAPI spec** — contract for SDKs and agent code generation.

---

## Production URLs

| Surface | URL | Notes |
|---------|-----|-------|
| Marketing / docs static | `https://webmailagent.com` | Apex; www redirects here |
| API + MCP + webhooks | `https://api.webmailagent.com` | Custom Domain on Worker |
| Health | `https://api.webmailagent.com/health` | No auth |
| Agent discovery | `https://api.webmailagent.com/v1/agent` | Bearer required |
| OpenAPI | `https://api.webmailagent.com/v1/openapi.json` | Public |
| Remote MCP | `https://api.webmailagent.com/mcp` | Bearer / OAuth |
| OAuth well-known | `https://api.webmailagent.com/.well-known/oauth-authorization-server` | Public |
| Dashboard UI | `https://webmailagent.com/dashboard.html` | Static + `/v1/console/*` API |
| Docs HTML | `https://webmailagent.com/docs/*.html` | Generated/bundled in public |

**Default test/prod client env:**

```
MAILAGENT_API_URL=https://api.webmailagent.com
MAILAGENT_API_KEY=ma_…
```

Contract test orchestrators force prod URL even if local `.env` points to `127.0.0.1:8787`.

**workers.dev:** `mailagent.<subdomain>.workers.dev` exists (`workers_dev: true`) but production clients and CI use custom domain only.

---

## Service layer & SDK (compact)

**Services** (`src/services/`): `inbox`, `resend-mail`, `extract`, `wait`, `simulate-inbound`, `outbound-mail`, `callback`, `message-verify`, `inbox-diagnose`, `api-key-store`, `billing`, `domains`, `message-search`, `structured-extract`, `raw-mime-r2`, `message-attachments`, `agent-verify`, `agent-run-session`, `audit-log`.

**Lib** (`src/lib/`): `auth`, `plans`, `rate-limit`, `sender-allowlist`, `scope-guard`, `service-presets`, `mcp-jwt`, `callback-url`, `key-scope`.

OpenAPI: `src/openapi/spec.ts` → `GET /v1/openapi.json`. SDKs: `@mailagent/agent`, `@mailagent/mcp`, `@mailagent/qa`, PyPI `mailagent-agent`.

**Security (technical):** tenant isolation via API key; webhook signatures; allowlist drop at ingest; simulate auth-gated. Ops procedures → `operational-core.md`.

**Local vs prod:** dev needs webhook tunnel; secrets in `.dev.vars`; contracts target prod URL. MCP manifest `0.8.2`; wrangler `compatibility_date` `2026-01-15`; 19 migrations.
