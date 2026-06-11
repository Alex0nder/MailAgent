# Worker Core — MailAgent

Специализированное ядро Context OS: Cloudflare Worker runtime, entry handlers, Hono mount, services layer, queue/cron, bindings и карта `src/`.

---

## Purpose

MailAgent — **единый Cloudflare Worker** (`mailagent`), entry point `src/index.ts`. Worker обслуживает три runtime handler'а:

1. **`fetch`** — HTTP: API (Hono) + static site (`ASSETS`) + redirects
2. **`queue`** — async ingest inbound email из Resend webhooks
3. **`scheduled`** — hourly cron: purge expired inboxes + audit retention

Бизнес-логика **не живёт в routes** — routes тонкие (auth, validation, JSON), services содержат DB/R2/Resend/AI операции. MCP tools на Worker вызывают services напрямую (`src/mcp/handlers.ts`) без HTTP loopback.

Это ядро отвечает на:
- Как устроен `src/index.ts` и порядок mount?
- Где бизнес-логика vs HTTP handlers?
- Как email попадает от webhook в DB?
- Какие bindings в `env.ts` / `wrangler.jsonc`?
- Полная карта файлов `src/`

**Не дублирует:** REST endpoint catalog (→ `api-core.md`), auth/billing (→ `auth-billing-core.md`), deploy CI (→ `deployment-testing-core.md`).

---

## Entities

### Worker Export (`src/index.ts`)

```typescript
export { InboxWait };  // Durable Object class — обязательный re-export

export default {
  fetch: handleFetch,
  queue: handleQueueBatch,
  scheduled: purgeCron,
};
```

| Handler | Функция | Файл-реализация |
|---------|---------|-----------------|
| `fetch` | `handleFetch` | `src/index.ts` |
| `queue` | `handleQueueBatch` | `src/queue/consumer.ts` |
| `scheduled` | inline в `index.ts` | вызывает `purgeExpired`, `purgeExpiredAuditEvents` |

### Env Bindings (`src/env.ts`)

Интерфейс `Env` — все Worker bindings + secrets. Типы queue message / notify payload тоже здесь.

| Binding | Type | Required | Назначение |
|---------|------|----------|------------|
| `ASSETS` | `Fetcher` | ✓ | Static `public/` (landing, docs HTML, dashboard) |
| `DATABASE_URL` | `string` | ✓ | Neon serverless Postgres |
| `RESEND_API_KEY` | `string` | ✓ | Inbound fetch + outbound send |
| `RESEND_WEBHOOK_SECRET` | `string` | ✓ | Svix verify `/webhooks/resend` |
| `API_KEY` | `string` | ✓ | Legacy master key |
| `INBOX_DOMAIN` | `string` | ✓ | Default inbox domain |
| `DEFAULT_TTL_MINUTES` | `string` | ✓ | Default inbox TTL |
| `MAIL_QUEUE` | `Queue<EmailQueueMessage>` | ✓ | Async email processing |
| `INBOX_WAIT` | `DurableObjectNamespace` | ✓ | SSE wait per inbox |
| `RATE_LIMIT` | `KVNamespace` | opt | Per-key rate limiting |
| `RATE_LIMIT_PER_MINUTE` | `string` | opt | Fallback env limit |
| `RATE_LIMIT_KV_WRITE_EVERY` | `string` | opt | Sampled KV puts (default 10) |
| `API_KEYS` | `string` | opt | Comma-separated pilot keys |
| `STRIPE_*` | `string` | opt | Billing (checkout, webhook) |
| `MCP_OAUTH_*` | `string` | opt | OAuth token TTL, JWT secret |
| `OIDC_*` | `string` | opt | Auth0/Google MCP login |
| `RAW_MIME` | `R2Bucket` | opt | `.eml` archive |
| `RAW_MIME_MAX_BYTES` | `string` | opt | Default 15MB |
| `RAW_MIME_AGENT_MAX_BYTES` | `string` | opt | MCP base64 cap 512KB |
| `ATTACHMENT_MAX_STORE_BYTES` | `string` | opt | R2 attachment cap 2MB |
| `OUTBOUND_FROM` | `string` | opt | Verified Resend From |
| `AI` | `Ai` | opt | Workers AI embeddings/extract |
| `SEARCH_EMBED_MODEL` | `string` | opt | Default `@cf/baai/bge-base-en-v1.5` |
| `EXTRACT_MODEL` | `string` | opt | Default `@cf/meta/llama-3.1-8b-instruct` |
| `AUDIT_RETENTION_DAYS` | `string` | opt | Default 90, max 365 |

