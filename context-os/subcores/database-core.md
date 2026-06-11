# Database Core — MailAgent

Узкое ядро Context OS для **router hits** по Neon Postgres: быстрые справочники таблиц, список миграций, критичные SQL-паттерны и операции. Полная схема, ER-диаграмма, инварианты и детальные колонки — в каноническом ядре.

**См. также:** [data-model-core.md](./data-model-core.md) — source of truth по DDL, relationships, tenant isolation, все query patterns.

---

## Purpose

Neon Postgres — единственный relational store MailAgent. Worker читает/пишет через `@neondatabase/serverless` (`src/db/client.ts`). Миграции — `migrations/*.sql`, runner `scripts/migrate.mjs` (`npm run db:migrate`).

Это ядро отвечает на вопросы агента, когда роутер попал в **database** / **migration** / **critical table**, но не нужен полный data-model (1000+ строк):

1. **Какие таблицы существуют** и за что отвечают (quick-ref).
2. **Хронология миграций** 001–017 — что добавила каждая.
3. **Критичные запросы** — inbound routing, auth lookup, quota, purge, idempotency.
4. **Что не в БД** — R2, KV, Queues, DO.
5. **Операции** — migrate, health, troubleshooting без DATABASE_URL в CI.

Принцип: агент сначала читает **database-core** для узкого контекста; при изменении схемы или глубоком IDOR/tenant анализе — переходит в **data-model-core**.

---

## Entities

Сущности relational layer (краткий каталог).

| Entity | Таблица | Роль |
|--------|---------|------|
| Temporary inbox | `inboxes` | Адрес, TTL, allowlist, QA label, callback, tenant hint |
| Message | `messages` | Превью, OTP, links, threading, R2 pointer |
| Callback log | `callback_deliveries` | Аудит POST на per-inbox `callback_url` |
| Team | `teams` | Plan, Stripe, dedicated Resend cipher, team webhook |
| API key | `api_keys` | SHA-256 hash, hint, scopes |
| OIDC link | `oidc_identities` | Auth0/Google subject → team |
| Custom domain | `domains` | Resend DNS, verified status |
| Attachment meta | `message_attachments` | Filename, size, optional R2 key |
| Search index | `message_search` | Full-text + optional pgvector embedding |
| Audit | `audit_events` | Team-scoped actions |
| Agent run | `agent_run_sessions` | Multi-step MCP state by `runId` |

**Связи (кратко):** `teams` 1:N `api_keys`, `oidc_identities`, `domains`, `audit_events`. `inboxes` 1:N `messages`, `callback_deliveries`. `messages` 1:N `message_attachments`, 1:1 `message_search`. `agent_run_sessions` — standalone composite PK `(run_id, owner_key)`.

**Кодовые модули:**

| Concern | Path |
|---------|------|
| DB client | `src/db/client.ts` |
| Inbox / message CRUD | `src/services/inbox.ts` |
| Auth / teams / keys | `src/services/api-key-store.ts` |
| Domains | `src/services/domains.ts` |
| Attachments | `src/services/message-attachments.ts` |
| Search | `src/services/message-search.ts` |
| Callback log | `src/services/callback-log.ts` |
| Audit | `src/services/audit-log.ts` |
| Agent runs | `src/services/agent-run-session.ts` |
| Team Resend | `src/services/team-resend.ts` |
| Migrations | `migrations/*.sql`, `scripts/migrate.mjs` |

---

## Decision history

| # | Решение | Статус | Детали в data-model-core |
|---|---------|--------|--------------------------|
| D1 | `provider_id` UNIQUE — idempotency inbound | active | Resend `email_id` / `sim_*`; duplicate INSERT → null |
| D2 | `api_key_hint` на inbox (004) | active | Tenant isolation без JOIN на каждый read |
| D3 | Legacy `api_key_hint IS NULL` → visible всем ключам | active | Обратная совместимость pre-004 |
| D4 | CASCADE от inbox/message | active | R2 purge **явно** до DELETE inbox |
| D5 | `key_hash` full SHA-256, `key_hint` 16 hex | active | Plaintext только у клиента |
| D6 | pgvector HNSW (013) | active | Optional embedding; keyword fallback |
| D7 | Dedicated Resend на `teams`, не отдельная таблица (016) | active | AES-GCM cipher columns |
| D8 | Team event webhook `teams.event_webhook_url` (017) | active | Отдельно от per-inbox callback |
| D9 | Нет таблицы версий миграций | active | Idempotent DDL, lexicographic sort |
| D10 | Simulate неотличим от real в БД | active | Различие только по prefix `provider_id` |

