# Auth & Billing Core — MailAgent

Специализированное ядро Context OS: аутентификация, авторизация, планы, Stripe billing, OAuth/MCP и webhook security.

---

## Purpose

MailAgent — multi-tenant hosted API для temporary inboxes. Каждый HTTP-запрос к `/v1/*` (кроме публичных health/docs/webhooks) проходит через единую точку `resolveAuth()`: Bearer-токен превращается в `ResolvedAuth` — план, team, scope, hint для rate limit и tenant isolation.

Система поддерживает три класса credentials: (1) **DB team keys** (`ma_*`, SHA-256 hash в Neon), (2) **legacy env keys** (`API_KEY` / `API_KEYS` в wrangler secrets, plan `legacy`), (3) **OAuth access tokens** (`mat_*` — short-lived JWT или legacy KV для remote MCP). Browser login через OIDC (Auth0/Google) создаёт team автоматически и выдаёт `mat_` через authorization_code + PKCE.

Billing опционален: без `STRIPE_*` secrets self-serve checkout отключён, план меняется вручную (`npm run team:plan`). С Stripe — только **free → pro** self-serve; enterprise — operator. Plan limits влияют на rate limit, inbox quota, team keys, custom domains, dedicated Resend.

---

## Entities

### ResolvedAuth

Центральный результат аутентификации. Определён в `src/services/api-key-store.ts`, прокидывается в Hono context через `applyAuthContext()`.

| Поле | Тип | Назначение |
|------|-----|------------|
| `hint` | `string` | Первые 16 hex SHA-256 токена — ключ rate limit и привязка inbox к ключу |
| `plan` | `PlanId` | `free` \| `pro` \| `enterprise` \| `legacy` |
| `teamId` | `string \| null` | Neon `teams.id`; `null` для legacy env keys |
| `apiKeyId` | `string \| null` | Neon `api_keys.id`; `null` для legacy и OIDC |
| `label` | `string \| null` | Человекочитаемая метка ключа или email OIDC |
| `scope` | `ApiKeyScope` | Ограничения scoped key |

Порядок разрешения в `resolveAuth()`:
1. `mat_*` → `resolveMcpAccessToken()` (JWT, затем KV fallback)
2. SHA-256 hash → lookup `api_keys` JOIN `teams`
3. Plaintext match → `allowedApiKeys(env)` → plan `legacy`, `FULL_ACCESS_SCOPE`
4. Иначе `null` → 401

### ApiKeyScope

Тип в `src/lib/key-scope.ts`:

```typescript
type ApiKeyScope = {
  labelPrefix: string | null;  // max 64 chars
  readOnly: boolean;
};
```

`FULL_ACCESS_SCOPE = { labelPrefix: null, readOnly: false }`.

`isRestrictedScope(scope)` = `readOnly || labelPrefix` — блокирует admin-операции (team keys, DCR, billing, revoke).

### Team

Таблица `teams` (migration `006_teams_api_keys.sql`):

| Колонка | Описание |
|---------|----------|
| `id` | `nanoid(10)` primary key |
| `name` | Отображаемое имя (`team-{label}` или email prefix для OIDC) |
| `plan` | `free` (default), `pro`, `enterprise`, `legacy` |
| `stripe_customer_id` | Заполняется при `checkout.session.completed` |
| `stripe_subscription_id` | Привязка к Stripe subscription |
| `event_webhook_url` | Team-wide HTTPS webhook (migration `017`) |
| `dedicated_resend_*_cipher` | Enterprise per-team Resend (migration `016`) |

Team создаётся: `registerApiKey()`, `issue:key:db`, OIDC first login, DCR не создаёт team (требует существующий).

### ApiKey

Таблица `api_keys`:

| Колонка | Описание |
|---------|----------|
| `id` | `nanoid(10)` |
| `team_id` | FK → `teams`, CASCADE delete |
| `key_hash` | SHA-256 hex всего токена, UNIQUE |
| `key_hint` | Первые 16 hex SHA-256 — индекс для lookup |
| `label` | Опциональная метка (max 64 при create через API) |
| `scope_label_prefix` | Migration `008` |
| `scope_read_only` | Migration `008`, default `false` |

Plaintext токен **никогда** не хранится. Показывается один раз при `POST /v1/team/keys`, DCR, `issue:key`.

Формат: `ma_` + 24 random bytes base64url (`generateApiKeyToken()`).

### PlanId / PLAN_LIMITS

`src/lib/plans.ts`:

| Plan | rateLimit/min | maxActiveInboxes | maxTeamKeys | maxCustomDomains | dedicatedResend |
|------|---------------|------------------|-------------|------------------|-----------------|
| `free` | 60 | 10 | 5 | 1 | false |
| `pro` | 300 | 100 | 20 | 10 | false |
| `enterprise` | 600 | 500 | 50 | 25 | true |
| `legacy` | 120 | 500 | 0 | 3 | false |