### EmailQueueMessage

```typescript
interface EmailQueueMessage {
  provider: "resend";
  emailId: string;
  from: string;
  to: string[];
  subject: string;
  receivedAt: string;
  resendTeamId?: string;  // Enterprise dedicated Resend
}
```

### MessageNotifyPayload

DTO для SSE notify через Durable Object — OTP, links, verification block.

### Hono App

```typescript
const app = new Hono<{ Bindings: Env }>();
```

Монтирует 16 route modules. `handleFetch` делегирует API paths в `app.fetch(request, env, ctx)`.

### Durable Object: InboxWait

- **Class:** `src/durable-objects/inbox-wait.ts`
- **Export:** `export { InboxWait }` из `index.ts` (wrangler requirement)
- **Binding:** `INBOX_WAIT` → `idFromName(inbox.id)`
- **Endpoints (internal):**
  - `GET /subscribe` — SSE stream для agents
  - `POST /notify` — queue consumer push при новом message

### Layer separation

| Layer | Path | Ответственность |
|-------|------|-----------------|
| Entry | `src/index.ts` | fetch/queue/scheduled routing |
| Routes | `src/routes/*.ts` | HTTP: middleware, parse, status codes |
| Services | `src/services/*.ts` | Business logic, DB, external APIs |
| Lib | `src/lib/*.ts` | Shared utils, auth, plans, scope |
| MCP | `src/mcp/*.ts` | Tool dispatch (in-process) |
| Queue | `src/queue/*.ts` | Batch consumer |
| DB | `src/db/client.ts` | Neon SQL client |
| OpenAPI | `src/openapi/spec.ts` | Schema object |
| DO | `src/durable-objects/*.ts` | Stateful SSE |

---

## Decision history

| Решение | Почему |
|---------|--------|
| Single Worker для API + static | `ASSETS` binding + `run_worker_first: true` — один deploy, shared secrets |
| `handleFetch` до Hono | HTTPS/www redirects и API/static split на edge без middleware overhead |
| Queue между webhook и process | Webhook → fast 200; Resend body fetch может быть slow; retries via CF Queues |
| `msg.ack()` / `msg.retry()` | At-least-once delivery; failed ingest retry до `max_retries: 5` → DLQ |
| Durable Object для SSE | Workers CPU time limit делает 120s sync poll ненадёжным |
| DO notify из queue, не из webhook | Единый path: message в DB → then notify waiters |
| Hourly cron purge | TTL-based inbox expiry; не realtime delete — достаточно для temp inboxes |
| Purge R2 before DB delete | Orphan prevention для raw MIME и attachments |
| Services без Hono dependency | MCP handlers и queue consumer reuse той же логики |
| `nodejs_compat_v2` | Resend SDK, crypto, Stripe на Workers |
| MCP in-process (`handlers.ts`) | Нет HTTP loopback latency; shared auth context |
| stdio MCP — отдельный package | Cursor/Codex local process; calls remote REST |
| Sampled rate limit KV writes | Free-tier KV put quota на hosted |

---

## Sources

| Область | Файлы |
|---------|-------|
| Entry | `src/index.ts` |
| Config | `wrangler.jsonc` |
| Bindings type | `src/env.ts` |
| Routes | `src/routes/*.ts` |
| Services | `src/services/*.ts` |
| Queue | `src/queue/consumer.ts` |
| DO | `src/durable-objects/inbox-wait.ts` |
| MCP | `src/mcp/handlers.ts`, `src/mcp/manifest.ts` |
| stdio MCP | `mcp/src/index.ts`, `mcp/src/client.ts` |
| Local secrets | `.dev.vars` |
| Deploy CI | `.github/workflows/deploy-worker.yml` |

---

## `src/index.ts` — fetch handler

### Поток `handleFetch`