---

## Sources

| Artifact | Path |
|----------|------|
| DDL source of truth | `migrations/001_init.sql` … `017_team_event_webhook.sql` |
| Migrate runner | `scripts/migrate.mjs` |
| Neon setup | [SETUP.md](../../SETUP.md) §1 |
| Deploy auto-migrate | `.github/workflows/deploy-worker.yml` (если `DATABASE_URL` в Actions) |
| Health | `GET /health` → `SELECT 1` |
| Полная схема | [data-model-core.md](./data-model-core.md) |
| Inbox lifecycle | [inbox-core.md](./inbox-core.md) |
| Email ingest | [email-core.md](./email-core.md) |

---

## Engine и подключение

- **Provider:** Neon Postgres (serverless).
- **Driver:** `@neondatabase/serverless` — HTTP/WebSocket к pooled endpoint.
- **Secret:** `DATABASE_URL` в wrangler secret / `.dev.vars`.
- **Рекомендация SETUP.md:** Connection pooling ON; можно убрать `&channel_binding=require` если driver падает.

```typescript
// src/db/client.ts — lazy singleton per request
export function getDb(env: Env) {
  return neon(env.DATABASE_URL);
}
```

**Health check:**

```bash
curl https://api.webmailagent.com/health
# → { "ok": true, "db": "up" } или ошибка при недоступности Neon
```

---

## Migration chronology (полный список)

Runner: `scripts/migrate.mjs` — сортирует `migrations/*.sql` лексикографически, выполняет statements по `;`. **Нет** `schema_migrations` table — повторный прогон безопасен благодаря `IF NOT EXISTS`.

| # | File | What it adds |
|---|------|--------------|
| **001** | `001_init.sql` | `inboxes`, `messages`. UNIQUE `address`, UNIQUE `provider_id`. Indexes `expires_at`, `(inbox_id, received_at DESC)`. FK messages → inboxes ON DELETE CASCADE. |
| **002** | `002_allowed_senders.sql` | `inboxes.allowed_senders TEXT[] NOT NULL DEFAULT '{}'`. Пустой массив = принимать всех отправителей. |
| **003** | `003_qa_fields.sql` | `label`, `callback_url`. Partial index на `label`. |
| **004** | `004_api_key_hint.sql` | `api_key_hint` — первые 16 hex SHA-256 Bearer. Partial index `(api_key_hint, label)`. |
| **005** | `005_callback_deliveries.sql` | Table `callback_deliveries` + inbox FK CASCADE. Index `(inbox_id, created_at DESC)`. |
| **006** | `006_teams_api_keys.sql` | `teams`, `api_keys`. Stripe columns. Indexes `key_hint`, `team_id`. |
| **007** | `007_oidc_identities.sql` | `oidc_identities`, UNIQUE `(issuer, sub)`. |
| **008** | `008_api_key_scopes.sql` | `scope_label_prefix`, `scope_read_only`. Partial index on prefix. |
| **009** | `009_message_raw_r2.sql` | `messages.raw_r2_key` + partial index. |
| **010** | `010_message_attachments.sql` | `message_attachments` + message FK CASCADE. |
| **011** | `011_outbound_threads.sql` | `direction`, `thread_id`, `in_reply_to`, `to_addrs`, `rfc_message_id`. Backfill `thread_id = id`. Thread indexes. |
| **012** | `012_custom_domains.sql` | `domains` table. `inboxes.domain_id` FK. |
| **013** | `013_message_search.sql` | `CREATE EXTENSION vector`. `message_search` + HNSW embedding index. |
| **014** | `014_audit_log.sql` | `audit_events` + dual partial indexes (team vs legacy hint). |
| **015** | `015_agent_run_sessions.sql` | `agent_run_sessions` composite PK `(run_id, owner_key)`. |
| **016** | `016_team_dedicated_resend.sql` | Cipher columns on `teams`: `dedicated_resend_api_key_cipher`, `dedicated_resend_webhook_secret_cipher`, `dedicated_resend_configured_at`. |
| **017** | `017_team_event_webhook.sql` | `teams.event_webhook_url` — team-wide HTTPS webhook. |

