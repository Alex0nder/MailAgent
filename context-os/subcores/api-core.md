# API Core — MailAgent

Специализированное ядро Context OS: REST API, discovery, OpenAPI, MCP HTTP, контрактные тесты и паттерны запросов/ответов.

---

## Purpose

MailAgent экспонирует **единый HTTP surface** на Cloudflare Worker (`src/index.ts`). Prod base URL: `https://api.webmailagent.com`. Все бизнес-операции (inbox, verify, team, billing, domains, console) — под префиксом `/v1/*`. Агенты и CI потребляют API через Bearer auth, OpenAPI codegen, SDK (`@mailagent/agent`) или remote MCP (`POST /mcp`).

Это ядро отвечает на вопросы:
- Какой endpoint вызвать для конкретной операции?
- Какая auth/middleware цепочка на маршруте?
- Какие коды ошибок и статусы ожидать?
- Как устроена tenant isolation (`apiKeyHint`, `teamId`, scope)?
- Где discovery, OpenAPI, contract tests?

**Не дублирует** детали auth/billing (→ `auth-billing-core.md`), inbox lifecycle (→ `inbox-core.md`), Worker runtime (→ `worker-core.md`).

---

## Entities

### Hono App (`src/index.ts`)

| Сущность | Файл | Роль |
|----------|------|------|
| `app` | `src/index.ts` | Корневой Hono с CORS, mount всех route modules |
| `handleFetch` | `src/index.ts` | Роутинг API vs static ASSETS, HTTPS/www redirects |
| Route module | `src/routes/*.ts` | Тонкий HTTP-слой: auth → rate limit → scope → service |

### ApiVariables (контекст после auth)

Тип в `src/lib/api-context.ts`, заполняется `applyAuthContext()` в `src/lib/auth.ts`:

```typescript
type ApiVariables = {
  apiKeyHint: string;           // SHA-256 prefix, rate limit key
  apiPlan: PlanId;              // free | pro | enterprise | legacy
  rateLimitPerMinute: number;   // из PLAN_LIMITS[plan]
  maxActiveInboxes: number;
  teamId: string | null;
  apiKeyId: string | null;
  apiKeyScope: ApiKeyScope;     // labelPrefix, readOnly
};
```

### Route Module

Каждый файл в `src/routes/` экспортирует `*Routes = new Hono<...>()` и монтируется в `app.route(prefix, module)`.

Типичная цепочка middleware на защищённых маршрутах:

```
cors (global) → requireApiKey → rateLimit → [scope guards per-handler] → handler → service
```

MCP HTTP использует `requireMcpAuth` вместо `requireApiKey` (добавляет `WWW-Authenticate` при 401).

### Discovery Documents

| Endpoint | Файл | Содержимое |
|----------|------|------------|
| `GET /v1` | `src/routes/api-meta.ts` | Краткий каталог endpoints, presets, mcpTools |
| `GET /v1/agent` | `src/routes/agent.ts` | Расширенный hub: recipes, runs, remoteMcp, packages, tests |
| `GET /mcp` | `src/routes/mcp-http.ts` | MCP transport metadata |
| `GET /mcp/auth` | `src/routes/mcp-http.ts` | OAuth flows для MCP clients |

### OpenAPI

| Сущность | Файл |
|----------|------|
| `openApiSpec` | `src/openapi/spec.ts` |
| HTTP serve | `GET /v1/openapi.json` → `src/routes/openapi.ts` |

### Tenant Scope

| Механизм | Где | Поведение |
|----------|-----|-----------|
| `api_key_hint` на inbox | `inboxes.api_key_hint` | Inbox привязан к ключу при create |
| `teamId` | `ResolvedAuth` | Team keys видят все inboxes команды |
| `scope.labelPrefix` | `key-scope.ts` | Create/list только с matching label |
| `scope.readOnly` | `scope-guard.ts` | Блок POST/DELETE/PATCH write |
| `scopeInboxDenied` | `scope-guard.ts` | Cross-tenant → 404 (не 403) |

---

## Decision history

