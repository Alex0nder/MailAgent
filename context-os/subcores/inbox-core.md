# Inbox Core

Специализированное ядро: жизненный цикл temporary inbox.

## Как работают inboxes

- Запись в Neon таблица `inboxes` с TTL (`expires_at`).
- Адрес: `inbox-{nanoid12}@{INBOX_DOMAIN}` или `{username}@{verified-domain}`.
- Поля: `allowed_senders`, `label`, `callback_url`, `api_key_hint`, `domain_id`.
- Привязка к team через `api_key_hint` / team keys.
- Истекают по TTL; cron hourly `purgeExpired()` удаляет expired + связанные R2.

**Source:** `src/services/inbox.ts`, `migrations/001_init.sql`, `003_qa_fields.sql`.

## Как создаются

| Method | Path | Notes |
|--------|------|-------|
| POST | `/v1/inboxes` | Full create |
| POST | `/v1/inboxes/open` | Create + wait + extract + optional delete |
| MCP | `mailagent_create_inbox` | Same options |

**Body options:**
- `ttlMinutes` (default `DEFAULT_TTL_MINUTES`=30, max 1440)
- `service` → resolves `expectFrom` via presets
- `expectFrom` / `allowedSenders` — sender allowlist
- `label` (max 128) — QA tracing
- `callbackUrl` — HTTPS webhook on message
- `username` + `domainId` — custom domain (must be verified)

**Errors:** `domain_not_found`, `domain_not_verified`, `username_requires_domain`, `429 inbox_limit_reached`.

**Quota:** `countActiveInboxesForTeam/Hint` vs `PLAN_LIMITS[plan].maxActiveInboxes`.

## Как читаются письма

| Method | Path |
|--------|------|
| GET | `/v1/inboxes/:id` |
| GET | `/v1/inboxes/:id/messages` |
| GET | `/v1/inboxes/:id/messages/:messageId/raw` |
| GET | `/v1/inboxes/:id/extract` |
| GET | `/v1/inboxes/:id/threads` |
| GET | `/v1/inboxes/:id/search?q=` |
| GET | `/v1/inboxes?label=` / `labelPrefix=` |
| GET | `/v1/inboxes/:id/diagnose` |
| GET | `/v1/inboxes/:id/callbacks` |

MCP: `mailagent_list_messages`, `mailagent_get_inbox`, `mailagent_list_inboxes`, `mailagent_diagnose_inbox`.

**Access control:** `apiKeyHint` / `teamId` — cross-team → 404.

## Как удаляются

| Method | Path |
|--------|------|
| DELETE | `/v1/inboxes/:id` |
| DELETE | `/v1/inboxes?labelPrefix=` | bulk QA cleanup |
| Auto | `open` with `deleteAfter: true` (default) |
| Auto | cron `purgeExpired` on `expires_at` |

MCP: `mailagent_delete_inbox`.

**Cascade:** messages deleted via FK; R2 raw MIME + attachments purged (`purgeRawMimeForInboxes`, `purgeAttachmentR2ForInboxes`).

## Wait mechanisms

- SSE: `GET /v1/inboxes/:id/events` → Durable Object
- Poll: `GET /v1/inboxes/:id/wait?timeout=&subjectContains=&messageIndex=`
- Server poll in `waitForMessage()` — 500ms interval, max 120s

## Key files

- `src/routes/inboxes.ts` — HTTP routes
- `src/services/inbox.ts` — CRUD
- `src/lib/sender-allowlist.ts` — allowlist normalize/check
- `src/lib/scope-guard.ts` — scoped key enforcement
- `src/durable-objects/inbox-wait.ts` — SSE