**Команды:**

```bash
# Локально / CI deploy
DATABASE_URL="postgresql://..." npm run db:migrate

# После первого prod deploy (secret уже на Worker — migrate с локального DATABASE_URL того же Neon)
npm run db:migrate
```

**CI:** `DATABASE_URL` в GitHub Actions **опционален** — без него deploy пропускает auto-migrate, gate всё равно работает (contract tests без БД).

---

## Quick-ref: `inboxes`

Ядро продукта — disposable address с TTL.

| Column | Type | Notes |
|--------|------|-------|
| `id` | TEXT PK | `nanoid(12)` |
| `address` | TEXT UNIQUE | `inbox-{id}@{INBOX_DOMAIN}` или `{local}@{domain}` |
| `expires_at` | TIMESTAMPTZ | Cron hourly purge `<= NOW()` |
| `created_at` | TIMESTAMPTZ | |
| `allowed_senders` | TEXT[] | Пустой = любой From (002) |
| `label` | TEXT | QA trace, max 128 в коде |
| `callback_url` | TEXT | HTTPS webhook per message |
| `api_key_hint` | TEXT | Tenant scope (004) |
| `domain_id` | TEXT FK | Custom domain (012) |

**Indexes:** `idx_inboxes_expires_at`, `idx_inboxes_label`, `idx_inboxes_key_hint_label`, `idx_inboxes_domain`.

**Lifecycle:** create → messages → manual delete / bulk label / cron TTL. DELETE cascade messages; R2 purge в коде до DELETE.

---

## Quick-ref: `messages`

| Column | Type | Notes |
|--------|------|-------|
| `id` | TEXT PK | `nanoid(16)` |
| `inbox_id` | TEXT FK CASCADE | |
| `provider_id` | TEXT UNIQUE | Idempotency: Resend id или `sim_*` |
| `from_addr`, `subject` | TEXT | |
| `text_preview`, `html_preview` | TEXT | Truncated previews |
| `otp` | TEXT | Extracted code |
| `links_json` | JSONB | Magic links array |
| `received_at` | TIMESTAMPTZ | Sort key |
| `raw_r2_key` | TEXT | Pointer to `.eml` in R2 (009) |
| `direction` | TEXT | `inbound` \| `outbound` (011) |
| `thread_id`, `in_reply_to` | TEXT | Threading |
| `to_addrs` | JSONB | Outbound recipients |
| `rfc_message_id` | TEXT | Message-ID header |

**Indexes:** `(inbox_id, received_at DESC)`, thread, direction, partial `raw_r2_key`.

---

## Quick-ref: `teams` + `api_keys`

**teams** — billing unit, enterprise extras на той же строке (016, 017):

| Column | Notes |
|--------|-------|
| `id`, `name`, `plan` | `free` default |
| `stripe_customer_id`, `stripe_subscription_id` | Stripe billing |
| `dedicated_resend_*_cipher` | Enterprise per-team Resend (016) |
| `event_webhook_url` | Team-wide inbound webhook (017) |

**api_keys** — plaintext **никогда** не хранится:

| Column | Notes |
|--------|-------|
| `key_hash` | Full SHA-256 hex, UNIQUE |
| `key_hint` | First 16 hex — lookup + rate limit |
| `scope_label_prefix`, `scope_read_only` | Scoped keys (008) |

---

## Quick-ref: остальные таблицы

### `callback_deliveries`
Лог POST на `inboxes.callback_url`: `status_code`, `ok`, `duration_ms`, `error_text`. Index `(inbox_id, created_at DESC)`.

### `domains`
Custom domain: `name` UNIQUE, `status` (`pending`/`verified`), `resend_domain_id`, `dns_records` JSONB. Scope: `team_id` OR legacy `api_key_hint`.

### `message_attachments`
`message_id` FK, `provider_id` (Resend), `filename`, `content_type`, `size_bytes`, optional `r2_key`.

### `message_search`
PK `message_id`, `search_text`, optional `embedding vector(768)`, HNSW index partial.

### `audit_events`
`team_id`, `api_key_hint`, `action`, `resource_type`, `resource_id`, `meta` JSONB. Retention: `AUDIT_RETENTION_DAYS` (cron).

### `agent_run_sessions`
PK `(run_id, owner_key)` где `owner_key = teamId ?? apiKeyHint`. `state`, `steps` JSONB. Limits: 50 steps, state ≤ 32k chars.

