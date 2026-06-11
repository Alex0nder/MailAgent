# Inbox Core — MailAgent

Специализированное ядро Context OS: **жизненный цикл temporary inbox** — создание, чтение, ожидание писем, квоты, scoped keys, custom domains, purge и диагностика.

**Когда грузить:** «как создать inbox?», `inbox_limit_reached`, scoped key 404, `POST /open`, wait timeout, `callbackUrl`, bulk delete по `labelPrefix`, custom domain inbox.

**Связанные subcores:** `email-core` (ingest писем), `otp-core` (wait + extract), `serialization-core` (verification JSON), `auth-billing-core` (plan limits), `data-model-core` (таблица `inboxes`).

---

## Purpose

Temporary inbox — disposable email-адрес с TTL, привязанный к API key (через `api_key_hint`) и опционально к verified custom domain. Inbox — **контейнер** для verification flow: агент создаёт адрес, подставляет в signup form, ждёт письмо, читает OTP/link, удаляет inbox.

Ядро отвечает на пять групп вопросов:

### 1. CRUD и адресация

Создание (`createInbox`), чтение (`getInbox`, `listInboxes`), удаление (`deleteInbox`, bulk по prefix). Адрес по умолчанию: `inbox-{nanoid12}@{INBOX_DOMAIN}`. Custom domain: `{username}@{verified-domain}` через `domainId` + `username`.

### 2. Ожидание писем (wait / SSE)

Server-side poll (`waitForMessage`, 500 ms, max 120 s), HTTP long-poll (`GET …/wait`), SSE через Durable Object (`GET …/events`). One-shot `POST /open` = create + wait + extract + delete.

### 3. Квоты и изоляция tenant

`countActiveInboxesForTeam` / `countActiveInboxesForHint` vs `PLAN_LIMITS[plan].maxActiveInboxes`. Cross-team доступ маскируется как `inbox_not_found` (404).

### 4. Scoped API keys

`labelPrefix` и `readOnly` ограничивают create/list/delete и write-операции. Inbox без hint виден всем ключам (legacy); с hint — только владельцу.

### 5. TTL, purge, callbacks

`expires_at` из `ttlMinutes` (default 30, max 1440). Cron `purgeExpired()` удаляет expired + R2 raw/attachments. `callbackUrl` — HTTPS webhook на каждое inbound письмо.

---

## Entities

### InboxRow

Файл: `src/services/inbox.ts`

```typescript
export interface InboxRow {
  id: string;                    // nanoid(12)
  address: string;               // UNIQUE, lowercase match at ingest
  expires_at: string;            // ISO TIMESTAMPTZ
  created_at: string;
  allowed_senders: string[];     // empty = accept all (migration 002)
  label: string | null;          // QA trace, max 128 in create
  callback_url: string | null;   // HTTPS webhook
  api_key_hint: string | null;   // first 16 hex SHA-256 of API key
  domain_id?: string | null;     // FK → domains (custom domain inbox)
}
```

Postgres: таблица `inboxes` — см. `data-model-core`.

### MessageRow (связанная сущность)

Inbox не хранит письма inline — только через `messages` FK. Ключевые поля для read-path: `otp`, `links_json`, `raw_r2_key`, `thread_id`, `direction`.

### ApiKeyScope (доступ к inbox)

Файл: `src/lib/key-scope.ts`

```typescript
type ApiKeyScope = {
  labelPrefix: string | null;  // max 64; list/create label must start with
  readOnly: boolean;           // blocks POST/DELETE/open/simulate/send
};
```

### WaitProgressEvent / WaitTimeoutDebug

Файл: `src/services/wait.ts`

| Тип | Поля | Назначение |
|-----|------|------------|
| `WaitProgressEvent` | `inboxId`, `elapsedSec`, `timeoutSec`, `progress`, `status`, `message`, `messageCount?` | MCP progress notifications |
| `WaitTimeoutDebug` | `messageCount`, `matchingCount`, `messageIndex`, `subjectContains?`, `subjects[]`, `hint` | 408 timeout context |

### InboxDiagnoseResult

Файл: `src/services/inbox-diagnose.ts` — агрегат messages, callbacks, `waitDebug`, `troubleshooting[]`, `debugUiUrl`.

### REST response shapes