| Решение | Почему |
|---------|--------|
| Hono вместо raw `fetch` router | Композиция middleware, типизированный context, mount по prefix |
| `requireApiKey` на module level (`use("*")`) | Единообразие; публичные routes — отдельные modules без auth |
| Cross-tenant inbox → `404 inbox_not_found` | Не раскрывать существование чужих ресурсов |
| `POST /v1/inboxes/open` one-shot | CI/agents: create+wait+extract+delete без 4 round-trips |
| `GET /v1/inboxes/:id/events` через DO | SSE надёжнее 120s long-poll на Workers CPU limit |
| `POST /v1/inboxes/:id/simulate` | Contract tests без SMTP/Resend; `DATABASE_URL` не нужен в CI consumer |
| Discovery на двух уровнях (`/v1` + `/v1/agent`) | `/v1` — краткий; `/v1/agent` — полный agent hub с npm/docs |
| OpenAPI static object, не runtime codegen | Предсказуемая схема для SDK и внешних агентов |
| MCP HTTP отдельно от `/v1` | JSON-RPC + SSE sessions; RFC 9728 protected resource |
| Rate limit после auth | Нужен `apiKeyHint` из ResolvedAuth |
| Webhooks без Bearer | Svix/Stripe signature — свой auth channel |
| `stats` vs `me` | `stats` — operator aggregate; `me` — per-key profile + billing hints |

---

## Sources

| Область | Файлы истины |
|---------|--------------|
| Entry + mount order | `src/index.ts` |
| Routes | `src/routes/*.ts` |
| Auth middleware | `src/lib/auth.ts`, `src/services/api-key-store.ts` |
| Rate limit | `src/lib/rate-limit.ts`, `src/lib/rate-limit-usage.ts` |
| Scope guards | `src/lib/scope-guard.ts`, `src/lib/key-scope.ts` |
| Plans/limits | `src/lib/plans.ts` |
| OpenAPI | `src/openapi/spec.ts`, `src/routes/openapi.ts` |
| MCP tools | `src/mcp/manifest.ts`, `src/mcp/handlers.ts` |
| MCP HTTP | `src/routes/mcp-http.ts` |
| Contract tests | `scripts/contract-qa*.mjs`, `scripts/lib/contract-api.mjs` |
| SDK | `packages/mailagent-agent/`, `mcp/src/client.ts` |
| Tenant isolation | `src/services/inbox.ts` (`inboxAccessible`, `listInboxes`) |

---

## Middleware chain

### Global (все API paths через Hono)

```typescript
app.use("*", cors());
```

CORS без ограничений origin — API key в Authorization, не cookies.

### Protected `/v1/*` modules

Почти все modules под `/v1` (кроме публичных meta/status/openapi):

```typescript
routes.use("*", requireApiKey);
routes.use("*", rateLimit);
```

**`requireApiKey`** (`src/lib/auth.ts`):
1. `bearerToken(Authorization)` → `resolveAuth(env, token)`
2. Поддерживает `ma_*` DB keys, legacy env keys, `mat_*` OAuth tokens
3. При failure → `{ error: "unauthorized" }` **401**
4. Success → `applyAuthContext()` → `ApiVariables` в context

**`rateLimit`** (`src/lib/rate-limit.ts`):
1. Если `env.RATE_LIMIT` KV отсутствует — pass-through (self-host)
2. Key: `rl:{apiKeyHint}:{minuteBucket}`
3. Limit из `c.get("rateLimitPerMinute")` (plan-based)
4. Sampled KV writes (`RATE_LIMIT_KV_WRITE_EVERY`, default 10) — экономия KV puts
5. При превышении → `{ error: "rate_limit_exceeded" }` **429** + `Retry-After`, `X-RateLimit-*`

### Per-handler scope guards (`src/lib/scope-guard.ts`)

| Guard | Когда | Ответ |
|-------|-------|-------|
| `scopeWriteDenied(c)` | POST/DELETE/PATCH create/send/simulate | **403** `read_only_scope` |
| `scopeAdminDenied(c)` | team keys, billing, DCR, dedicated-resend | **403** `scope_admin_required` |
| `scopeLabelForCreate(c, label)` | create inbox/open/verify | **403** label prefix mismatch |
| `scopeInboxDenied(c, inbox)` | любой inbox-scoped read/write | **404** `inbox_scope_denied` или `inbox_not_found` |
| `scopeListPrefix(c, query)` | GET list inboxes | принудительный prefix для scoped keys |

### MCP HTTP chain

```typescript
mcpHttpRoutes.use("*", requireMcpAuth);
mcpHttpRoutes.use("*", rateLimit);
```