`normalizePlan(raw)`: неизвестное → `free`. Legacy keys из wrangler не имеют `teamId`, `maxTeamKeys=0` блокирует `POST /v1/team/keys`.

### mat_ OAuth token

Short-lived Bearer для remote MCP. Префикс `mat_`, тело — JWT (HS256) или `nanoid(40)` (legacy KV).

**JWT path** (`src/lib/mcp-jwt.ts`): claims `sub` (hint), `plan`, `tid`, `kid`, `lbl`, `slp`, `sro`. TTL: `MCP_OAUTH_TOKEN_TTL_SEC` (default 3600, min 300, max 86400). Secret: `MCP_OAUTH_JWT_SECRET` или fallback `API_KEY`.

**KV path** (`src/services/mcp-oauth.ts`): key `oauth:mat:{sha256(token)}` в `RATE_LIMIT` KV, TTL `expires_in + 60`.

Выдаётся: `POST /v1/oauth/token` grant `client_credentials` или `authorization_code`.

### OIDC identity

Таблица `oidc_identities` (migration `007_oidc_identities.sql`):

| Колонка | Описание |
|---------|----------|
| `issuer` | OIDC issuer URL (Auth0 tenant) |
| `sub` | Subject из id_token |
| `email` | Опционально из claims |
| `team_id` | FK → teams |

UNIQUE `(issuer, sub)`. Первый login → новый team `free` + identity row. Повторный → существующий team, `FULL_ACCESS_SCOPE`, `apiKeyId: null`.

Env: `OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`, опционально `OIDC_AUDIENCE`.

### Stripe objects

| Объект | Использование |
|--------|---------------|
| Checkout Session | `mode: subscription`, `client_reference_id` + `metadata[team_id]` |
| Customer | Сохраняется в `teams.stripe_customer_id` |
| Subscription | `teams.stripe_subscription_id`, webhook lifecycle |
| Billing Portal Session | Self-serve manage/cancel для pro |
| Webhook events | `checkout.session.completed`, `customer.subscription.updated/deleted` |

Env: `STRIPE_SECRET_KEY`, `STRIPE_PRICE_PRO` (recurring price id), `STRIPE_WEBHOOK_SECRET` (`whsec_…`).

`stripeConfigured()` = оба `STRIPE_SECRET_KEY` и `STRIPE_PRICE_PRO` заданы.

---

## Decision history

| # | Решение | Дата/фаза | Статус |
|---|---------|-----------|--------|
| D1 | API keys только как SHA-256 hash в Neon | Phase 3 / 006 | active |
| D2 | Legacy `API_KEY`/`API_KEYS` без team, plan `legacy` | pre-006 | active |
| D3 | Plan на уровне team, не ключа | 006 | active |
| D4 | Stripe webhook → `teams.plan`, не отдельная billing table | billing v1 | active |
| D5 | Self-serve upgrade только free→pro | billing.ts | active |
| D6 | Scoped keys: labelPrefix + readOnly | 008 | active |
| D7 | Sub-key scope ⊆ parent (`narrowScope`) | 008 | active |
| D8 | `mat_` JWT stateless при `MCP_OAUTH_JWT_SECRET` | MCP OAuth v2 | active |
| D9 | KV fallback для mat_ без JWT secret | MCP OAuth v1 | legacy fallback |
| D10 | OIDC → auto-provision team, full access | 007 | active |
| D11 | RFC 9728 WWW-Authenticate на MCP 401 | MCP HTTP | active |
| D12 | Rate limit KV sampled writes (quota) | hosted | active |
| D13 | Enterprise dedicated Resend per team | 016 | active |
| D14 | Team event webhook (outbound POST) | 017 | active |
| D15 | DCR (RFC 7591) = новый scoped api_key | OAuth | active |

### Narrative decisions

**D1 — Hash-only storage.** Plaintext API key показывается один раз при выпуске. В БД — `key_hash` (full SHA-256) и `key_hint` (16 hex prefix). Компрометация БД не раскрывает ключи. Lookup: hash entire Bearer token.

**D2 — Legacy env keys.** Операторские pilot keys в wrangler `API_KEY`/`API_KEYS` (comma-separated). Не регистрируются в Neon → `teamId: null`, elevated limits (500 inboxes, 120 req/min), но нет team admin API, billing, multi-key. Миграционный путь: `issue:key:db`.

**D3 — Plan per team.** Все keys одной команды наследуют `teams.plan`. Смена плана через Stripe webhook или `setTeamPlan()` влияет на все keys team.

**D4 — Stripe → teams.plan.** Нет отдельной subscriptions table. `stripe_customer_id` и `stripe_subscription_id` на `teams`. Webhook `checkout.session.completed` ставит `pro` + IDs. Subscription deleted/unpaid → `free`.