`formatInbox()` в `routes/inboxes.ts`:

```typescript
{
  address, expiresAt, createdAt,
  allowedSenders, label, callbackUrl,
  domainId?,  // if custom domain
  id?, messageCount?
}
```

---

## Decision history

| # | Решение | Дата/фаза | Статус |
|---|---------|-----------|--------|
| I1 | Inbox id = nanoid(12), address prefix `inbox-{id}` | 001_init | active |
| I2 | `allowed_senders` empty = accept all senders | 002 | active |
| I3 | QA fields: `label`, `callback_url` | 003 | active |
| I4 | `api_key_hint` tenant isolation | 004 | active |
| I5 | Scoped keys: labelPrefix + readOnly | 008 | active |
| I6 | Custom domain inboxes via `domain_id` | 012 | active |
| I7 | `POST /open` one-shot для agents/CI | product | active |
| I8 | SSE DO вместо только long-poll | INBOX_WAIT | active |
| I9 | Quota per team (all key_hints) not per key | hosted | active |
| I10 | Cross-team → 404 `inbox_not_found` | security | active |
| I11 | Legacy inbox (no hint) visible to any key | migration | active |
| I12 | Bulk delete `DELETE /v1/inboxes?labelPrefix=` | QA | active |
| I13 | `purgeExpired` cascade R2 before DELETE | 009 | active |
| I14 | `callbackUrl` HTTPS-only, no private IP | callback-url.ts | active |
| I15 | `messageIndex` для welcome vs verify email | wait.ts | active |

### Narrative decisions

**I4 — api_key_hint.** При create записывается первые 16 hex SHA-256 Bearer token. `getInbox` фильтрует: если hint на inbox задан и не совпадает с текущим ключом → `null` (404). Legacy inboxes без hint доступны любому ключу (операторский режим).

**I5 — Scoped keys.** CI-ключ с `labelPrefix: "ci-e2e-"` может создавать только labels с этим prefix; list принудительно фильтрует prefix; чужой inbox по label → 404. `readOnly` блокирует create/delete/open/simulate/send — 403 `scope_read_only`.

**I7 — POST /open.** Агенту не нужен отдельный create + wait + extract + delete: один endpoint возвращает `verification` или 408 с debug. По умолчанию `deleteAfter: true` — inbox удаляется даже при timeout (если не передан существующий `inboxId` через MCP).

**I8 — Durable Object SSE.** Cloudflare Workers ограничивают длительный HTTP poll; DO `InboxWait` держит подписчиков и получает `POST /notify` из queue consumer после ingest. MCP stdio клиент может подписаться через `mcp/src/sse.ts`.

**I9 — Team quota.** `countActiveInboxesForTeam` считает все active inboxes где `api_key_hint IN (SELECT key_hint FROM api_keys WHERE team_id = ?)`. Один агент не может исчерпать квоту другого ключа той же команды отдельным лимитом.

**I11 — Legacy visibility.** Inboxes созданные до hint или оператором без hint — видны всем API keys. Новые inboxes всегда получают hint при create через REST/MCP.

---

## Sources

| Модуль | Роль |
|--------|------|
| `src/services/inbox.ts` | CRUD, messages, quota, purge, threading lookup |
| `src/routes/inboxes.ts` | HTTP routes, formatters, quota check |
| `src/services/wait.ts` | Server-side poll, timeout debug |
| `src/durable-objects/inbox-wait.ts` | SSE subscribe + broadcast |
| `src/services/inbox-diagnose.ts` | `GET …/diagnose` aggregation |
| `src/lib/scope-guard.ts` | HTTP scope checks |
| `src/lib/key-scope.ts` | Scope rules |
| `src/lib/sender-allowlist.ts` | `normalizeAllowedSenders`, `isSenderAllowed` |
| `src/lib/callback-url.ts` | `parseCallbackUrl` validation |
| `src/lib/service-presets.ts` | `service` → expectFrom, TTL |
| `src/services/domains.ts` | Custom domain verify |
| `migrations/001_init.sql`, `003_qa_fields.sql`, `012_domains.sql` | Schema |

---

## Жизненный цикл inbox (ASCII)