`requireMcpAuth` при 401 добавляет:
```
WWW-Authenticate: Bearer resource_metadata="https://api.../.well-known/oauth-protected-resource/mcp"
```

### OAuth partial auth

`POST /v1/oauth/register`, `GET /v1/oauth/clients/:id` — per-route `requireApiKey` + `rateLimit` (не module-level).

`POST /v1/oauth/token` — **без** Bearer; client_secret в body/Basic auth.

---

## Public endpoints (без Bearer)

| Method | Path | Module | Auth | Назначение |
|--------|------|--------|------|------------|
| GET | `/health` | `health.ts` | — | DB probe, version |
| GET | `/v1/status` | `status.ts` | — | Public uptime (no key) |
| GET | `/v1` | `api-meta.ts` | — | Discovery catalog |
| GET | `/v1/openapi.json` | `openapi.ts` | — | OpenAPI 3 schema |
| GET | `/.well-known/oauth-authorization-server` | `oauth.ts` | — | RFC 8414 metadata |
| GET | `/.well-known/oauth-protected-resource/mcp` | `oauth.ts` | — | RFC 9728 MCP resource |
| GET | `/.well-known/oauth-protected-resource` | `oauth.ts` | — | Generic protected resource |
| GET | `/v1/oauth/authorize` | `oauth.ts` | — | OIDC start (если configured) |
| GET | `/v1/oauth/callback` | `oauth.ts` | — | IdP callback |
| POST | `/v1/oauth/token` | `oauth.ts` | client_secret | Token exchange |
| POST | `/webhooks/resend` | `webhooks.ts` | Svix signature | Inbound email enqueue |
| POST | `/webhooks/resend/team/:teamId` | `webhooks.ts` | Team Svix secret | Enterprise inbound |
| POST | `/webhooks/stripe` | `webhooks.ts` | Stripe signature | Plan lifecycle |

---

## Route modules — полный каталог

### `health.ts` → mount `/`

| Method | Path | Auth | Middleware | Response |
|--------|------|------|------------|----------|
| GET | `/health` | — | — | `{ status, db, version, webhook }` |

### `status.ts` → mount `/v1`

| Method | Path | Auth | Response |
|--------|------|------|----------|
| GET | `/v1/status` | — | `{ status, db, version, service, checkedAt }` |

### `api-meta.ts` → mount `/v1`

| Method | Path | Auth | Response |
|--------|------|------|----------|
| GET | `/v1` | — | Discovery: endpoints map, services, mcpTools |

### `openapi.ts` → mount `/v1`

| Method | Path | Auth | Response |
|--------|------|------|----------|
| GET | `/v1/openapi.json` | — | Full OpenAPI spec object |

### `inboxes.ts` → mount `/v1/inboxes`

**Module middleware:** `requireApiKey`, `rateLimit`

| Method | Path | Scope guards | Status | Назначение |
|--------|------|--------------|--------|------------|
| POST | `/open` | write, label, quota | 201/408 | One-shot: create→wait→extract→delete |
| GET | `/` | list prefix | 200 | List by `label` or `labelPrefix` |
| POST | `/` | write, label, quota | 201 | Create inbox |
| DELETE | `/` | write | 200 | Bulk delete by `labelPrefix` |
| GET | `/simulate/scenarios` | — | 200 | QA fixture list |
| GET | `/:id` | inbox scope | 200 | Inbox + messageCount |
| DELETE | `/:id` | write, inbox scope | 200 | Delete inbox |
| POST | `/:id/simulate` | write, inbox scope | 201 | Inject test message (no SMTP) |
| POST | `/:id/send` | write, inbox scope | 201/403/502 | Outbound send |
| POST | `/:id/messages/:messageId/reply` | write, inbox scope | 201 | Reply in thread |
| GET | `/:id/threads` | inbox scope | 200 | Thread list |
| GET | `/:id/threads/:threadId/messages` | inbox scope | 200 | Thread messages |
| GET | `/:id/search` | inbox scope | 200 | Keyword/semantic search (`q`, `mode`) |
| GET | `/:id/diagnose` | inbox scope | 200 | Debug hints for agents |
| GET | `/:id/callbacks` | inbox scope | 200 | Callback delivery log |
| GET | `/:id/messages` | inbox scope | 200 | Message list (`subjectContains`) |
| GET | `/:id/messages/:messageId/raw` | inbox scope | 200 | Raw MIME (.eml) from R2 |
| GET | `/:id/messages/:messageId/attachments` | inbox scope | 200 | Attachment metadata |
| GET | `/:id/messages/:messageId/attachments/:attachmentId` | inbox scope | 200/404 | Attachment bytes or JSON |
| GET | `/:id/extract/presets` | inbox scope | 200 | Structured extract presets |
| GET | `/:id/extract` | inbox scope | 200/404 | Latest message verification DTO |
| POST | `/:id/messages/:messageId/extract` | inbox scope | 200/400/501/502 | AI structured extract |
| GET | `/:id/events` | inbox scope | 200 SSE | DO subscribe — wait for message |
| GET | `/:id/wait` | inbox scope | 200/408 | Long-poll fallback (`timeout` max 120s) |