### `oidc_identities`
`issuer`, `sub`, `email`, `team_id`. UNIQUE `(issuer, sub)`.

---

## Critical query patterns

### `findInboxByAddress` — inbound routing

**Модуль:** `src/services/inbox.ts`  
**Вызывают:** `src/services/resend-mail.ts` (queue consumer)

```sql
SELECT id, address, expires_at, created_at, allowed_senders, label, callback_url, api_key_hint
FROM inboxes
WHERE LOWER(address) = $normalized
  AND expires_at > NOW()
LIMIT 1
```

**Инварианты:**
- Case-insensitive match.
- Expired inbox → null → письмо dropped.
- **Без** фильтра по `api_key_hint` — SMTP path address-based.
- Allowlist проверяется отдельно (`isSenderAllowed`).

---

### `lookupKeyByHash` — Bearer → team

**Модуль:** `src/services/api-key-store.ts` (private)

```sql
SELECT k.id, k.team_id, k.label, k.scope_label_prefix, k.scope_read_only, t.plan AS team_plan
FROM api_keys k
JOIN teams t ON t.id = k.team_id
WHERE k.key_hash = $hash
LIMIT 1
```

**Порядок `resolveAuth`:**
1. `mat_*` → MCP OAuth JWT/KV
2. SHA-256 → `api_keys` JOIN `teams`
3. Plaintext match `API_KEY`/`API_KEYS` env → plan `legacy`
4. Иначе 401

---

### `countActiveInboxesForHint` / `ForTeam` — quota

**Per-key:**

```sql
SELECT COUNT(*)::int AS n FROM inboxes
WHERE expires_at > NOW() AND api_key_hint = $hint
```

**Per-team (все ключи команды):**

```sql
SELECT COUNT(*)::int AS n FROM inboxes
WHERE expires_at > NOW()
  AND api_key_hint IN (SELECT key_hint FROM api_keys WHERE team_id = $teamId)
```

**Важно:** inbox с `api_key_hint IS NULL` **не входят** в quota count.

**Лимиты:** `src/lib/plans.ts` → `PLAN_LIMITS[plan].maxActiveInboxes`.

---

### `insertMessage` — idempotency

```sql
INSERT INTO messages (...)
VALUES (...)
-- ON UNIQUE violation provider_id → catch → return null
```

Duplicate Resend delivery или повторный simulate с тем же id → тихий no-op.

---

### `purgeExpired` — cron hourly

```sql
SELECT id FROM inboxes WHERE expires_at <= NOW()
-- затем purge R2, DELETE FROM inboxes WHERE id IN (...)
```

Cascade удаляет messages, attachments meta, search rows. R2 — явный purge в `purgeRawMimeForInboxes`.

---

### `listInboxes` — tenant filter

Типичный WHERE для authenticated list:

```sql
AND (api_key_hint IS NULL OR api_key_hint = $hint)
```

Плюс optional `label`, `labelPrefix`. Cross-team → пустой список или 404 на get-by-id.

---

### `getTeamIdByApiKeyHint` — reverse lookup

Используется для team webhook routing, audit aggregation. Index `idx_api_keys_hint`.

---

## Indexes и constraints (критичные)

| Constraint | Table | Зачем |
|------------|-------|-------|
| UNIQUE `address` | inboxes | Один адрес |
| UNIQUE `provider_id` | messages | Idempotency |
| UNIQUE `key_hash` | api_keys | Один hash |
| UNIQUE `(issuer, sub)` | oidc_identities | OIDC user |
| UNIQUE `name` | domains | Global domain |

**CASCADE children:** `messages`, `callback_deliveries`, `message_attachments`, `message_search` от parent inbox/message.

**Postgres CHECK** в миграциях не используются — validation в TypeScript.

---

## Tenant isolation (краткая матрица)

| Inbox `api_key_hint` | Request hint | Результат |
|----------------------|--------------|-----------|
| NULL (legacy) | any auth key | **Allow** |
| set | matches | Allow |
| set | different | **404** (не 403) |

SQL list: `(api_key_hint IS NULL OR api_key_hint = $hint)`.

Team-level: domains, audit, dedicated Resend, team webhook — по `team_id`. Inbox quota при `teamId` — `countActiveInboxesForTeam`.