```
Request
  │
  ├─ http + prod host? ──→ 301 https://{host}{path}
  │
  ├─ www.webmailagent.com? ──→ 301 https://webmailagent.com{path}
  │
  ├─ isApi path? ──→ app.fetch() [Hono]
  │     /v1/*
  │     /webhooks/*
  │     /mcp/*
  │     /.well-known/*
  │     /health
  │
  └─ else ──→ env.ASSETS.fetch(request)  [public/ static]
```

### HTTPS redirect

```typescript
const HTTPS_HOSTS = new Set([
  "webmailagent.com",
  "www.webmailagent.com",
  "api.webmailagent.com",
]);

function isInsecureRequest(request: Request): boolean {
  // X-Forwarded-Proto: http
  // CF-Visitor: {"scheme":"http"}
  // URL protocol http:
}
```

Cloudflare не всегда включает Always Use HTTPS — Worker делает 301 на prod hosts.

**www → apex:** `www.webmailagent.com` → `webmailagent.com` (отдельно от HTTPS redirect).

### API path detection

```typescript
const isApi =
  path.startsWith("/v1") ||
  path.startsWith("/webhooks") ||
  path.startsWith("/mcp") ||
  path.startsWith("/.well-known") ||
  path === "/health";
```

Всё остальное — marketing site, docs HTML, dashboard из `public/`.

### ASSETS static routing

`wrangler.jsonc`:
```jsonc
"assets": {
  "directory": "./public",
  "binding": "ASSETS",
  "run_worker_first": true
}
```

`run_worker_first: true` — Worker `fetch` выполняется **до** asset fallback. Worker решает: API → Hono, иначе → ASSETS.

**Примеры static paths:**
- `/` → `public/index.html`
- `/docs/agents.html`
- `/dashboard.html`

---

## Hono app mount order

Точный порядок из `src/index.ts` (first-match):

| # | Mount | Module | Paths |
|---|-------|--------|-------|
| 0 | `app.use("*", cors())` | — | all Hono |
| 1 | `app.route("/", healthRoutes)` | `health.ts` | `/health` |
| 2 | `app.route("/webhooks", webhookRoutes)` | `webhooks.ts` | `/webhooks/resend`, `/stripe`, … |
| 3 | `app.route("/v1", statusRoutes)` | `status.ts` | `/v1/status` |
| 4 | `app.route("/v1", apiMetaRoutes)` | `api-meta.ts` | `/v1` (exact) |
| 5 | `app.route("/v1", openapiRoutes)` | `openapi.ts` | `/v1/openapi.json` |
| 6 | `app.route("/v1/inboxes", inboxRoutes)` | `inboxes.ts` | `/v1/inboxes/*` |
| 7 | `app.route("/v1/stats", statsRoutes)` | `stats.ts` | `/v1/stats` |
| 8 | `app.route("/v1/me", meRoutes)` | `me.ts` | `/v1/me` |
| 9 | `app.route("/v1/billing", billingRoutes)` | `billing.ts` | `/v1/billing/*` |
| 10 | `app.route("/v1/console", consoleRoutes)` | `console.ts` | `/v1/console/*` |
| 11 | `app.route("/v1/audit", auditRoutes)` | `audit.ts` | `/v1/audit` |
| 12 | `app.route("/v1/team", teamRoutes)` | `team.ts` | `/v1/team/*` |
| 13 | `app.route("/v1/domains", domainRoutes)` | `domains.ts` | `/v1/domains/*` |
| 14 | `app.route("/v1/agent", agentRoutes)` | `agent.ts` | `/v1/agent/*` |
| 15 | `app.route("/v1/oauth", oauthTokenRoutes)` | `oauth.ts` | `/v1/oauth/*` |
| 16 | `app.route("/mcp", mcpHttpRoutes)` | `mcp-http.ts` | `/mcp`, `/mcp/auth` |
| 17 | `app.route("/", wellKnownRoutes)` | `oauth.ts` | `/.well-known/*` |
| 18 | `app.notFound(...)` | — | `{ error: "not_found" }` 404 |

**Важно:** `wellKnownRoutes` mount на `/` **после** health — path `/.well-known/...` не конфликтует с `/health`.

---

## Routes vs Services — разделение

### Принцип