**Create/open body fields (общие):**
`ttlMinutes`, `service`, `expectFrom`, `allowedSenders`, `label`, `callbackUrl`, `username`, `domainId`, `subjectContains`, `messageIndex`, `timeoutSeconds`, `deleteAfter`

### `agent.ts` → mount `/v1/agent`

**Module middleware:** `requireApiKey`, `rateLimit`

| Method | Path | Scope | Status | Назначение |
|--------|------|-------|--------|------------|
| GET | `/` | — | 200 | Agent hub (mcpTools, packages, tests, remoteMcp) |
| GET | `/recipes` | — | 200 | All service recipes |
| GET | `/recipes/:service` | — | 200/404 | Single recipe |
| GET | `/runs` | — | 200 | Active runs (`label` agent-*) |
| GET | `/runs/:runId` | — | 200/404 | Run detail + session |
| GET | `/runs/:runId/session` | — | 200/404 | Run session state |
| PATCH | `/runs/:runId/session` | write | 200/400 | Merge/replace session |
| POST | `/verify` | write (if no inboxId) | 200/408 | Agent verify flow |

### `me.ts` → mount `/v1/me`

| Method | Path | Response |
|--------|------|----------|
| GET | `/v1/me` | plan, limits, usage, billing hints, rateLimit, capabilities |

### `stats.ts` → mount `/v1/stats`

| Method | Path | Response |
|--------|------|----------|
| GET | `/v1/stats` | Global usage counters + env limits |

### `billing.ts` → mount `/v1/billing`

| Method | Path | Guards | Status |
|--------|------|--------|--------|
| POST | `/checkout` | admin, team, stripe | 200/400/503 |
| POST | `/portal` | admin, team, stripe customer | 200/400/503 |

### `console.ts` → mount `/v1/console`

| Method | Path | Scope |
|--------|------|-------|
| GET | `/summary` | team/hint scoped aggregate |
| GET | `/threads` | recent threads (`limit` max 50) |
| GET | `/inboxes/:id` | inbox scope + detail |

### `audit.ts` → mount `/v1/audit`

| Method | Path | Query |
|--------|------|-------|
| GET | `/` | `limit` (max 100), `before` cursor |

### `team.ts` → mount `/v1/team`

| Method | Path | Guards | Назначение |
|--------|------|--------|------------|
| GET | `/` | team required | Team profile + keys |
| POST | `/keys` | admin | Issue new team key |
| DELETE | `/keys/:id` | admin | Revoke key |
| GET | `/dedicated-resend` | team | Enterprise Resend status |
| PUT | `/dedicated-resend` | admin, enterprise | Configure dedicated Resend |
| DELETE | `/dedicated-resend` | admin | Clear dedicated Resend |
| GET | `/webhooks` | team | Team event webhook |
| PUT/POST | `/webhooks` | admin | Set team event webhook |
| DELETE | `/webhooks` | admin | Clear team event webhook |

### `domains.ts` → mount `/v1/domains`

| Method | Path | Guards | Status |
|--------|------|--------|--------|
| GET | `/` | — | 200 list |
| POST | `/` | write | 201/403/409/429/502 |
| GET | `/:id` | — | 200/404 |
| POST | `/:id/verify` | write | 200/404/502 |
| DELETE | `/:id` | write | 200/404 |

Domain scope: `teamId` + `apiKeyHint` + `plan` через `domainScope(c)`.