**D5 — free→pro only via Stripe.** `canUpgradeViaStripe(plan)` возвращает true только для `free`. Pro/enterprise/legacy получают `already_pro` на checkout. Enterprise — manual `team:plan` или sales.

**D6 — Scoped keys для CI/agents.** `labelPrefix` ограничивает create/list/delete по prefix inbox label. `readOnly` блокирует POST/DELETE/open/simulate/send. Ошибки намеренно не раскрывают чужие inboxes (`inbox_not_found` 404).

**D7 — narrowScope inheritance.** Admin key может выдать sub-key с уже более узким prefix. Read-only parent не может выдать writable child. Child prefix должен **начинаться с** parent prefix (`ci-e2e-` ← `ci-`).

**D8 — Stateless mat_ JWT.** При наличии `MCP_OAUTH_JWT_SECRET` (или `API_KEY`) OAuth tokens — signed JWT без KV put/get. Снижает KV quota и упрощает horizontal scale. Scope embedded в claims `slp`/`sro`.

**D9 — KV mat_ fallback.** Без signing secret токены `mat_{nanoid}` в KV `oauth:mat:{digest}`. Обратная совместимость для dev без JWT secret.

**D10 — OIDC auto-team.** Browser login (Auth0) не требует предварительного API key. `resolveOidcTeam()` upsert по `(issuer, sub)`. Hint `oidc:{sub[0:12]}`. Полный admin-доступ как unrestricted team key.

**D11 — RFC 9728 MCP auth challenge.** `requireMcpAuth` на 401 добавляет `WWW-Authenticate: Bearer resource_metadata="…/oauth-protected-resource/mcp"` и JSON `oauth` discovery URL. MCP clients auto-discover OAuth.

**D12 — Sampled KV rate limit writes.** Каждый N-й запрос (default 10) пишет счётчик в KV. Всегда пишет при `used=1`, `used>=limit`, `used>=limit-5`. Экономит Cloudflare KV free-tier puts.

**D13 — Enterprise dedicated Resend.** `PLAN_LIMITS.enterprise.dedicatedResend=true`. Per-team Resend API key + webhook secret encrypted (`team-secrets.ts` AES-GCM). Inbound: `POST /webhooks/resend/team/:teamId`.

**D14 — Team event webhook.** `teams.event_webhook_url` — HTTPS POST на каждое входящее письмо всех inboxes team (через `api_key_hint` → team lookup). Отдельно от per-inbox `callback_url`.

**D15 — DCR = api_key row.** `POST /v1/oauth/register` создаёт обычный `api_keys` row с label `mcp:{client_name}`. `client_id=mac_{apiKeyId}`, `client_secret=ma_*` token. Scope наследует narrowing от registering key.

---

## Sources