```
  Agent / CI                    API Worker                    Storage / DO
      |                              |                              |
      |  POST /v1/inboxes            |                              |
      |  (or MCP create_inbox)       |                              |
      |----------------------------->|  checkInboxQuota()             |
      |                              |  scopeLabelForCreate()       |
      |                              |  createInbox()               |
      |                              |----------------------------->| INSERT inboxes
      |  201 { id, address }         |                              |
      |<-----------------------------|                              |
      |                              |                              |
      |  Fill signup form with       |                              |
      |  address                     |                              |
      |                              |                              |
      |  GET …/events (SSE)          |                              |
      |  or GET …/wait               |                              |
      |----------------------------->|  waitForMessage() loop       |
      |                              |       poll listMessages      |
      |                              |                              |
      |         [Resend inbound]     |                              |
      |                              |  webhook → MAIL_QUEUE        |
      |                              |  processInboundEmail()       |
      |                              |  insertMessage()             |
      |                              |  notifyInbox → INBOX_WAIT DO |
      |                              |----------------------------->| POST /notify
      |  SSE event: message          |                              |
      |<-----------------------------|  (or poll finds message)   |
      |                              |                              |
      |  GET …/extract               |                              |
      |  or verification in /open    |  formatMessageVerification() |
      |<-----------------------------|                              |
      |                              |                              |
      |  DELETE …/id                 |  purge R2 + DELETE inbox     |
      |----------------------------->|----------------------------->| CASCADE messages
      |  { deleted: true }           |                              |
      |<-----------------------------|                              |
      |                              |                              |
      |         [TTL expires]        |  cron purgeExpired()         |
      |                              |----------------------------->| DELETE expired
```

---

## CRUD: создание

### Endpoints

| Method | Path | Scope | Notes |
|--------|------|-------|-------|
| POST | `/v1/inboxes` | write | Standard create |
| POST | `/v1/inboxes/open` | write | Create + wait + extract + delete |
| MCP | `mailagent_create_inbox` | write | Same as POST |
| MCP | `mailagent_wait_and_extract` | write/read | May create if no inboxId |

### Request body (CreateBody)

```typescript
{
  ttlMinutes?: number;       // default DEFAULT_TTL_MINUTES (30), max 1440
  service?: string;        // → expectFrom via SERVICE_EXPECT_FROM
  expectFrom?: string | string[];
  allowedSenders?: string | string[];
  label?: string;            // max 128
  callbackUrl?: string;      // HTTPS only
  username?: string;         // requires domainId
  domainId?: string;         // verified custom domain
  // open-only:
  subjectContains?: string;
  messageIndex?: number;
  timeoutSeconds?: number;   // max 120
  deleteAfter?: boolean;     // default true for open
}
```

### createInbox() — ключевая логика

Файл: `src/services/inbox.ts`

1. `ttl` = `options.ttlMinutes ?? env.DEFAULT_TTL_MINUTES ?? 30`
2. `allowed` = `normalizeAllowedSenders(allowedSenders ?? expectFrom)`
3. `id` = `nanoid(12)`
4. **Custom domain branch:** `getDomainForInbox(domainId, { teamId, apiKeyHint })` → errors `domain_not_found`, `domain_not_verified`; address = `{sanitizeInboxLocalPart(username, inbox-{id})}@{domain.name}`
5. **Default branch:** `username` without `domainId` → `username_requires_domain`; address = `inbox-{id}@{INBOX_DOMAIN}`
6. `expiresAt` = now + ttl × 60_000 ms
7. INSERT с `api_key_hint` (16 chars), `callback_url`, `domain_id`

### Ошибки создания

| error | HTTP | Условие | hint |
|-------|------|---------|------|
| `invalid_callback_url` | 400 | callbackUrl не прошёл `parseCallbackUrl` | HTTPS, no localhost |
| `inbox_limit_reached` | 429 | active >= maxActiveInboxes | plan, active, max |
| `domain_not_found` | 404 | domainId не найден / не team | — |
| `domain_not_verified` | 400 | domain.status !== verified | DNS records |
| `username_requires_domain` | 400 | username без domainId | Pass domainId |
| `label_required` | 403 | scoped key без label | prefix required |
| `label_prefix_mismatch` | 403 | label не начинается с scope prefix | — |
| `scope_read_only` | 403 | readOnly key на write route | — |