**Полная матрица:** [data-model-core.md § Tenant isolation](./data-model-core.md).

---

## Что НЕ в БД

| Data | Storage | Pointer in DB |
|------|---------|---------------|
| Raw MIME bytes | R2 `mailagent-raw-mime` | `messages.raw_r2_key` |
| Large attachments | R2 (optional) | `message_attachments.r2_key` |
| Rate limit counters | KV `RATE_LIMIT` | — |
| SSE wait subscribers | Durable Object `InboxWait` | — |
| Queue jobs | Cloudflare Queue `mailagent-email` | transient |
| MCP OAuth legacy tokens | KV `oauth:mat:{hash}` | — |
| Embeddings compute | Workers AI | optional column `message_search.embedding` |

Удаление inbox **обязано** purge R2 до SQL DELETE — CASCADE не трогает object storage.

---

## Операции и troubleshooting

### Migrate fails

| Симптом | Причина | Fix |
|---------|---------|-----|
| `DATABASE_URL is required` | Нет env | Экспорт в shell или `.dev.vars` |
| `extension "vector" does not exist` | Neon без pgvector | Включить extension в Neon console; 013 idempotent |
| Connection timeout | Нет pooling / channel_binding | Pooling ON; убрать `channel_binding=require` |
| Permission denied | Wrong user | Neon role с DDL rights |

### Health / connectivity

```bash
npm run doctor          # ping DB если DATABASE_URL локально
curl -s https://api.webmailagent.com/health | jq .
```

### Отладка без прямого SQL (рекомендуется агентам)

Contract tests и MCP **не требуют** DATABASE_URL:

```bash
MAILAGENT_API_URL=https://api.webmailagent.com \
MAILAGENT_API_KEY=ma_… \
  npm run test:contract:qa
```

Simulate inject messages через API — БД проверяется косвенно через wait/extract.

### Backup / DR

Не документировано в repo — Neon project-level backups (operator responsibility). См. [SETUP.md](../../SETUP.md), [OPERATOR.md](../../docs/OPERATOR.md).

---

## Связь с другими subcores

| Вопрос | Куда |
|--------|------|
| CREATE/DELETE inbox API | [inbox-core.md](./inbox-core.md) |
| Resend webhook → queue → insert | [email-core.md](./email-core.md) |
| API key auth, plans | [auth-billing-core.md](./auth-billing-core.md) |
| Deploy + migrate в CI | [deployment-core.md](./deployment-core.md) |
| Полная ER + все колонки | [data-model-core.md](./data-model-core.md) |

---

## ER diagram (compact)

```
teams ──┬── api_keys (hint → inboxes.api_key_hint)
        ├── oidc_identities
        ├── domains ──► inboxes.domain_id
        ├── audit_events
        └── dedicated_resend / event_webhook (cols)

inboxes ──┬── messages ──┬── message_attachments
          │              └── message_search
          └── callback_deliveries

agent_run_sessions (standalone, owner_key = teamId | hint)
```

---

## Частые вопросы роутера

**«Какая миграция добавила X?»** — таблица Migration chronology выше; детали DDL в файле `migrations/NNN_*.sql`.

**«Почему duplicate email не ошибка?»** — UNIQUE `provider_id`, `insertMessage` returns null.

**«Почему inbox другой команды виден?»** — только если `api_key_hint IS NULL` (legacy). Новые inbox всегда с hint.

**«Где хранится OTP?»** — `messages.otp`, заполняется при ingest/extract, не отдельная таблица.

**«Сколько таблиц?»** — 11 relational tables после 017 (без учёта extension `vector`).

**«Нужен ли DATABASE_URL в CI?»** — нет для contract/smoke; да опционально для auto-migrate на deploy.

---

## See also

- **[data-model-core.md](./data-model-core.md)** — полная схема, все колонки, ER, decision history, tenant matrix, index catalog, все query patterns
- [inbox-core.md](./inbox-core.md) — HTTP/MCP lifecycle inbox
- [email-core.md](./email-core.md) — ingest pipeline, allowlist at queue
- [auth-billing-core.md](./auth-billing-core.md) — `api_keys`, `teams`, scopes
- [deployment-core.md](./deployment-core.md) — `npm run db:migrate` в deploy flow
- [SETUP.md](../../SETUP.md) — Neon setup
- [migrations/](../../migrations/) — DDL files