**Routes** (`src/routes/`):
- Парсят HTTP (query, body, headers, Accept)
- Вызывают `requireApiKey` / scope guards (через middleware)
- Маппят service errors → HTTP status + `{ error: code }`
- Форматируют JSON response (camelCase DTO)
- `auditRoute()` на mutate operations

**Services** (`src/services/`):
- Чистая бизнес-логика: SQL, R2, Resend API, Workers AI
- Принимают `env: Env` + typed options (не Hono Context)
- Возвращают rows, DTO, `{ ok, error }` unions
- Используются из routes, queue, MCP handlers, cron

### Пример потока: POST /v1/inboxes

```
inboxes.ts handler
  → scopeWriteDenied, checkInboxQuota
  → createInbox(env, { apiKeyHint, teamId, ... })   // services/inbox.ts
  → auditRoute(c, { action: "inbox.created" })
  → c.json({ id, address, ... }, 201)
```

### Пример: MCP tool (без HTTP)

```
mcp-http.ts POST /mcp tools/call
  → executeMcpTool(env, auth, name, args)   // mcp/handlers.ts
  → createInbox / waitForMessage / ...       // services/*
```

---

## Queue consumer flow

### Producer: webhooks

`src/routes/webhooks.ts`:
1. Verify Svix signature (shared or team secret)
2. Filter `email.received` events
3. `env.MAIL_QUEUE.send(job)` — non-blocking
4. Return `{ ok: true, queued: true }` fast

### Consumer: `src/queue/consumer.ts`

```typescript
export async function handleQueueBatch(batch, env) {
  for (const msg of batch.messages) {
    try {
      await processInboundEmail(env, msg.body, notifyInbox);
      msg.ack();
    } catch (err) {
      console.error("queue process failed", err);
      msg.retry();
    }
  }
}
```

### `processInboundEmail` (`src/services/resend-mail.ts`)

1. Resolve Resend client (shared or team dedicated)
2. `findInboxByAddress(env, to)` — match recipient
3. Fetch full email body from Resend API (`emailId`)
4. `isSenderAllowed()` — expectFrom / allowedSenders check
5. `extractOtp()`, `extractLinks()` — parsing
6. `storeRawMimeFromUrl()` → R2 (optional)
7. `saveAttachmentsFromEmail()` → R2 (optional)
8. `insertMessage()` → Neon
9. `resolveInboundThread()` — threading headers
10. `indexMessageSearch()` — embeddings (optional AI)
11. `fireInboxCallback()` — HTTPS callbackUrl
12. `fireTeamEventForMessage()` — team webhook (optional)
13. `notify(inbox, payload)` → DO SSE

### DO notify

```typescript
async function notifyInbox(env, inbox, payload) {
  const id = env.INBOX_WAIT.idFromName(inbox.id);
  const stub = env.INBOX_WAIT.get(id);
  await stub.fetch("http://do/notify", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
```

### wrangler queue config

```jsonc
"queues": {
  "producers": [{ "binding": "MAIL_QUEUE", "queue": "mailagent-email" }],
  "consumers": [{
    "queue": "mailagent-email",
    "max_batch_size": 5,
    "max_batch_timeout": 2,
    "max_retries": 5,
    "dead_letter_queue": "mailagent-email-dlq"
  }]
}
```

**DLQ:** `mailagent-email-dlq` — poison messages после 5 retries.

### End-to-end diagram

```
Resend SMTP
    ↓
POST /webhooks/resend (verify, enqueue)
    ↓
MAIL_QUEUE
    ↓
handleQueueBatch → processInboundEmail
    ↓
Neon (messages) + R2 (raw/attachments) + callback
    ↓
INBOX_WAIT.notify → SSE /v1/inboxes/:id/events
    ↓
Agent GET /wait or MCP wait tool → 200 + message
```

---

## Scheduled cron (purge)

### Trigger

`wrangler.jsonc`:
```jsonc
"triggers": { "crons": ["0 * * * *"] }
```

Каждый час (minute 0).

### Handler (`src/index.ts`)

```typescript
async scheduled(_controller, env) {
  const result = await purgeExpired(env);
  const audit = await purgeExpiredAuditEvents(env);
  console.log("cron purge", { ...result, auditDeleted: audit.deleted });
}
```

### `purgeExpired` (`src/services/inbox.ts`)