### Quota check

`checkInboxQuota()` в `routes/inboxes.ts`:

```typescript
const active = teamId
  ? await countActiveInboxesForTeam(env, teamId)
  : await countActiveInboxesForHint(env, apiKeyHint);
const max = c.get("maxActiveInboxes");  // PLAN_LIMITS at auth
if (active >= max) → 429 inbox_limit_reached
```

| Plan | maxActiveInboxes |
|------|------------------|
| free | 10 |
| pro | 100 |
| enterprise | 500 |
| legacy | 500 |

---

## CRUD: чтение

### Endpoints

| Method | Path | Response |
|--------|------|----------|
| GET | `/v1/inboxes` | `{ inboxes[], labelPrefix? }` |
| GET | `/v1/inboxes/:id` | inbox + `messageCount` |
| GET | `/v1/inboxes/:id/messages` | `{ messages[], subjectContains? }` |
| GET | `/v1/inboxes/:id/extract` | latest `MessageVerification` |
| GET | `/v1/inboxes/:id/diagnose` | full troubleshoot bundle |
| GET | `/v1/inboxes/:id/callbacks` | callback delivery log |
| GET | `/v1/inboxes/:id/threads` | thread summaries |
| GET | `/v1/inboxes/:id/search?q=` | keyword/semantic search |
| MCP | `mailagent_get_inbox` | Same as GET :id |
| MCP | `mailagent_list_inboxes` | Same as GET / |
| MCP | `mailagent_list_messages` | messages list |
| MCP | `mailagent_diagnose_inbox` | diagnose |

### listInboxes() — фильтры

Файл: `src/services/inbox.ts`

| Query | SQL behavior | Limits |
|-------|--------------|--------|
| `labelPrefix` (≥3 chars) | `label LIKE '{prefix}%'` AND `expires_at > NOW()` | limit max 50 |
| `label` (exact) | `label = ?` AND not expired | limit max 50 |
| `apiKeyHint` | `api_key_hint IS NULL OR api_key_hint = hint` | tenant filter |
| (none) | all non-expired, ORDER BY created_at DESC | limit max 50 |

**Scoped list:** `scopeListPrefix(c, requested)` — если у ключа есть `labelPrefix`, запрошенный prefix должен начинаться с него; иначе принудительно подставляется scope prefix.

### getInbox() — access control

```typescript
// 1. SELECT WHERE id AND expires_at > NOW()
// 2. inboxAccessible(row, apiKeyHint):
//    - no row.api_key_hint → true (legacy)
//    - no apiKeyHint caller → false
//    - row.api_key_hint === apiKeyHint → true
// 3. scopeInboxDenied: assertInboxAccessible(scope, inbox.label)
```

Cross-team и wrong hint → **404** `inbox_not_found` (не 403).

### listMessages() / getMessage()

`listMessages(env, inboxId, { subjectContains? })` — ORDER BY `received_at DESC`; client-side filter по subject substring (case-insensitive).

`getMessage(env, inboxId, messageId)` — single row, no access re-check (route checks inbox first).

---

## CRUD: удаление

| Method | Path | Behavior |
|--------|------|----------|
| DELETE | `/v1/inboxes/:id` | Single delete |
| DELETE | `/v1/inboxes?labelPrefix=` | Bulk QA cleanup |
| Auto | `POST /open` timeout | delete if `deleteAfter !== false` |
| Auto | `POST /open` success | delete if `deleteAfter !== false` (default) |
| Auto | cron | `purgeExpired()` hourly |
| MCP | `mailagent_delete_inbox` | Same as DELETE :id |

### deleteInbox()

1. `getInbox` (access check)
2. `purgeRawMimeForInboxes(env, [id])`
3. `purgeAttachmentR2ForInboxes(env, [id])`
4. `DELETE FROM inboxes WHERE id` → CASCADE messages

### deleteInboxesByLabelPrefix()

- Prefix min 3 chars
- Only inboxes where `api_key_hint IS NULL OR api_key_hint = caller hint`
- Returns `string[]` deleted ids
- Scoped key: `scopeListPrefix` на query param

---

## TTL и purge

### TTL resolution