### `oauth.ts` → mount `/v1/oauth` + `/.well-known`

| Method | Path | Auth |
|--------|------|------|
| GET | `/v1/oauth/authorize` | — |
| GET | `/v1/oauth/callback` | — |
| POST | `/v1/oauth/register` | Bearer + admin |
| GET | `/v1/oauth/clients/:id` | Bearer |
| POST | `/v1/oauth/token` | client_secret / auth code |
| GET | `/.well-known/oauth-authorization-server` | — |
| GET | `/.well-known/oauth-protected-resource/mcp` | — |

### `webhooks.ts` → mount `/webhooks`

См. Public endpoints — signature auth only.

### `mcp-http.ts` → mount `/mcp`

**Module middleware:** `requireMcpAuth`, `rateLimit`

| Method | Path | Назначение |
|--------|------|------------|
| GET | `/mcp/auth` | OAuth flow metadata for MCP clients |
| GET | `/mcp` | Transport info; SSE if `Accept: text/event-stream` |
| POST | `/mcp` | JSON-RPC: initialize, tools/list, tools/call, ping |
| DELETE | `/mcp` | End MCP session (`Mcp-Session-Id`) |

**JSON-RPC methods:**
- `initialize` → capabilities + `Mcp-Session-Id` header
- `tools/list` → 24 tools from `MCP_TOOLS`
- `tools/call` → `executeMcpTool()` → REST-equivalent logic
- `ping` → `{}`
- `notifications/*` → 204 no content

**Wait tools SSE:** `tools/call` + `Accept: text/event-stream` на wait tools → progress notifications stream.

---

## Discovery: GET /v1 vs GET /v1/agent

### `GET /v1` (`api-meta.ts`)

Краткий каталог для документации и быстрого onboarding:
- `endpoints` — method + path map
- `services` — service preset names (`SERVICE_EXPECT_FROM`)
- `mcpTools` — 23 tool names
- `qa` — label/subjectContains/callbackUrl hints

### `GET /v1/agent` (`agent.ts`)

Расширенный hub для AI agents:
- `auth.oidc`, `remoteMcp`, `mcpTools`
- `recommended` — verify, oneShot, rawMessage paths
- `runs` — session API
- `packages` — NPM versions (`NPM_PACKAGES`)
- `distribution` — skill, codex, catalog PRs
- `tests` — prod gate commands, contract matrix
- `cli` — npx MCP one-liner

**Практика:** агент начинает с `GET /v1/agent` (или `curl` discovery из AGENTS.md).

---

## OpenAPI

- **Source of truth:** `src/openapi/spec.ts` — объект `openApiSpec`
- **Serve:** `GET /v1/openapi.json` — без auth
- **Покрытие:** inbox CRUD, messages, wait, extract, verification, attachments, agent verify
- **Не покрывает полностью:** team admin, billing, console, audit, domains — смотреть route modules

Использование:
```bash
curl -s https://api.webmailagent.com/v1/openapi.json | jq '.paths | keys'
```

---

## Error codes (полный справочник)

### Auth & scope

| Code | HTTP | Где |
|------|------|-----|
| `unauthorized` | 401 | `requireApiKey`, `requireMcpAuth` |
| `read_only_scope` | 403 | `scopeWriteDenied` |
| `scope_admin_required` | 403 | `scopeAdminDenied` |
| `label_prefix_required` | 403 | scoped create без prefix |
| `label_prefix_mismatch` | 403 | label не matching scope |
| `inbox_scope_denied` | 404 | scoped key → чужой inbox |
| `team_required` | 403 | team routes без DB key |

### Inbox & messages

| Code | HTTP | Контекст |
|------|------|----------|
| `inbox_not_found` | 404 | ID/expired/cross-tenant |
| `message_not_found` | 404 | |
| `no_messages` | 404 | extract без messages |
| `timeout` | 408 | wait/open — письмо не пришло |
| `inbox_limit_reached` | 429 | plan quota |
| `labelPrefix_required` | 400 | bulk delete |
| `labelPrefix_too_short` | 400 | min 3 chars |
| `invalid_callback_url` | 400 | callbackUrl validation |
| `invalid_json` | 400 | malformed body |
| `domain_not_found` | 404 | custom domain |
| `domain_not_verified` | 400 | inbox on unverified domain |
| `username_requires_domain` | 400 | username без domainId |
| `simulate_failed` | 500 | simulate internal error |
| `send_failed` | 502/403 | outbound Resend |
| `q_required` | 400 | search без query |