1. `SELECT id FROM inboxes WHERE expires_at <= NOW()`
2. `purgeRawMimeForInboxes(env, inboxIds)` — R2 cleanup
3. `purgeAttachmentR2ForInboxes(env, inboxIds)` — R2 cleanup
4. `DELETE FROM inboxes WHERE expires_at <= NOW()`
5. Return `{ inboxes, rawDeleted, attDeleted }`

### `purgeExpiredAuditEvents` (`src/services/audit-log.ts`)

Удаляет audit events старше `AUDIT_RETENTION_DAYS` (default 90, max 365).

**Примечание:** cron не трогает messages напрямую — CASCADE от inbox delete (FK) или отдельная логика в migrations.

---

## Durable Object export

Wrangler требует **named export** DO class из entry module:

```typescript
// src/index.ts
import { InboxWait } from "./durable-objects/inbox-wait";
export { InboxWait };
```

`wrangler.jsonc`:
```jsonc
"durable_objects": {
  "bindings": [{ "name": "INBOX_WAIT", "class_name": "InboxWait" }]
},
"migrations": [{ "tag": "v1", "new_sqlite_classes": ["InboxWait"] }]
```

**Usage from routes:**
```typescript
// inboxes.ts GET /:id/events
const id = c.env.INBOX_WAIT.idFromName(inbox.id);
const stub = c.env.INBOX_WAIT.get(id);
return stub.fetch("http://do/subscribe", { method: "GET" });
```

Один DO instance per inbox id — изолированные SSE subscribers.

---

## Services catalog (`src/services/`)

| File | Responsibility |
|------|----------------|
| `inbox.ts` | Create, read, delete, list, purge, quota counts, `insertMessage` |
| `resend-mail.ts` | `processInboundEmail` — queue consumer core |
| `extract.ts` | OTP + link extraction from body |
| `wait.ts` | Poll wait for messages (DB polling) |
| `simulate-inbound.ts` | QA inject without Resend |
| `outbound-mail.ts` | Send/reply via Resend |
| `callback.ts` | Fire HTTPS callbackUrl on message |
| `callback-log.ts` | Callback delivery history |
| `message-verify.ts` | Verification DTO formatter |
| `inbox-diagnose.ts` | Debug hints for timeout |
| `api-key-store.ts` | `resolveAuth`, team keys CRUD |
| `billing.ts` | Stripe checkout, portal, webhook |
| `domains.ts` | Custom domain lifecycle (Resend DNS) |
| `message-search.ts` | Keyword + semantic search (AI embeddings) |
| `structured-extract.ts` | Workers AI JSON extract |
| `raw-mime-r2.ts` | R2 `.eml` store/purge/serve |
| `message-attachments.ts` | Attachment ingest/serve/purge |
| `message-raw.ts` | Raw message HTTP response builder |
| `agent-verify.ts` | `POST /v1/agent/verify` orchestration |
| `agent-runs.ts` | List agent runs by label |
| `agent-run-session.ts` | Run session get/patch (KV or DB) |
| `audit-log.ts` | Audit write/list/purge |
| `console-summary.ts` | Dashboard aggregate |
| `console-threads.ts` | Recent threads for console |
| `console-inbox.ts` | Inbox detail for console |
| `console-stats.ts` | Scoped usage for `/v1/me` |
| `stats.ts` | Global usage stats |
| `team-resend.ts` | Enterprise dedicated Resend |
| `team-event-webhook.ts` | Team-wide event HTTPS webhook |
| `mcp-oauth.ts` | Issue `mat_` access tokens |
| `oidc-oauth.ts` | Auth0/Google authorization_code |
| `embeddings.ts` | Workers AI embed helper |
| `thread-resolve.ts` | Inbound threading (In-Reply-To, References) |

---

## Lib + MCP (`src/lib/`, `src/mcp/`)

**Lib (20 файлов):** auth/context (`auth.ts`, `api-context.ts`), plans/rate-limit (`plans.ts`, `rate-limit.ts`), scope (`key-scope.ts`, `scope-guard.ts`), presets/recipes, callback/sender validation, MCP/OIDC JWT helpers, `public-origin.ts`, `team-secrets.ts`. Полный список — `ls src/lib/`.

## MCP layer (`src/mcp/`)