- `src/services/api-key-store.ts` — resolveAuth, register, team/key CRUD, setTeamPlan
- `src/lib/key-scope.ts` — ApiKeyScope, narrowScope, assert*
- `src/lib/plans.ts` — PLAN_LIMITS, normalizePlan
- `src/lib/auth.ts` — requireApiKey, requireMcpAuth, applyAuthContext
- `src/lib/scope-guard.ts` — HTTP scope helpers
- `src/lib/api-key-hint.ts` — SHA-256 hint/hash, bearerToken
- `src/lib/api-keys.ts` — allowedApiKeys (legacy env)
- `src/lib/generate-api-key.ts` — ma_* generation
- `src/lib/mcp-jwt.ts` — stateless mat_ JWT sign/verify
- `src/lib/mcp-signing-secret.ts` — MCP_OAUTH_JWT_SECRET resolution
- `src/lib/rate-limit.ts` — KV rate limit middleware
- `src/lib/rate-limit-usage.ts` — usage for GET /v1/me
- `src/services/billing.ts` — Stripe checkout, portal, webhook handler
- `src/services/mcp-oauth.ts` — issue/resolve mat_ tokens
- `src/services/oidc-oauth.ts` — Auth0 flow, oidc_identities
- `src/lib/oidc-flow-jwt.ts` — stateless OIDC state/code JWTs
- `src/routes/oauth.ts` — well-known, token, register, authorize, callback
- `src/routes/billing.ts` — /v1/billing/checkout, /portal
- `src/routes/team.ts` — /v1/team/* keys, webhooks, dedicated-resend
- `src/routes/me.ts` — GET /v1/me profile
- `src/routes/webhooks.ts` — Resend svix, Stripe HMAC, team Resend
- `src/routes/mcp-http.ts` — requireMcpAuth on /mcp
- `src/services/team-event-webhook.ts` — team outbound webhooks
- `src/services/team-resend.ts` — enterprise dedicated Resend
- `src/lib/team-secrets.ts` — encrypt team secrets at rest
- `migrations/006_teams_api_keys.sql`
- `migrations/007_oidc_identities.sql`
- `migrations/008_api_key_scopes.sql`
- `migrations/016_team_dedicated_resend.sql`
- `migrations/017_team_event_webhook.sql`
- `docs/BILLING.md`
- `docs/SCOPED-API-KEYS.md`
- `docs/STRIPE-SETUP.md`
- `scripts/issue-api-key.mjs`
- `scripts/doctor-billing.mjs`
- `scripts/wizard-stripe.mjs`
- `scripts/set-team-plan.mjs`

---

## Authentication flow

```
┌──────────────┐     Authorization: Bearer <token>      ┌─────────────────┐
│ MCP / REST   │ ─────────────────────────────────────► │ requireApiKey   │
│   Client     │                                        │ requireMcpAuth  │
└──────────────┘                                        └────────┬────────┘
                                                                 │
                                                                 ▼
                                                        ┌─────────────────┐
                                                        │  resolveAuth()  │
                                                        └────────┬────────┘
                                                                 │
                    ┌────────────────────────────────────────────┼────────────────────────────────────────────┐
                    │                                            │                                            │
                    ▼                                            ▼                                            ▼
           token starts with                              SHA-256 lookup                              env API_KEY/
              "mat_" ?                                    api_keys+teams                               API_KEYS match?
                    │                                            │                                            │
                    ▼                                            ▼                                            ▼
        ┌───────────────────┐                          ┌──────────────┐                          ┌──────────────┐
        │resolveMcpAccessToken│                        │ row found?   │                          │ plan=legacy  │
        │ JWT → KV fallback  │                          │ scopeFromDb  │                          │ FULL_ACCESS  │
        └─────────┬─────────┘                          └──────┬───────┘                          └──────┬───────┘
                  │                                           │                                         │
                  └───────────────────────┬───────────────────┴─────────────────┬───────────────────────┘
                                          ▼                                     ▼
                                   ResolvedAuth                           null → 401
                                          │
                                          ▼
                              applyAuthContext(c, auth)
                              hint, plan, teamId, scope,
                              rateLimitPerMinute, maxActiveInboxes
                                          │
                                          ▼
                                    rateLimit middleware
                                          │
                                          ▼
                                    route handler + scope guards
```

### Шаги

1. Client отправляет `Authorization: Bearer <token>`.
2. `bearerToken()` извлекает token (без префикса `Bearer `).
3. `resolveAuth(env, token)` — ветвление по префиксу и источнику.
4. `applyAuthContext()` кладёт в Hono Variables: `apiKeyHint`, `apiPlan`, `teamId`, `apiKeyId`, `apiKeyScope`, plan limits.
5. `rateLimit` middleware — KV counter per `rl:{hint}:{minute_bucket}`.
6. Route-specific guards: `scopeWriteDenied`, `scopeAdminDenied`, `scopeInboxDenied`, etc.
7. Business logic с tenant filter по `apiKeyHint` / `teamId`.

---

## API key lifecycle

### Register (новый team + первый key)

**CLI:**
```bash
npm run issue:key:db -- pilot-name
npm run issue:key:db -- ci-bot --label-prefix ci-
npm run issue:key:db -- readonly-ci --read-only --label-prefix ci-
```

**Runtime API:** `registerApiKey()` — создаёт `teams` (plan default `free`) + `api_keys`.

**Programmatic:** `scripts/issue-api-key.mjs --register` требует `DATABASE_URL`.

### issue:key (без DB)

```bash
npm run issue:key
# → ma_* token, инструкция wrangler secret put API_KEYS
```

Ключ **не** в Neon. Wrangler secret `API_KEY` или comma-separated `API_KEYS`. При auth → plan `legacy`, `teamId: null`.

### Hash storage

```typescript
// api-key-hint.ts
apiKeyHintFromToken(token) → sha256(token).slice(0, 16)   // rate limit, inbox hint
apiKeyHashFromToken(token)  → sha256(token)                 // DB lookup
```

Insert только hash + hint. Revoke = `DELETE FROM api_keys` (нельзя удалить последний key team).

### Legacy env keys

`allowedApiKeys(env)`:
- `API_KEYS` (comma-separated) приоритетнее
- иначе одиночный `API_KEY`
- пусто → legacy path отключён

Legacy key **не дублировать** в Neon после `issue:key:db` — иначе двойная auth path.

### Team key management API

| Method | Path | Требования |
|--------|------|------------|
| GET | `/v1/team` | DB key, любой scope |
| POST | `/v1/team/keys` | unrestricted key, team, under maxTeamKeys |
| DELETE | `/v1/team/keys/:id` | unrestricted, не последний key |

Ответ `POST` содержит plaintext `key` **один раз**.

---

## Scoped keys

### labelPrefix

- Inbox `label` при create **обязан** начинаться с prefix (если scope задан).
- `GET /v1/inboxes?labelPrefix=` — scoped key не может запросить чужой prefix (`effectiveLabelPrefix` clamp).
- Доступ к inbox по id — `assertInboxAccessible`: label не match → `inbox_not_found` (404, не 403).
- Max length prefix: 64 chars.

### readOnly

Блокирует write paths через `scopeWriteDenied` / `assertWriteAllowed`:
- `POST /v1/inboxes`, `/open`, `/simulate`, outbound send
- `DELETE /v1/inboxes*`
- MCP tools: create, delete, simulate, send

Разрешено: GET, list, wait, extract, diagnose, search, attachments.

### narrowScope rules

```typescript
narrowScope(parent, child):
  if parent.readOnly → error "parent_key_read_only"
  if parent.labelPrefix:
    child.labelPrefix must start with parent.labelPrefix
    else → "child_label_prefix_must_extend_parent"
  return child scope (labelPrefix, readOnly)
```

Read-only child от writable parent — OK. Writable child от read-only parent — запрещено.

### Admin-only operations (scope_admin_required)

`isRestrictedScope()` → 403:
- `POST /v1/team/keys`, `DELETE /v1/team/keys/:id`
- `POST /v1/oauth/register` (DCR)
- `POST /v1/billing/checkout`, `/portal`
- `PUT/POST/DELETE /v1/team/webhooks`
- `PUT/DELETE /v1/team/dedicated-resend`

### Create scoped key examples

```bash
# Team API
curl -X POST .../v1/team/keys \
  -H "Authorization: Bearer $ADMIN_KEY" \
  -d '{"label":"ci-bot","scope":{"labelPrefix":"ci-","readOnly":false}}'

# DCR for MCP
curl -X POST .../v1/oauth/register \
  -H "Authorization: Bearer $ADMIN_KEY" \
  -d '{"client_name":"cursor-ci","scope":{"labelPrefix":"agent-","readOnly":true}}'
```

`mat_` tokens inherit scope исходного API key (JWT claims `slp`/`sro`).

OIDC login всегда `FULL_ACCESS_SCOPE` — эквивалент unrestricted admin.

---

## OAuth MCP

### Flow overview

```
MCP Client                    MailAgent API                    IdP (optional)
    │                              │                              │
    │── GET /mcp (no auth) ───────►│ 401 + WWW-Authenticate       │
    │◄─────────────────────────────│                              │
    │                              │                              │
    │── discover /.well-known/ ───►│                              │
    │                              │                              │
    │── POST /v1/oauth/token ─────►│ client_credentials           │
    │   grant_type=client_credentials                             │
    │   client_secret=ma_*         │ resolveAuth → issueMcpAccessToken
    │◄── mat_* access_token ───────│                              │
    │                              │                              │
    │── POST /mcp Bearer mat_* ───►│ resolveMcpAccessToken        │
    │◄── MCP tools ────────────────│                              │
```

### mat_ JWT (stateless)

При `mcpSigningSecret(env)` ≠ null:
- Issue: `signMcpAccessJwt(secret, auth, expiresInSec)` → `mat_{jwt}`
- Verify: `verifyMcpAccessJwt` — no KV I/O
- Secret chain: `MCP_OAUTH_JWT_SECRET` → fallback `API_KEY`

### Legacy KV fallback

Без secret:
- `issueMcpAccessToken` → `mat_{nanoid(40)}`, store JSON в `RATE_LIMIT` KV
- `resolveMcpAccessToken` — JWT attempt first (if secret added later), then KV get
- Failure to issue → 503 `OAuth token issuance unavailable`

### RFC 9728 (Protected Resource Metadata)

`requireMcpAuth` 401 response:
```
WWW-Authenticate: Bearer resource_metadata="https://api.../.well-known/oauth-protected-resource/mcp"
```
JSON body: `{ error: "unauthorized", oauth: "…/.well-known/oauth-authorization-server" }`

Discovery endpoints:
- `GET /.well-known/oauth-authorization-server` — RFC 8414 metadata
- `GET /.well-known/oauth-protected-resource/mcp` — resource + authorization_servers
- `GET /.well-known/oauth-protected-resource?resource=…`

### client_credentials token endpoint

`POST /v1/oauth/token`:
- `grant_type=client_credentials`
- `client_secret` = `ma_*` API key (или Basic auth password)
- `resolveAuth(client_secret)` → `issueMcpAccessToken`
- Response: `{ access_token, token_type: "Bearer", expires_in }`

### DCR (RFC 7591)

`POST /v1/oauth/register` — требует unrestricted team key.
Returns `client_id=mac_{apiKeyId}`, `client_secret={ma_* token}`.

---

## OIDC browser login

### Prerequisites

Env на Worker:
- `OIDC_ISSUER` (e.g. `https://tenant.us.auth0.com`)
- `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`
- `OIDC_AUDIENCE` (optional, Auth0 API)
- `MCP_OAUTH_JWT_SECRET` или `RATE_LIMIT` KV (для state/code)

`isOidcEnabled(env)` — все три OIDC_* обязательны.

### authorization_code + PKCE flow

1. MCP client → `GET /v1/oauth/authorize?redirect_uri&state&code_challenge&code_challenge_method=S256`
2. MailAgent сохраняет pending state (JWT или KV `oauth:oidc:state:`)
3. Redirect → IdP authorization_endpoint (discovered from `/.well-known/openid-configuration`)
4. User logs in (Auth0/Google)
5. IdP → `GET /v1/oauth/callback?code&state`
6. MailAgent exchanges code at IdP token_endpoint, verifies `id_token` (RS256, JWKS, iss, aud, exp)
7. `resolveOidcTeam(issuer, sub, email)` — lookup/create `oidc_identities` + `teams`
8. Issue MailAgent auth code → redirect client `redirect_uri?code&state`
9. Client → `POST /v1/oauth/token` `grant_type=authorization_code` + `code_verifier`
10. PKCE verify S256 → `issueMcpAccessToken(auth)` → `mat_*`

### oidc_identities table

- First login: `INSERT teams (free)` + `INSERT oidc_identities`
- Return: `hint: oidc:{sub[0:12]}`, `apiKeyId: null`, `scope: FULL_ACCESS`
- Team name from email local-part or `oidc-{sub[0:8]}`

### Security notes

- Internal state TTL: 600s (`FLOW_TTL_SEC`)
- Only `S256` code challenge method
- id_token signature verified against IdP JWKS
- Auth code single-use (KV delete or JWT expiry)

---

## Stripe billing

### Checkout (free → pro)

`POST /v1/billing/checkout`:
- Requires: `stripeConfigured`, `teamId`, `canUpgradeViaStripe(plan)` (= plan `free`)
- Scoped key → `scope_admin_required`
- Legacy key → `billing_requires_registered_key`
- Creates Stripe Checkout Session: subscription mode, `STRIPE_PRICE_PRO`
- `client_reference_id` = `teamId`, `metadata[team_id]` = `teamId`
- Returns `{ url, sessionId }` — redirect user to Stripe

Default URLs: `dashboard.html?billing=success|cancel`.

### Portal

`POST /v1/billing/portal`:
- Requires `stripe_customer_id` on team
- Creates Billing Portal Session
- Return URL default: `dashboard.html?billing=portal`

### Webhook events

Endpoint: `POST /webhooks/stripe`

| Event | Action |
|-------|--------|
| `checkout.session.completed` | `setTeamPlan(teamId, "pro", { customerId, subscriptionId })` |
| `customer.subscription.updated` | If status canceled/unpaid/incomplete_expired → `setTeamPlan(teamId, "free", { subscriptionId: null })` |
| `customer.subscription.deleted` | Same downgrade to `free` |

Signature: `stripe-signature` header, HMAC-SHA256 `whsec_` secret, timing-safe compare.

Missing `STRIPE_WEBHOOK_SECRET` → route 503 `not_configured`.

### canUpgradeViaStripe

```typescript
export function canUpgradeViaStripe(plan: PlanId): boolean {
  return plan === "free";
}
```

`GET /v1/me` → `billing.canUpgrade`, `billing.canManagePortal`, `billing.stripeEnabled`.

### Manual plan override

```bash
npm run team:plan -- TEAM_ID pro
npm run team:plan -- TEAM_ID enterprise
```

Для enterprise без Stripe — dedicated Resend, higher limits.

---

## Rate limiting

### Mechanism

Middleware `rateLimit` в `src/lib/rate-limit.ts`:
- KV key: `rl:{apiKeyHint}:{minute_bucket}` где `minute_bucket = floor(now / 60000)`
- Limit from `c.get("rateLimitPerMinute")` — set by plan in `applyAuthContext`
- No KV binding → middleware pass-through (unlimited)

### Plan limits

From `PLAN_LIMITS[plan].rateLimitPerMinute` (см. таблицу Entities).

Legacy: 120/min. Free: 60/min. Pro: 300/min. Enterprise: 600/min.

### KV sampled writes

`RATE_LIMIT_KV_WRITE_EVERY` (default 10):

`shouldPersistCount(used, limit, writeEvery)`:
- always: `used >= limit`
- always: `used === 1`
- always: `used >= limit - 5`
- else: `used % writeEvery === 0`

`waitUntil(kv.put(...))` — async, TTL 120s.

### 429 response

```json
{
  "error": "rate_limit_exceeded",
  "limitPerMinute": 60,
  "retryAfterSeconds": 42
}
```

Headers: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`, `Retry-After`.

Separate from plan quota 429: `team_key_limit_reached`, `inbox_limit_reached`.

---

## Webhook authentication

### Resend (platform)

`POST /webhooks/resend`:
- `resend.webhooks.verify()` SDK
- Headers: `svix-id`, `svix-timestamp`, `svix-signature`
- Secret: `RESEND_WEBHOOK_SECRET`
- Invalid → 401 `invalid_signature`
- Only processes `email.received` → enqueue `MAIL_QUEUE`

### Resend (enterprise per-team)

`POST /webhooks/resend/team/:teamId`:
- Team's dedicated Resend API key + webhook secret from DB (decrypted)
- Same svix verification
- Job tagged `resendTeamId: teamId`
- Not configured → 404 `dedicated_resend_not_configured`

### Stripe

`POST /webhooks/stripe`:
- Raw body + `stripe-signature` header
- `verifyStripeSignature`: parse `t` and `v1` from header, HMAC `t.payload`
- `whsec_` base64-decoded key
- Invalid → 400 `invalid_stripe_signature`

### Team event webhooks (outbound)

Не входящая auth — MailAgent **отправляет** POST на `teams.event_webhook_url`:
- Configured via `PUT/POST /v1/team/webhooks` (admin key)
- URL validated `parseCallbackUrl` (HTTPS)
- Fired from `fireTeamEventForMessage` on inbound message
- Payload includes `teamId`, `source: "team_webhook"`
- **Нет HMAC signing** на исходящих — consumer должен использовать secret URL или reverse proxy

Per-inbox `callback_url` — отдельный механизм (`fireInboxCallback`).

---

## Authorization on routes

### Middleware stack

Типичный protected route:
```
requireApiKey → rateLimit → handler
```

MCP HTTP (`/mcp`):
```
requireMcpAuth → rateLimit → MCP handler
```

### requireApiKey

`src/lib/auth.ts` — все REST `/v1/inboxes`, `/v1/team`, `/v1/me`, `/v1/billing`, `/v1/agent`, `/v1/domains`, `/v1/console`, `/v1/audit`, `/v1/stats`.

401: `{ error: "unauthorized" }` — без WWW-Authenticate.

### requireMcpAuth

Только remote MCP HTTP. 401 с RFC 9728 challenge (см. OAuth MCP).

### Scope guards (`scope-guard.ts`)

| Helper | Проверка | HTTP |
|--------|----------|------|
| `scopeWriteDenied(c)` | `!scope.readOnly` | 403 `scope_read_only` |
| `scopeAdminDenied(c)` | `!isRestrictedScope` | 403 `scope_admin_required` |
| `scopeLabelForCreate(c, label)` | prefix match | 403 `label_required` / `label_prefix_mismatch` |
| `scopeInboxDenied(c, inbox)` | prefix access | 404 `inbox_not_found` |
| `scopeListPrefix(c, requested)` | clamp list filter | (internal) |

### Route → guard mapping (ключевые)

| Route group | Auth | Scope notes |
|-------------|------|-------------|
| `/v1/inboxes/*` | requireApiKey | write/read/label guards per method |
| `/v1/team/*` | requireApiKey | admin for keys/webhooks/resend config |
| `/v1/billing/*` | requireApiKey | admin only |
| `/v1/oauth/register` | requireApiKey | admin + team required |
| `/v1/oauth/token` | public | client_secret auth inside handler |
| `/v1/oauth/authorize` | public | OIDC redirect |
| `/v1/me` | requireApiKey | any scope |
| `/mcp` | requireMcpAuth | MCP handlers mirror scope checks |
| `/webhooks/*` | none | signature verification instead |

### Tenant isolation

Inbox queries filter `api_key_hint` (per-key) or all hints of `team_id` (team-level counts). Cross-tenant access returns 404, not 403 — anti-enumeration.

---

## Error codes

### 401 Unauthorized

| Context | Body | Cause |
|---------|------|-------|
| REST API | `{ error: "unauthorized" }` | Missing/invalid Bearer |
| MCP HTTP | `{ error: "unauthorized", oauth: "…" }` + WWW-Authenticate | Invalid/missing mat_ or ma_ |
| Resend webhook | `{ error: "invalid_signature" }` | Bad svix signature |
| OAuth token | `{ error: "invalid_client" }` | Bad client_secret |

### 403 Forbidden (scope_*)

| Code | When | Hint field |
|------|------|------------|
| `scope_read_only` | POST/DELETE/write with readOnly key | — |
| `scope_admin_required` | Team/billing/DCR with scoped key | `"Use an unrestricted team key"` |
| `label_required` | Create inbox without label under prefix scope | prefix in hint |
| `label_prefix_mismatch` | Label doesn't start with scope prefix | expected prefix |
| `team_required` | Team API with legacy key | `issue:key:db` |
| `enterprise_plan_required` | dedicated-resend without enterprise | contact/plan hint |

Note: `inbox_not_found` (404) used instead of 403 for cross-scope inbox — intentional.

### 429 Too Many Requests

| Code | Cause |
|------|-------|
| `rate_limit_exceeded` | KV minute bucket >= plan limit |
| `team_key_limit_reached` | `countTeamKeys >= PLAN_LIMITS.maxTeamKeys` |
| `inbox_limit_reached` | active inboxes >= plan max |

### Billing-specific

| Code | HTTP | Cause |
|------|------|-------|
| `stripe_not_configured` | 503 | No STRIPE_SECRET_KEY/PRICE |
| `billing_requires_registered_key` | 400 | Legacy key, no teamId |
| `already_pro` | 400 | canUpgradeViaStripe false |
| `no_stripe_customer` | 400 | Portal without customer |

---

## Operational commands

### issue:key

```bash
# Generate ma_* only (wrangler secret path)
npm run issue:key

# Register team+key in Neon (recommended)
npm run issue:key:db -- acme-corp
npm run issue:key:db -- ci-bot --label-prefix ci-
npm run issue:key:db -- ro-agent --read-only --label-prefix agent-
```

Output: plaintext key, team id (if --register), pilot `.env` snippet.

### team:plan

```bash
npm run team:plan -- TEAM_ID pro
npm run team:plan -- TEAM_ID enterprise
npm run team:plan -- TEAM_ID free
```

Manual override без Stripe. Script: `scripts/set-team-plan.mjs`.

### doctor:billing

```bash
npm run doctor:billing
```

Checks:
- Local `.dev.vars` for `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_PRO`
- Stripe Price API validation (recurring)
- Prod `GET /v1/me` billing fields (if `MAILAGENT_API_KEY` set)
- Webhook URL reminder: `https://api.webmailagent.com/webhooks/stripe`

### wizard:stripe

```bash
npm run wizard:stripe
```

Interactive checklist:
1. Stripe Dashboard test mode
2. Product "MailAgent Pro" + recurring price
3. Customer portal enable
4. Webhook endpoint + events
5. Merge secrets into `.dev.vars`
6. Optional `setup:stripe-prod` deploy

Guide: `docs/STRIPE-SETUP.md`.

### Related QA commands

```bash
npm run test:contract:qa:billing   # after billing route changes
npm run test:contract:qa:team-keys # scoped keys contracts
npm run doctor:qa                  # API key + smoke
```

---

## Security checklist for agents

Агенты (Cursor, Codex, CI) должны соблюдать при работе с MailAgent auth/billing:

### API keys

- [ ] Никогда не коммитить `ma_*`, `mat_*`, `MAILAGENT_API_KEY` в git
- [ ] Использовать scoped keys для CI (`labelPrefix` + `readOnly` где возможно)
- [ ] Не дублировать ключ в `API_KEYS` wrangler и Neon одновременно
- [ ] Удалять pilot keys после тестов; revoke через `DELETE /v1/team/keys/:id`
- [ ] Не логировать полный Bearer token — только `key_hint` из `/v1/me`

### Scope discipline

- [ ] CI key: prefix `ci-` или `agent-run-`, не unrestricted admin
- [ ] Read-only для extract/wait-only pipelines
- [ ] Проверять `GET /v1/me` → `scope` перед write operations
- [ ] OIDC browser login = full access — только для human dashboard, не CI

### OAuth / MCP

- [ ] Remote MCP: prefer `client_credentials` → short `mat_` over long-lived `ma_*`
- [ ] Хранить `client_secret` из DCR как secret, не в repo
- [ ] При 401 на `/mcp` — follow WWW-Authenticate discovery, не hardcode tokens
- [ ] `MCP_OAUTH_JWT_SECRET` rotation invalidates outstanding mat_ JWTs

### Billing

- [ ] Не вызывать `/v1/billing/checkout` в automated tests без Stripe test mode
- [ ] `doctor:billing` перед go-live
- [ ] Webhook secret `whsec_` только wrangler secret
- [ ] Enterprise plan — operator action, не self-serve

### Webhooks

- [ ] Resend: всегда verify svix перед обработкой payload
- [ ] Stripe: raw body для signature (не re-serialized JSON)
- [ ] Team webhook URL — HTTPS only; treat inbound POST as untrusted
- [ ] Не expose `RESEND_WEBHOOK_SECRET` в client-side code

### Rate limits

- [ ] Учитывать plan limit (free 60/min) в CI retry loops
- [ ] Exponential backoff на 429 `rate_limit_exceeded`
- [ ] Не disable rate limit in prod

### Tenant isolation

- [ ] Всегда использовать свой `MAILAGENT_API_KEY` — не shared prod key
- [ ] Inbox cleanup: `DELETE ?labelPrefix=ci-` после test run
- [ ] 404 на чужой inbox — ожидаемое поведение, не retry с другим id

### Verification commands

```bash
npm run doctor              # local env
npm run doctor:billing      # Stripe readiness
npm run doctor:security     # trust docs, audit
npm run smoke:qa            # prod API lifecycle
curl -s -H "Authorization: Bearer $KEY" https://api.webmailagent.com/v1/me | jq .
```

---

*Последняя синхронизация с кодовой базой: migrations through 017, plans free/pro/enterprise/legacy, stateless mat_ JWT + KV fallback, OIDC Auth0 flow, Stripe free→pro self-serve.*