### Rate limit

| Code | HTTP |
|------|------|
| `rate_limit_exceeded` | 429 |

### Team & billing

| Code | HTTP |
|------|------|
| `team_key_limit_reached` | 429 |
| `team_keys_not_supported_on_legacy` | 400 |
| `cannot_revoke` | 400 |
| `stripe_not_configured` | 503 |
| `billing_requires_registered_key` | 400 |
| `already_pro` | 400 |
| `checkout_failed` | 502 |
| `no_stripe_customer` | 400 |
| `enterprise_plan_required` | 403 |

### Domains

| Code | HTTP |
|------|------|
| `domain_limit_reached` | 429 |
| `domain_already_registered` | 409 |
| `dedicated_resend_required` | 403 |
| `invalid_domain_name` | 400 |

### Agent, MCP, webhooks, global

| Code | HTTP | Контекст |
|------|------|----------|
| `unknown_service` / `run_not_found` | 404 | agent recipes/runs |
| `invalid_run_id` / `session_not_found` | 400/404 | run session |
| MCP `session_not_found` | 404 / -32001 | Mcp-Session-Id |
| JSON-RPC parse/method/internal | 400 / -32700/-32601/-32603 | POST /mcp |
| `invalid_signature` | 401 | Resend webhook |
| `invalid_stripe_signature` | 400 | Stripe webhook |
| `not_found` | 404 | `app.notFound` |

---

## Tenant isolation

### Уровень 1: api_key_hint

При `createInbox()` записывается `api_key_hint` (первые 16 hex SHA-256 токена).

```typescript
// src/services/inbox.ts
export function inboxAccessible(row, apiKeyHint) {
  if (!row.api_key_hint) return true;  // legacy orphan inboxes
  if (!apiKeyHint) return false;
  return row.api_key_hint === apiKeyHint;
}
```

`getInbox(env, id, { apiKeyHint })` возвращает `null` для чужих → route отдаёт `inbox_not_found`.

### Уровень 2: teamId

Team keys одной команды разделяют inboxes через `team_id` на `inboxes` (migration). `listInboxes` фильтрует:
- legacy key → `api_key_hint = hint`
- team key → все inboxes где `team_id = teamId` OR `api_key_hint` in team keys

### Уровень 3: scoped keys

`ApiKeyScope`:
- `labelPrefix` — create только с `label` starting with prefix; list forced to prefix
- `readOnly` — блокирует mutate operations

`scopeInboxDenied` использует `assertInboxAccessible(scope, inbox)` — label prefix check на существующем inbox.

### Уровень 4: domains & billing

Domains scoped by `teamId`. Billing/checkout требует `teamId` (registered key). Console/audit фильтруют по `teamId` или `apiKeyHint`.

### Практическое правило для агента

Всегда передавать тот же API key, которым создан inbox. Cross-key access → 404. Для CI — уникальный `label` per run + bulk delete by `labelPrefix`.

---

## Request/response patterns

### Auth header

```
Authorization: Bearer ma_xxxxxxxx
```

OAuth MCP token:
```
Authorization: Bearer mat_xxxxxxxx
```

### Inbox create response (201)

```json
{
  "id": "abc123",
  "address": "ci-run-42@inbox.webmailagent.com",
  "expiresAt": "2026-06-11T12:00:00.000Z",
  "createdAt": "2026-06-11T11:30:00.000Z",
  "allowedSenders": ["noreply@github.com"],
  "label": "ci-run-42",
  "callbackUrl": null
}
```

### Verification DTO (extract / verify)

```json
{
  "otp": "123456",
  "links": ["https://..."],
  "primaryLink": "https://...",
  "from": "noreply@service.com",
  "subject": "Verify your email",
  "messageId": "msg_id",
  "hasRaw": true,
  "rawUrl": "/v1/inboxes/:id/messages/:messageId/raw"
}
```

### Wait timeout (408)

```json
{
  "error": "timeout",
  "inboxId": "abc123",
  "address": "...",
  "messageCount": 0,
  "hint": "..."
}
```

### Rate limit headers