| File | Role |
|------|------|
| `manifest.ts` | `MCP_TOOLS` (23), `MCP_SERVER_INFO`, `MCP_TOOL_NAMES` |
| `handlers.ts` | `executeMcpTool()` — in-process service calls |
| `session.ts` | Streamable HTTP session (KV) |
| `session-progress.ts` | Progress relay (KV, optional) |
| `progress.ts` | Wait tool progress notifications |
| `sse-response.ts` | SSE helpers for MCP HTTP |

**stdio MCP (отдельный package):**
- Entry: `mcp/src/index.ts`
- REST client: `mcp/src/client.ts`
- Build: `npm run build:mcp`
- Publish: `@mailagent/mcp` on npm
- Codex: `npx -y -p @mailagent/mcp mailagent-mcp`

---

## Durable Objects (`src/durable-objects/`)

| File | Class | Role |
|------|-------|------|
| `inbox-wait.ts` | `InboxWait` | SSE subscribers per inbox |

---

## wrangler.jsonc summary

| Setting | Value |
|---------|-------|
| `name` | `mailagent` |
| `main` | `src/index.ts` |
| `account_id` | `42ae092824ce3429ee3f914b43603273` |
| `compatibility_date` | `2026-01-15` |
| `compatibility_flags` | `nodejs_compat_v2` |
| KV | `RATE_LIMIT` |
| Queue | `mailagent-email` (+ DLQ) |
| DO | `InboxWait` |
| R2 | `mailagent-raw-mime` |
| AI | Workers AI binding |
| Assets | `./public` |
| Cron | `0 * * * *` |

**Default vars:** `DEFAULT_TTL_MINUTES=30`, `RATE_LIMIT_PER_MINUTE=120`, `AUDIT_RETENTION_DAYS=90`.

---

## Local dev & deploy

### Local

```bash
npm run dev
# wrangler dev --ip 127.0.0.1 --port 8787
```

Secrets: `.dev.vars` (copy from `.dev.vars.example`).

### Deploy

```bash
npm run deploy
# wrangler deploy
```

CI: `.github/workflows/deploy-worker.yml` on push to `main` (worker path filters).

### Env check

```bash
npm run doctor        # local bindings
npm run doctor:qa     # prod API key smoke
```

---

## File map: структура `src/`

| Директория | Файлов | Entry / ключевые |
|------------|--------|------------------|
| `/` | 2 | `index.ts` (fetch/queue/scheduled), `env.ts` |
| `routes/` | 16 | `inboxes.ts` (largest), `agent.ts`, `mcp-http.ts`, `webhooks.ts` |
| `services/` | 30 | `inbox.ts`, `resend-mail.ts`, `api-key-store.ts`, `billing.ts` |
| `lib/` | 20 | `auth.ts`, `plans.ts`, `rate-limit.ts`, `key-scope.ts` |
| `mcp/` | 6 | `manifest.ts`, `handlers.ts`, `session.ts` |
| `queue/` | 1 | `consumer.ts` |
| `durable-objects/` | 1 | `inbox-wait.ts` |
| `db/` | 1 | `client.ts` |
| `openapi/` | 1 | `spec.ts` |
| `types/` | 1 | `parse-otp-message.d.ts` |

**Смежные packages:** `mcp/` (`@mailagent/mcp` stdio), `packages/mailagent-agent/`, `packages/mailagent-qa/`.

**Типичные точки входа:** новый endpoint → `routes/` + `services/` + mount в `index.ts`; ingest → `webhooks.ts` → `consumer.ts` → `resend-mail.ts`; SSE → `inbox-wait.ts` + `consumer.ts` notify; MCP tool → `mcp/manifest.ts` + `handlers.ts`; binding → `env.ts` + `wrangler.jsonc`.

---

## Связанные ядра

| Ядро | Когда грузить вместе |
|------|---------------------|
| `api-core.md` | Endpoint catalog, middleware, contract tests |
| `auth-billing-core.md` | resolveAuth, plans, Stripe |
| `inbox-core.md` | TTL, wait, simulate |
| `email-core.md` | Resend ingest, outbound |
| `data-model-core.md` | Neon schema, migrations |
| `deployment-testing-core.md` | wrangler deploy, CI gates |
| `serialization-core.md` | DTO field naming |
