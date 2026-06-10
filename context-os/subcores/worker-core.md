# Worker Core

Специализированное ядро: Cloudflare Worker и бизнес-логика.

## Как устроен Cloudflare Worker

**Config:** `wrangler.jsonc`
- name: `mailagent`
- main: `src/index.ts`
- account_id: `42ae092824ce3429ee3f914b43603273`
- compatibility_date: `2026-01-15`, `nodejs_compat_v2`

**Bindings:**
| Binding | Type | Purpose |
|---------|------|---------|
| ASSETS | Assets | `public/` static site |
| DATABASE_URL | Secret | Neon |
| MAIL_QUEUE | Queue | `mailagent-email` |
| INBOX_WAIT | Durable Object | SSE wait |
| RATE_LIMIT | KV | Rate limiting |
| RAW_MIME | R2 | `.eml` archive |
| AI | Workers AI | embeddings, extract |
| RESEND_*, API_KEY, INBOX_DOMAIN | Secrets | email + auth |

**Entry export (`src/index.ts`):**
```typescript
export default {
  fetch: handleFetch,    // API vs static routing
  queue: handleQueueBatch,
  scheduled: purge cron,
}
export { InboxWait };    // Durable Object class
```

**Routing (`handleFetch`):**
1. HTTP→HTTPS redirect (prod hosts)
2. www→apex redirect
3. API paths → Hono `app.fetch`
4. Else → `env.ASSETS.fetch`

## Где находится бизнес-логика

### Routes (HTTP layer) — `src/routes/`
Thin handlers: auth, validation, call services, format JSON.

| File | Domain |
|------|--------|
| `inboxes.ts` | Inbox CRUD, wait, extract, simulate |
| `webhooks.ts` | Resend/Stripe ingress |
| `agent.ts` | Agent hub, verify, run sessions |
| `mcp-http.ts` | Remote MCP JSON-RPC |
| `oauth.ts` | MCP OAuth + well-known |
| `team.ts` | Teams, API keys, dedicated Resend |
| `domains.ts` | Custom domains |
| `billing.ts` | Stripe checkout |
| `console.ts` | Dashboard API |
| `audit.ts` | Audit log read |

### Services (business logic) — `src/services/`
| File | Responsibility |
|------|----------------|
| `inbox.ts` | Create, read, delete, list, purge |
| `resend-mail.ts` | Inbound email processing |
| `extract.ts` | OTP + link extraction |
| `wait.ts` | Poll wait for messages |
| `simulate-inbound.ts` | QA inject |
| `outbound-mail.ts` | Send/reply |
| `callback.ts` | Webhook to callbackUrl |
| `message-verify.ts` | Verification DTO |
| `inbox-diagnose.ts` | Debug hints |
| `api-key-store.ts` | Auth resolution |
| `billing.ts` | Stripe integration |
| `domains.ts` | Custom domain lifecycle |
| `message-search.ts` | Search + embeddings |
| `structured-extract.ts` | Workers AI extract |
| `raw-mime-r2.ts` | R2 MIME storage |
| `message-attachments.ts` | Attachment handling |
| `agent-verify.ts` | Agent verify flow |
| `agent-run-session.ts` | Run state persistence |
| `audit-log.ts` | Audit events |

### Lib (shared utilities) — `src/lib/`
`auth.ts`, `plans.ts`, `rate-limit.ts`, `sender-allowlist.ts`, `scope-guard.ts`, `service-presets.ts`, `mcp-jwt.ts`, etc.

### Queue — `src/queue/consumer.ts`
Async email ingest bridge between webhook and DB.

### Durable Objects — `src/durable-objects/inbox-wait.ts`
SSE subscription state per inbox.

### MCP — `src/mcp/`
`manifest.ts`, `handlers.ts`, `session.ts`, `progress.ts` — tool dispatch for remote MCP.

### DB — `src/db/client.ts`
Neon serverless SQL client.

## MCP stdio (separate package)

`mcp/src/index.ts` — stdio MCP server, calls REST API via `mcp/src/client.ts`.
Built with `npm run build:mcp`, published as `@mailagent/mcp`.

## Cron

`0 * * * *` — hourly:
- `purgeExpired(env)` — delete expired inboxes
- `purgeExpiredAuditEvents(env)` — audit retention

## Local dev

```bash
npm run dev   # wrangler dev --ip 127.0.0.1 --port 8787
```

Secrets from `.dev.vars`.

## Deploy

```bash
npm run deploy   # wrangler deploy
```

CI: `.github/workflows/deploy-worker.yml` on push to main (worker paths).