```
X-RateLimit-Limit: 60
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1718100060
Retry-After: 45
```

### Raw MIME content negotiation

`GET .../raw`:
- default → `message/rfc822` body
- `Accept: application/json` → metadata + base64 chunk

### Pagination

- Audit: `before` cursor + `nextBefore`
- List inboxes: `limit` (default 20)
- Agent runs: `limit` (default 30)

---

## Contract test matrix

Все scripts в `scripts/`, helper в `scripts/lib/contract-api.mjs`. Используют `POST .../simulate` — **без real SMTP**, **без DATABASE_URL** у consumer.

| npm script | Script | Scope | Когда запускать |
|------------|--------|-------|-----------------|
| `test:contract:qa` | `contract-qa.mjs` | inbox, simulate, extract | inbox/simulate changes |
| `test:contract:qa:agent` | `contract-qa-agent.mjs` | agent.ts, MCP hub | `src/routes/agent.ts`, MCP |
| `test:contract:qa:attachments` | `contract-qa-attachments.mjs` | attachments, raw MIME | attachment/R2 changes |
| `test:contract:qa:team-keys` | `contract-qa-team-keys.mjs` | team keys, dashboard | team routes |
| `test:contract:qa:billing` | `contract-qa-billing.mjs` | Stripe routes | billing (prod URL) |
| `test:contract:qa:callback` | `contract-qa-callback.mjs` | callbackUrl | callback service |
| `test:contract:qa:domains` | `contract-qa-domains.mjs` | custom domains | domains.ts |
| `test:contract:qa:search` | `contract-qa-search.mjs` | message search | search/embeddings |
| `test:contract:qa:session` | `contract-qa-session.mjs` | agent run sessions | run session |
| `test:contract:qa:outbound` | `contract-qa-outbound.mjs` | send/reply | outbound-mail |
| `test:contract:qa:oidc` | `contract-qa-oidc.mjs` | OIDC | oauth (prod) |
| `test:contract:qa:console` | `contract-qa-console.mjs` | console API | console routes |
| `test:contract:qa:audit` | `contract-qa-audit.mjs` | audit log | audit routes |
| `test:contract:qa:extract` | `contract-qa-extract.mjs` | structured extract | AI extract |
| `test:contract:qa:threads` | `contract-qa-threads.mjs` | threads | outbound threads |
| `test:contract:qa:console-inbox` | `contract-qa-console-inbox.mjs` | console inbox detail | console-inbox |
| `test:contract:qa:dedicated-resend` | `contract-qa-dedicated-resend.mjs` | enterprise Resend | team-resend |
| `test:contract:all` | `test-contract-all.mjs` | all above | before merge |

**Env для prod tests:**
```bash
MAILAGENT_API_URL=https://api.webmailagent.com \
MAILAGENT_API_KEY=ma_… \
npm run test:contract:qa
```

**CI gate:** `npm run test:prod:gate` (smoke); full: `npm run test:prod`.

**On failure:** `npm run doctor:qa`

---

## SDK packages

| Package | Path | Назначение |
|---------|------|------------|
| `@mailagent/agent` | `packages/mailagent-agent/` | REST SDK: verify, me, runs, open |
| `@mailagent/mcp` | `mcp/` | stdio MCP server → REST via `mcp/src/client.ts` |
| `@mailagent/qa` | `packages/mailagent-qa/` | Playwright/Cypress helpers |
| `mailagent-agent` | PyPI mirror | Python verify SDK |

**MCP stdio vs HTTP:**
- stdio: `node mcp/dist/index.js` (Cursor `.cursor/mcp.json`)
- remote: `POST https://api.webmailagent.com/mcp` + Bearer

**23 MCP tools** — полный список в `src/mcp/manifest.ts` (`MCP_TOOL_NAMES`), отражён в `GET /v1/agent` → `mcpTools`. Mount order Hono → `worker-core.md`.

---

## Связанные ядра

| Ядро | Когда грузить вместе |
|------|---------------------|
| `auth-billing-core.md` | 401/403, scopes, Stripe, OAuth mat_ |
| `worker-core.md` | queue, cron, ASSETS, DO, env bindings |
| `inbox-core.md` | TTL, wait, simulate, callback |
| `serialization-core.md` | DTO shapes, camelCase fields |
| `deployment-testing-core.md` | CI gates, wrangler deploy |