`resolveTtlMinutes(service, ttlMinutes)` — service preset может override (e.g. `github: 60`). Иначе body `ttlMinutes`, иначе `DEFAULT_TTL_MINUTES` (wrangler var, default 30). Hard cap 1440 в MCP Zod.

### purgeExpired()

Cron trigger (см. `worker-core`):

```typescript
// 1. SELECT ids WHERE expires_at <= NOW()
// 2. purgeRawMimeForInboxes(ids)
// 3. purgeAttachmentR2ForInboxes(ids)
// 4. DELETE inboxes RETURNING id
// Returns { inboxes, rawDeleted, attDeleted }
```

Expired inbox **невидим** в `getInbox` / `findInboxByAddress` (`expires_at > NOW()`).

---

## Custom domains

Flow при `domainId` + optional `username`:

1. `getDomainForInbox(env, domainId, { teamId, apiKeyHint })` — domain must belong to team
2. `domain.status === "verified"` — иначе `domain_not_verified`
3. `sanitizeInboxLocalPart(username, fallback)` — local part validation
4. `address = "{local}@{domain.name}"`, `domain_id` stored

Без `domainId` username запрещён (`username_requires_domain`).

Enterprise outbound с dedicated Resend **требует** custom domain inbox — см. `email-core`.

---

## callbackUrl

### Validation

`parseCallbackUrl()` (`lib/callback-url.ts`):
- Только `https://`
- Max 2048 chars
- Reject localhost, private IP, link-local

### Fire timing

После успешного `insertMessage` в `processInboundEmail` / `simulateInboundMessage`:

```typescript
POST callbackUrl
Content-Type: application/json
{
  "event": "message.received",
  ...MessageNotifyPayload,
  "address": inbox.address,
  "label": inbox.label
}
```

Delivery logged в `callback_deliveries`. Inspect: `GET /v1/inboxes/:id/callbacks`.

Simulate: `fireCallback: true` в body для теста без реального inbound.

---

## Wait mechanisms

### Server poll — waitForMessage()

```typescript
waitForMessage(env, inboxId, timeoutSec, {
  subjectContains?,   // filter before index pick
  messageIndex?,      // 0 = newest match (default)
  onProgress?,        // MCP progress callback
})
```

- `cap = min(max(timeoutSec, 5), 120)`
- Loop: `listMessages` → pick `messages[index]` → sleep 500ms
- Returns `MessageRow | null`

### HTTP GET /v1/inboxes/:id/wait

Query: `timeout` (max 120), `subjectContains`, `messageIndex`. Timeout → 408 + `WaitTimeoutDebug`.

### SSE GET /v1/inboxes/:id/events

Proxy to Durable Object `INBOX_WAIT.idFromName(inbox.id)` → `GET /subscribe`.

Events:
- `connected` — initial
- `message` — `MessageNotifyPayload` JSON after ingest

### POST /v1/inboxes/open (one-shot)

```
createInbox → waitForMessage → formatMessageVerification
→ deleteInbox (if deleteAfter !== false)
→ 201 { verification, deleted } or 408 { timeout, ...debug }
```

`deleteAfter: false` — оставить inbox после success/timeout (для debug).

---

## diagnose

`GET /v1/inboxes/:id/diagnose?subjectContains=&messageIndex=`

`buildInboxDiagnose()` возвращает:
- inbox metadata + `messageCount`
- last messages с otp, primaryLink, rawUrl
- last 20 callback deliveries
- `waitDebug` (same as timeout 408)
- `troubleshooting[]` — human hints
- `debugUiUrl` — web UI deep link
- `apiMessagesUrl` — REST shortcut

MCP: `mailagent_diagnose_inbox` — preferred debug tool для агентов.

---

## insertMessage и threading helpers

### insertMessage()

- `provider_id` UNIQUE — idempotency (duplicate ingest → catch → null)
- Default `thread_id = id` for new thread
- `direction` default `inbound`

### findInboxByAddress()

`LOWER(address) = normalized` AND not expired — used at ingest to match Resend `to[]`.

### findMessageForThreading()

Match `rfc_message_id` or `provider_id` against In-Reply-To / References variants.

### countActiveInboxesForHint / ForTeam

Quota enforcement — см. раздел Quota.

---

## Полный справочник функций inbox.ts

| Function | Signature | Назначение |
|----------|-----------|------------|
| `createInbox` | `(env, options?) → InboxRow \| {error}` | INSERT inbox |
| `isCreateInboxError` | type guard | Discriminate error union |
| `listInboxes` | `(env, {label, labelPrefix, limit, apiKeyHint})` | Filtered list |
| `getInbox` | `(env, id, {apiKeyHint?})` | Single + access |
| `inboxAccessible` | `(row, hint?) → boolean` | Hint ownership |
| `findInboxByAddress` | `(env, address)` | Ingest routing |
| `deleteInbox` | `(env, id, {apiKeyHint?})` | Purge R2 + DELETE |
| `deleteInboxesByLabelPrefix` | `(env, prefix, hint)` | Bulk QA |
| `listMessages` | `(env, inboxId, {subjectContains?})` | DESC by received_at |
| `getMessage` | `(env, inboxId, messageId)` | Single message |
| `insertMessage` | `(env, input)` | INSERT, idempotent |
| `countActiveInboxesForHint` | `(env, hint)` | Quota per key |
| `countActiveInboxesForTeam` | `(env, teamId)` | Quota per team |
| `findMessageForThreading` | `(env, inboxId, refIds)` | Thread parent |
| `purgeExpired` | `(env)` | Cron cleanup |

---

## Коды ошибок (inbox routes)

| error | HTTP | Route context |
|-------|------|---------------|
| `inbox_not_found` | 404 | get/delete/wait/… — wrong id, expired, hint, scope |
| `message_not_found` | 404 | attachments/raw/reply parent |
| `no_messages` | 404 | GET extract без писем |
| `timeout` | 408 | wait, open |
| `inbox_limit_reached` | 429 | create, open |
| `labelPrefix_required` | 400 | bulk delete без param |
| `labelPrefix_too_short` | 400 | prefix < 3 |
| `invalid_json` | 400 | malformed body |
| `to_and_subject_required` | 400 | send |
| `send_failed` | 500/502/403 | outbound |
| `simulate_failed` | 500 | simulate |
| `q_required` | 400 | search без query |
| `scope_read_only` | 403 | write на readOnly key |
| `scope_admin_required` | 403 | admin ops |
| `invalid_callback_url` | 400 | bad callbackUrl |

---

## Scoped keys — практика

### CI key example

```json
{
  "scope": {
    "labelPrefix": "ci-e2e-",
    "readOnly": false
  }
}
```

- Create: `label` must start with `ci-e2e-`
- List: `labelPrefix` query forced to `ci-e2e-` minimum
- Access inbox with `label: "other-test"` → 404

### readOnly key

- GET routes work
- POST create, DELETE, simulate, send, open → 403 `scope_read_only`
- MCP `mailagent_wait_and_extract` with existing inboxId — wait allowed; delete requires write

---

## MCP tools (inbox surface)

| Tool | Maps to |
|------|---------|
| `mailagent_create_inbox` | POST /v1/inboxes |
| `mailagent_list_inboxes` | GET /v1/inboxes |
| `mailagent_get_inbox` | GET /v1/inboxes/:id |
| `mailagent_delete_inbox` | DELETE /v1/inboxes/:id |
| `mailagent_wait_for_message` | GET …/wait logic |
| `mailagent_wait_and_extract` | open-like flow |
| `mailagent_diagnose_inbox` | GET …/diagnose |
| `mailagent_list_messages` | GET …/messages |
| `mailagent_simulate_message` | POST …/simulate |

---

## Troubleshooting checklist

| Симптом | Проверка |
|---------|----------|
| 404 на свой inbox | hint mismatch, expired, scoped label |
| 429 при create | `GET /v1/me` → active vs max; delete stale |
| Timeout wait | `diagnose`, allowlist, subjectContains, messageIndex |
| Письма не в inbox | `email-core` — webhook, allowlist, domain |
| Callback не приходит | `GET …/callbacks`, HTTPS reachability |
| Bulk delete 0 ids | wrong prefix, hint filter, min 3 chars |

**Doc:** `docs/QA-TROUBLESHOOTING.md`, `docs/QA-SIMULATE.md`

---

## Тесты

`inbox.ts` / `routes/inboxes.ts` → `npm run test:contract:qa`; перед merge → `npm run test:prod`.
