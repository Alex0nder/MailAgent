# Data Model Core — MailAgent

Специализированное ядро Context OS: схема Neon Postgres, связи между сущностями, инварианты и паттерны доступа из кода.

---

## Purpose

Neon Postgres — единственный источник правды для:

- **Temporary inboxes** — адреса, TTL, allowlist отправителей, QA-метки, callback URL.
- **Messages** — превью письма, OTP, ссылки, threading, указатели на R2.
- **Multi-tenant auth** — teams, api_keys, OIDC identities, планы и Stripe.
- **Enterprise extras** — custom domains, audit log, agent run sessions, dedicated Resend, team webhooks.

Worker **не хранит** сырые байты MIME и вложений в Postgres — только метаданные и ключи R2. Очереди, KV и Durable Objects обслуживают доставку, rate limit и SSE, но не заменяют relational model.

**Primary code paths:**

| Concern | Module |
|---------|--------|
| DB client | `src/db/client.ts` |
| Inboxes / messages | `src/services/inbox.ts` |
| Auth / teams / keys | `src/services/api-key-store.ts` |
| Domains | `src/services/domains.ts` |
| Attachments | `src/services/message-attachments.ts` |
| Search | `src/services/message-search.ts` |
| Callback log | `src/services/callback-log.ts` |
| Audit | `src/services/audit-log.ts` |
| Agent runs | `src/services/agent-run-session.ts` |
| Dedicated Resend | `src/services/team-resend.ts` |
| Team webhook | `src/services/team-event-webhook.ts` |
| OIDC | `src/services/oidc-oauth.ts` |
| Migrations | `migrations/*.sql`, `scripts/migrate.mjs` |

---

## Entities

Ниже — **полный** список колонок по состоянию после миграций `001`–`017`. Типы — Postgres; `NOT NULL` указан явно где задан в DDL.

### `inboxes`

Ядро продукта: disposable email-адрес с TTL.

| Column | Type | Constraints / default | Notes |
|--------|------|----------------------|-------|
| `id` | `TEXT` | PK | `nanoid(12)` |
| `address` | `TEXT` | NOT NULL, UNIQUE | `inbox-{id}@{INBOX_DOMAIN}` или `{local}@{domain}` |
| `expires_at` | `TIMESTAMPTZ` | NOT NULL | TTL; cron удаляет `<= NOW()` |
| `created_at` | `TIMESTAMPTZ` | NOT NULL, DEFAULT NOW() | |
| `allowed_senders` | `TEXT[]` | NOT NULL, DEFAULT `'{}'` | Пустой массив = принимать всех (002) |
| `label` | `TEXT` | nullable | QA / CI trace, max 128 в коде (003) |
| `callback_url` | `TEXT` | nullable | HTTPS webhook на inbound (003) |
| `api_key_hint` | `TEXT` | nullable | Первые 16 hex SHA-256 ключа (004) |
| `domain_id` | `TEXT` | FK → `domains(id)` | Custom domain inbox (012) |

**Indexes:** `idx_inboxes_expires_at`, `idx_inboxes_label` (partial WHERE label IS NOT NULL), `idx_inboxes_key_hint_label` (partial WHERE api_key_hint IS NOT NULL), `idx_inboxes_domain`.

---

### `messages`

Inbound/outbound письма внутри inbox.

| Column | Type | Constraints / default | Notes |
|--------|------|----------------------|-------|
| `id` | `TEXT` | PK | `nanoid(16)` |
| `inbox_id` | `TEXT` | NOT NULL, FK → `inboxes(id)` ON DELETE CASCADE | |
| `provider_id` | `TEXT` | NOT NULL, UNIQUE | Idempotency: Resend `email_id` или `sim_*` |
| `from_addr` | `TEXT` | NOT NULL | |
| `subject` | `TEXT` | NOT NULL, DEFAULT `''` | |
| `text_preview` | `TEXT` | nullable | |
| `html_preview` | `TEXT` | nullable | |
| `otp` | `TEXT` | nullable | Extracted verification code |
| `links_json` | `JSONB` | NOT NULL, DEFAULT `'[]'` | Magic links array |
| `received_at` | `TIMESTAMPTZ` | NOT NULL, DEFAULT NOW() | Sort key |
| `raw_r2_key` | `TEXT` | nullable | Pointer to full `.eml` in R2 (009) |
| `direction` | `TEXT` | NOT NULL, DEFAULT `'inbound'` | `inbound` \| `outbound` (011) |
| `thread_id` | `TEXT` | nullable | Defaults to `id` on insert; threading (011) |
| `in_reply_to` | `TEXT` | nullable | RFC In-Reply-To (011) |
| `to_addrs` | `JSONB` | NOT NULL, DEFAULT `'[]'` | Outbound recipients (011) |
| `rfc_message_id` | `TEXT` | nullable | Message-ID header (011) |

**Indexes:** `idx_messages_inbox_received`, `idx_messages_raw_r2_key` (partial), `idx_messages_thread`, `idx_messages_direction`.

**Cascade:** DELETE inbox → DELETE all messages → DELETE `message_search`, `message_attachments`.

---

### `callback_deliveries`

Лог POST на `inboxes.callback_url` (отладка CI webhooks).

| Column | Type | Constraints / default |
|--------|------|----------------------|
| `id` | `TEXT` | PK |
| `inbox_id` | `TEXT` | NOT NULL, FK → `inboxes(id)` ON DELETE CASCADE |
| `message_id` | `TEXT` | nullable |
| `callback_url` | `TEXT` | NOT NULL |
| `status_code` | `INT` | nullable |
| `ok` | `BOOLEAN` | NOT NULL, DEFAULT false |
| `error_text` | `TEXT` | nullable |
| `duration_ms` | `INT` | nullable |
| `created_at` | `TIMESTAMPTZ` | NOT NULL, DEFAULT NOW() |

**Index:** `idx_callback_deliveries_inbox` on `(inbox_id, created_at DESC)`.

---

### `teams`

Организация / billing unit. Dedicated Resend и team webhook — **колонки на этой таблице**, отдельной `team_dedicated_resend` нет.

| Column | Type | Constraints / default | Migration |
|--------|------|----------------------|-----------|
| `id` | `TEXT` | PK | 006 |
| `name` | `TEXT` | NOT NULL | 006 |
| `plan` | `TEXT` | NOT NULL, DEFAULT `'free'` | 006 |
| `stripe_customer_id` | `TEXT` | nullable | 006 |
| `stripe_subscription_id` | `TEXT` | nullable | 006 |
| `created_at` | `TIMESTAMPTZ` | NOT NULL, DEFAULT NOW() | 006 |
| `dedicated_resend_api_key_cipher` | `TEXT` | nullable | 016 — AES-GCM ciphertext |
| `dedicated_resend_webhook_secret_cipher` | `TEXT` | nullable | 016 |
| `dedicated_resend_configured_at` | `TIMESTAMPTZ` | nullable | 016 |
| `event_webhook_url` | `TEXT` | nullable | 017 — team-wide inbound webhook |

---

### `api_keys`

Хеши API-ключей; plaintext **никогда** не пишется в БД.

| Column | Type | Constraints / default |
|--------|------|----------------------|
| `id` | `TEXT` | PK |
| `team_id` | `TEXT` | NOT NULL, FK → `teams(id)` ON DELETE CASCADE |
| `key_hash` | `TEXT` | NOT NULL, UNIQUE — full SHA-256 hex |
| `key_hint` | `TEXT` | NOT NULL — first 16 hex chars |
| `label` | `TEXT` | nullable |
| `created_at` | `TIMESTAMPTZ` | NOT NULL, DEFAULT NOW() |
| `scope_label_prefix` | `TEXT` | nullable (008) |
| `scope_read_only` | `BOOLEAN` | NOT NULL, DEFAULT false (008) |

**Indexes:** `idx_api_keys_hint`, `idx_api_keys_team`, `idx_api_keys_scope_prefix` (partial).

---

### `oidc_identities`

Привязка OIDC subject (Auth0/Google) к team для MCP OAuth.

| Column | Type | Constraints / default |
|--------|------|----------------------|
| `id` | `TEXT` | PK |
| `team_id` | `TEXT` | NOT NULL, FK → `teams(id)` ON DELETE CASCADE |
| `issuer` | `TEXT` | NOT NULL |
| `sub` | `TEXT` | NOT NULL |
| `email` | `TEXT` | nullable |
| `created_at` | `TIMESTAMPTZ` | NOT NULL, DEFAULT NOW() |
| | | UNIQUE `(issuer, sub)` |

**Index:** `idx_oidc_identities_team`.

---

### `message_attachments`

Метаданные вложений; опционально кэш байтов в R2.

| Column | Type | Constraints / default |
|--------|------|----------------------|
| `id` | `TEXT` | PK |
| `message_id` | `TEXT` | NOT NULL, FK → `messages(id)` ON DELETE CASCADE |
| `provider_id` | `TEXT` | NOT NULL — Resend attachment id |
| `filename` | `TEXT` | NOT NULL, DEFAULT `'attachment'` |
| `content_type` | `TEXT` | nullable |
| `size_bytes` | `INTEGER` | nullable |
| `content_disposition` | `TEXT` | nullable |
| `content_id` | `TEXT` | nullable — inline CID |
| `r2_key` | `TEXT` | nullable |
| `created_at` | `TIMESTAMPTZ` | NOT NULL, DEFAULT NOW() |

**Index:** `idx_message_attachments_message`.

---

### `domains`

Custom sending/receiving domains (Resend DNS).

| Column | Type | Constraints / default |
|--------|------|----------------------|
| `id` | `TEXT` | PK |
| `team_id` | `TEXT` | FK → `teams(id)` ON DELETE CASCADE, nullable |
| `api_key_hint` | `TEXT` | nullable — legacy single-key scope |
| `name` | `TEXT` | NOT NULL, UNIQUE |
| `status` | `TEXT` | NOT NULL, DEFAULT `'pending'` |
| `resend_domain_id` | `TEXT` | NOT NULL, UNIQUE |
| `dns_records` | `JSONB` | NOT NULL, DEFAULT `'[]'` |
| `region` | `TEXT` | nullable |
| `created_at` | `TIMESTAMPTZ` | NOT NULL, DEFAULT NOW() |
| `verified_at` | `TIMESTAMPTZ` | nullable |

**Indexes:** `idx_domains_team`, `idx_domains_hint`, `idx_domains_status`.

---

### `message_search`

Keyword + optional semantic search (pgvector).

| Column | Type | Constraints / default |
|--------|------|----------------------|
| `message_id` | `TEXT` | PK, FK → `messages(id)` ON DELETE CASCADE |
| `inbox_id` | `TEXT` | NOT NULL, FK → `inboxes(id)` ON DELETE CASCADE |
| `search_text` | `TEXT` | NOT NULL — concatenated subject/body/otp/links |
| `embedding` | `vector(768)` | nullable — Workers AI embed |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL, DEFAULT NOW() |

**Indexes:** `idx_message_search_inbox`, `idx_message_search_embedding` (HNSW, partial WHERE embedding IS NOT NULL).

**Extension:** `CREATE EXTENSION IF NOT EXISTS vector` (013).

---

### `audit_events`

Team-scoped audit trail (SOC 2 prep).

| Column | Type | Constraints / default |
|--------|------|----------------------|
| `id` | `TEXT` | PK |
| `team_id` | `TEXT` | FK → `teams(id)` ON DELETE CASCADE, nullable |
| `api_key_hint` | `TEXT` | NOT NULL |
| `api_key_id` | `TEXT` | nullable |
| `action` | `TEXT` | NOT NULL |
| `resource_type` | `TEXT` | nullable |
| `resource_id` | `TEXT` | nullable |
| `meta` | `JSONB` | nullable |
| `created_at` | `TIMESTAMPTZ` | NOT NULL, DEFAULT NOW() |

**Indexes:** `idx_audit_team_created` (partial team_id IS NOT NULL), `idx_audit_hint_created` (partial team_id IS NULL).

---

### `agent_run_sessions`

Multi-step agent state (MCP `get_run_session` / `patch_run_session`).

| Column | Type | Constraints / default |
|--------|------|----------------------|
| `run_id` | `TEXT` | PK (composite) |
| `owner_key` | `TEXT` | PK (composite) — `teamId` or `apiKeyHint` |
| `state` | `JSONB` | NOT NULL, DEFAULT `'{}'` |
| `steps` | `JSONB` | NOT NULL, DEFAULT `'[]'` |
| `created_at` | `TIMESTAMPTZ` | NOT NULL, DEFAULT NOW() |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL, DEFAULT NOW() |

**Index:** `idx_agent_run_sessions_owner_updated` on `(owner_key, updated_at DESC)`.

**Limits in code:** max 50 steps, state JSON ≤ 32 000 chars.

---

## Decision history

Ключевые архитектурные решения схемы и поведения — зафиксированы здесь, чтобы агент не «переизобретал» модель.

### `provider_id` UNIQUE — idempotency inbound

**Решение:** `messages.provider_id` UNIQUE globally (001).

**Почему:** Resend webhook и queue consumer могут доставить одно письмо дважды. Повторный `INSERT` ловится в `insertMessage()` → `return null` без ошибки клиенту.

**Значения:**

- Production inbound: Resend `email_id`.
- Simulate: `sim_{nanoid}` или детерминированный префикс из contract tests.

**Trade-off:** один provider_id нельзя привязать к двум inbox — приемлемо, т.к. Resend ID глобален.

---

### `api_key_hint` — tenant isolation без JOIN на каждый read

**Решение (004):** при создании inbox сохранять первые 16 hex SHA-256 Bearer token в `inboxes.api_key_hint`.

**Почему:**

- Inbound routing (`findInboxByAddress`) не знает, какой ключ создал inbox — hint не нужен для SMTP path.
- List/get/delete фильтруют по hint в application layer (`inboxAccessible`, SQL `OR api_key_hint IS NULL`).
- Quota `countActiveInboxesForHint` — один indexed lookup без join.

**Legacy visibility:** если `api_key_hint IS NULL` (inbox до 004 или env-only key), inbox **виден любому** аутентифицированному ключу. Это осознанная обратная совместимость:

```typescript
// src/services/inbox.ts — inboxAccessible
if (!row.api_key_hint) return true;
if (!apiKeyHint) return false;
return row.api_key_hint === apiKeyHint;
```

Новые inbox всегда получают hint при create через API.

---

### CASCADE deletes — inbox as deletion root

**Решение:** `messages`, `callback_deliveries`, `message_search`, `message_attachments` — `ON DELETE CASCADE` от parent.

**Почему:** temporary inbox = единица lifecycle. Удаление inbox (manual, bulk label, cron TTL) должно атомарно убрать все производные строки.

**Исключение — R2:** Postgres CASCADE не трогает object storage. `deleteInbox` и `purgeExpired` **явно** вызывают `purgeRawMimeForInboxes` и `purgeAttachmentR2ForInboxes` **до** `DELETE FROM inboxes`.

---

### `key_hash` vs `key_hint`

| Field | Length | Storage | Use |
|-------|--------|---------|-----|
| `key_hash` | 64 hex | `api_keys.key_hash` UNIQUE | Auth lookup |
| `key_hint` | 16 hex | `api_keys.key_hint`, `inboxes.api_key_hint` | Scoping, rate limits, audit |

Plaintext API key существует только у клиента и в env `MAILAGENT_API_KEYS` (legacy).

---

### pgvector + HNSW (013)

**Решение:** optional `embedding vector(768)` + HNSW index `vector_cosine_ops`.

**Почему:** semantic search поверх keyword ILIKE; embedding пишется асинхронно после ingest если `WORKERS_AI` / embed endpoint доступен.

**Fallback:** без embedding search degrades to keyword-only (`SearchMode` auto/keyword).

**Ops note:** extension `vector` требует Neon project с поддержкой pgvector; migrate idempotent via `CREATE EXTENSION IF NOT EXISTS`.

---

### Thread model (011)

- `thread_id` defaults to message `id` for new threads.
- Inbound replies match via `rfc_message_id` / `provider_id` against `In-Reply-To` / `References`.
- Index `(inbox_id, thread_id, received_at DESC)` для list threads API.

---

### Domains: `team_id` OR `api_key_hint` (012)

Dual scope для переходного периода:

- Team keys → `domains.team_id`.
- Legacy env key → `domains.api_key_hint`, `team_id NULL`.

Inbox на custom domain: `inboxes.domain_id` FK; address `{local}@{domains.name}`.

---

### Dedicated Resend on `teams`, not separate table (016)

Enterprise хранит **зашифрованные** credentials в колонках `teams`:

- `dedicated_resend_api_key_cipher`
- `dedicated_resend_webhook_secret_cipher`

Шифрование: `encryptTeamSecret` / `decryptTeamSecret` (`src/lib/team-secrets.ts`), ключ из env.

Отдельная таблица не нужна — 1:1 с team, упрощает billing queries.

---

### Team event webhook (017)

`teams.event_webhook_url` — один HTTPS endpoint на **все** inbox команды (в отличие от per-inbox `callback_url`).

Delivery: `fireTeamEventWebhook` после inbound; использует тот же callback machinery с audit в `callback_deliveries` не всегда (team webhook отдельный path).

---

### Agent run sessions composite PK (015)

`(run_id, owner_key)` — один run_id может теоретически существовать у разных tenants без коллизии.

`owner_key = teamId ?? apiKeyHint` (`sessionOwnerKey`).

---

### Audit: team vs legacy index split (014)

- `team_id IS NOT NULL` → index `(team_id, created_at DESC)`.
- Legacy env keys (`team_id NULL`) → index `(api_key_hint, created_at DESC)`.

Retention: `purgeExpiredAuditEvents` по `AUDIT_RETENTION_DAYS` env (cron hourly).

---

### Simulate path без SMTP

Contract tests: `POST /v1/inboxes/:id/simulate` → `insertMessage` с synthetic `provider_id`. БД не различает simulate vs real кроме prefix id.

---

## Sources

| Artifact | Path |
|----------|------|
| Migrations (DDL source of truth) | `migrations/001_init.sql` … `017_team_event_webhook.sql` |
| Migrate runner | `scripts/migrate.mjs` |
| Neon client | `src/db/client.ts` |
| Inbox / message CRUD | `src/services/inbox.ts` |
| Auth resolution | `src/services/api-key-store.ts` |
| Hint/hash helpers | `src/lib/api-key-hint.ts` |
| Domains | `src/services/domains.ts` |
| Attachments | `src/services/message-attachments.ts` |
| Raw MIME R2 | `src/services/raw-mime-r2.ts` |
| Search / embeddings | `src/services/message-search.ts`, `src/services/embeddings.ts` |
| Callback log | `src/services/callback-log.ts` |
| Audit | `src/services/audit-log.ts` |
| Agent sessions | `src/services/agent-run-session.ts` |
| Team Resend | `src/services/team-resend.ts` |
| Team webhook | `src/services/team-event-webhook.ts` |
| OIDC | `src/services/oidc-oauth.ts` |
| Cron entry | `src/index.ts` (`scheduled`), `wrangler.jsonc` (`0 * * * *`) |
| Plan limits | `src/lib/plans.ts` |
| Related subcores | `context-os/subcores/inbox-core.md`, `database-core.md`, `email-core.md` |

---

## Migration chronology

Миграции применяются **лексикографически** по имени файла. Runner (`scripts/migrate.mjs`) не ведёт таблицу версий — идempotent DDL (`IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`) безопасен для повторного прогона.

| # | File | What it adds |
|---|------|--------------|
| **001** | `001_init.sql` | Tables `inboxes`, `messages`. Core indexes on `expires_at`, `(inbox_id, received_at DESC)`. FK messages → inboxes CASCADE. UNIQUE `address`, UNIQUE `provider_id`. |
| **002** | `002_allowed_senders.sql` | Column `inboxes.allowed_senders TEXT[] DEFAULT '{}'`. |
| **003** | `003_qa_fields.sql` | Columns `label`, `callback_url`. Partial index on `label`. |
| **004** | `004_api_key_hint.sql` | Column `api_key_hint`. Composite partial index `(api_key_hint, label)`. |
| **005** | `005_callback_deliveries.sql` | Table `callback_deliveries` + inbox FK CASCADE. |
| **006** | `006_teams_api_keys.sql` | Tables `teams`, `api_keys`. Stripe columns. Indexes on hint and team_id. |
| **007** | `007_oidc_identities.sql` | Table `oidc_identities`, UNIQUE `(issuer, sub)`. |
| **008** | `008_api_key_scopes.sql` | Scoped keys: `scope_label_prefix`, `scope_read_only`. Partial index on prefix. |
| **009** | `009_message_raw_r2.sql` | Column `messages.raw_r2_key` + partial index. |
| **010** | `010_message_attachments.sql` | Table `message_attachments` + message FK CASCADE. |
| **011** | `011_outbound_threads.sql` | Outbound/thread columns on `messages`. Backfill `thread_id = id`. Thread/direction indexes. |
| **012** | `012_custom_domains.sql` | Table `domains`. Column `inboxes.domain_id` FK. |
| **013** | `013_message_search.sql` | Extension `vector`. Table `message_search`. HNSW embedding index. |
| **014** | `014_audit_log.sql` | Table `audit_events` + dual partial indexes. |
| **015** | `015_agent_run_sessions.sql` | Table `agent_run_sessions` composite PK. |
| **016** | `016_team_dedicated_resend.sql` | Enterprise Resend cipher columns on `teams` (not a new table). |
| **017** | `017_team_event_webhook.sql` | Column `teams.event_webhook_url`. |

**Deploy:** `.github/workflows/deploy-worker.yml` runs `npm run db:migrate` when `DATABASE_URL` secret present.

---

## ER relationships

```
                              ┌─────────────────┐
                              │     teams       │
                              │ id (PK)         │
                              │ plan, stripe_*  │
                              │ dedicated_*     │◄── 016 cipher cols
                              │ event_webhook   │◄── 017
                              └────────┬────────┘
                    ON DELETE CASCADE │
         ┌────────────────────────────┼────────────────────────────┐
         │                            │                            │
         ▼                            ▼                            ▼
┌─────────────────┐         ┌─────────────────┐         ┌─────────────────┐
│   api_keys      │         │ oidc_identities │         │    domains      │
│ team_id (FK)    │         │ team_id (FK)    │         │ team_id (FK)?   │
│ key_hash UNIQUE │         │ UNIQUE(iss,sub) │         │ api_key_hint?   │
│ key_hint        │         └─────────────────┘         │ name UNIQUE     │
└────────┬────────┘                                     └────────┬────────┘
         │ hint matches                                        │ domain_id
         │ inboxes.api_key_hint                                ▼
         │                                            ┌─────────────────┐
         │                                            │    inboxes      │
         │                                            │ id (PK)         │
         └───────────────────────────────────────────►│ address UNIQUE  │
                                                      │ expires_at      │
                                                      │ api_key_hint    │
                                                      └────────┬────────┘
                               ON DELETE CASCADE               │
              ┌────────────────────┬───────────────────────────┼──────────────────┐
              │                    │                           │                  │
              ▼                    ▼                           ▼                  ▼
     ┌────────────────┐   ┌────────────────┐          ┌──────────────┐   ┌──────────────────┐
     │   messages     │   │callback_deliv. │          │message_search│   │  audit_events    │
     │ inbox_id (FK)  │   │ inbox_id (FK)  │          │ inbox_id(FK) │   │ team_id (FK)?    │
     │ provider_id UQ │   └────────────────┘          │ message_id PK│   │ api_key_hint     │
     └───────┬────────┘                                 └──────────────┘   └──────────────────┘
             │ ON DELETE CASCADE
             ▼
     ┌────────────────┐
     │message_attach. │
     │ message_id(FK) │
     └────────────────┘

     ┌──────────────────────────────┐
     │   agent_run_sessions         │  (standalone — no FK to inboxes)
     │ PK (run_id, owner_key)       │
     │ owner_key = teamId | hint    │
     └──────────────────────────────┘

Legend:
  ──►  logical / application-level link (api_key_hint)
  FK   Postgres FOREIGN KEY
  ?    nullable — legacy OR team scope
```

**Cardinality summary:**

| From | To | Relationship |
|------|-----|--------------|
| team | api_keys | 1:N |
| team | oidc_identities | 1:N |
| team | domains | 1:N (or hint-scoped legacy) |
| team | audit_events | 1:N |
| inbox | messages | 1:N |
| inbox | callback_deliveries | 1:N |
| message | message_attachments | 1:N |
| message | message_search | 1:1 |
| domain | inboxes | 1:N (optional) |

---

## Critical query patterns

### `findInboxByAddress`

**Use:** inbound Resend webhook / queue — resolve recipient address → inbox row.

**Module:** `src/services/inbox.ts`

```typescript
export async function findInboxByAddress(env: Env, address: string): Promise<InboxRow | null> {
  const sql = getDb(env);
  const normalized = address.trim().toLowerCase();
  const rows = await sql`
    SELECT id, address, expires_at, created_at, allowed_senders, label, callback_url, api_key_hint
    FROM inboxes
    WHERE LOWER(address) = ${normalized}
      AND expires_at > NOW()
    LIMIT 1
  `;
  return rows[0] ? mapInboxRow(rows[0]) : null;
}
```

**Invariants:**

- Case-insensitive match via `LOWER(address)`.
- Expired inboxes invisible to inbound (returns null → message dropped).
- **No auth check** — SMTP path is address-based; allowlist checked separately (`isSenderAllowed`).
- Does not filter by `api_key_hint`.

**Callers:** `src/services/resend-mail.ts` (`processInboundEmail`).

---

### `lookupKeyByHash`

**Use:** Bearer token → team, plan, scopes.

**Module:** `src/services/api-key-store.ts` (private function)

```typescript
async function lookupKeyByHash(env: Env, hash: string) {
  const sql = getDb(env);
  const rows = await sql`
    SELECT k.id, k.team_id, k.label, k.scope_label_prefix, k.scope_read_only, t.plan AS team_plan
    FROM api_keys k
    JOIN teams t ON t.id = k.team_id
    WHERE k.key_hash = ${hash}
    LIMIT 1
  `;
  return rows[0] ?? null;
}
```

**Flow (`resolveAuth`):**

1. Compute `hint = sha256(token).slice(0,16)`, `hash = sha256(token)` full.
2. `lookupKeyByHash` → DB key.
3. Else if token in `MAILAGENT_API_KEYS` env → `plan: "legacy"`, `teamId: null`.
4. Else if `mat_*` → MCP OAuth path.
5. Else → 401.

**Invariants:** JOIN teams обязателен — каждый DB key принадлежит team.

---

### `countActiveInboxes` (hint and team variants)

**Use:** enforce `PLAN_LIMITS[plan].maxActiveInboxes` before create.

**Per-key:**

```typescript
export async function countActiveInboxesForHint(env: Env, apiKeyHint: string): Promise<number> {
  const sql = getDb(env);
  const rows = await sql`
    SELECT COUNT(*)::int AS n
    FROM inboxes
    WHERE expires_at > NOW()
      AND api_key_hint = ${apiKeyHint}
  `;
  return rows[0]?.n ?? 0;
}
```

**Per-team (all keys):**

```typescript
export async function countActiveInboxesForTeam(env: Env, teamId: string): Promise<number> {
  const sql = getDb(env);
  const rows = await sql`
    SELECT COUNT(*)::int AS n
    FROM inboxes
    WHERE expires_at > NOW()
      AND api_key_hint IN (
        SELECT key_hint FROM api_keys WHERE team_id = ${teamId}
      )
  `;
  return rows[0]?.n ?? 0;
}
```

**Route logic:** if `teamId` from auth → team count; else hint count.

**Note:** legacy inboxes with `api_key_hint IS NULL` **не входят** в quota counts — только явно tagged hint.

**Callers:** `src/routes/inboxes.ts`, `src/routes/agent.ts`, `src/services/console-stats.ts`.

---

### Other high-frequency patterns

**`getInbox` + `inboxAccessible`** — auth-gated read; SQL only checks expiry, app layer enforces hint.

**`insertMessage`** — try/catch on UNIQUE `provider_id` violation → null (idempotent).

**`listInboxes`** — dynamic filters: label, labelPrefix, hint with legacy OR NULL rule.

**`findMessageForThreading`** — `rfc_message_id = ANY($ids)` OR `provider_id = ANY($ids)`.

**`indexMessageSearch`** — upsert `message_search`, optional embedding UPDATE.

**`getTeamIdByApiKeyHint`** — reverse lookup hint → team for webhooks.

---

## Indexes and constraints

### Unique constraints (business-critical)

| Table | Constraint | Purpose |
|-------|------------|---------|
| `inboxes` | `address` | One live address per row |
| `messages` | `provider_id` | Inbound idempotency |
| `api_keys` | `key_hash` | One row per key |
| `domains` | `name`, `resend_domain_id` | Global domain identity |
| `oidc_identities` | `(issuer, sub)` | One OIDC user → one link |

### Foreign keys with CASCADE

| Child | Parent | ON DELETE |
|-------|--------|-----------|
| `messages` | `inboxes` | CASCADE |
| `callback_deliveries` | `inboxes` | CASCADE |
| `message_attachments` | `messages` | CASCADE |
| `message_search` | `messages`, `inboxes` | CASCADE |
| `api_keys` | `teams` | CASCADE |
| `oidc_identities` | `teams` | CASCADE |
| `domains` | `teams` | CASCADE |
| `audit_events` | `teams` | CASCADE |
| `inboxes.domain_id` | `domains` | NO ACTION (default) |

### Index catalog

| Index | Table | Columns | Notes |
|-------|-------|---------|-------|
| `idx_inboxes_expires_at` | inboxes | `expires_at` | Cron purge scan |
| `idx_inboxes_label` | inboxes | `label` | Partial: label IS NOT NULL |
| `idx_inboxes_key_hint_label` | inboxes | `(api_key_hint, label)` | Partial: hint IS NOT NULL |
| `idx_inboxes_domain` | inboxes | `domain_id` | Custom domain inboxes |
| `idx_messages_inbox_received` | messages | `(inbox_id, received_at DESC)` | List messages |
| `idx_messages_raw_r2_key` | messages | `raw_r2_key` | Partial |
| `idx_messages_thread` | messages | `(inbox_id, thread_id, received_at DESC)` | Threads API |
| `idx_messages_direction` | messages | `(inbox_id, direction, received_at DESC)` | Outbound filter |
| `idx_callback_deliveries_inbox` | callback_deliveries | `(inbox_id, created_at DESC)` | Diagnose callbacks |
| `idx_api_keys_hint` | api_keys | `key_hint` | Hint → team reverse lookup |
| `idx_api_keys_team` | api_keys | `team_id` | List team keys |
| `idx_api_keys_scope_prefix` | api_keys | `scope_label_prefix` | Partial |
| `idx_oidc_identities_team` | oidc_identities | `team_id` | |
| `idx_message_attachments_message` | message_attachments | `message_id` | |
| `idx_domains_team` | domains | `team_id` | |
| `idx_domains_hint` | domains | `api_key_hint` | Legacy scope |
| `idx_domains_status` | domains | `status` | |
| `idx_message_search_inbox` | message_search | `inbox_id` | |
| `idx_message_search_embedding` | message_search | HNSW(`embedding`) | Partial: embedding IS NOT NULL |
| `idx_audit_team_created` | audit_events | `(team_id, created_at DESC)` | Partial |
| `idx_audit_hint_created` | audit_events | `(api_key_hint, created_at DESC)` | Partial legacy |
| `idx_agent_run_sessions_owner_updated` | agent_run_sessions | `(owner_key, updated_at DESC)` | |

### Check constraints

Explicit Postgres CHECK constraints в миграциях **не используются** — validation в TypeScript (TTL max, label length, HTTPS callback URL, scope guards).

---

## Tenant isolation rules

### Dimensions

| Mechanism | Scope | Storage |
|-----------|-------|---------|
| `api_key_hint` | Per-key inbox visibility | `inboxes.api_key_hint` |
| `team_id` | Billing, domains, audit, dedicated Resend, team webhook | `teams`, `api_keys.team_id` |
| Scoped keys | `scope_label_prefix`, `scope_read_only` | `api_keys` |

### Inbox access matrix

| Inbox `api_key_hint` | Request key hint | Result |
|----------------------|------------------|--------|
| NULL (legacy) | any authenticated | **Allow** read/list/delete |
| set | matches | Allow |
| set | different | **404** (not 403 — no leak) |
| set | missing (internal?) | Deny |

SQL list queries use permissive filter for legacy:

```sql
AND (api_key_hint IS NULL OR api_key_hint = ${hint})
```

### Team-level aggregation

When `resolveAuth` returns `teamId`:

- Inbox quota: `countActiveInboxesForTeam` — суммирует все `key_hint` команды.
- Domains: `domains.team_id = teamId`.
- Audit: `audit_events.team_id = teamId`.
- Stats / console: messages 24h aggregated via join inboxes → api_keys hints.

Legacy env key (`teamId: null`):

- Domains scoped by `api_key_hint` only.
- Audit indexed by `api_key_hint` where `team_id IS NULL`.

### Scoped API keys (008)

- `scope_label_prefix` — inbox `label` must start with prefix (enforced in `scope-guard.ts`).
- `scope_read_only` — mutating routes blocked.

### OIDC / MCP OAuth

`oidc_identities` binds external IdP user to `team_id`. Issued `mat_*` tokens resolve to same team context as API keys.

### Cross-tenant anti-patterns (never do)

- SELECT inbox by id without `inboxAccessible` / hint filter on mutating routes.
- COUNT quota using only hint when `teamId` present — undercounts rotated keys.
- Store plaintext API key in any column.

---

## TTL and purge

### Inbox TTL

| Setting | Source | Default |
|---------|--------|---------|
| `ttlMinutes` on create | request body | — |
| `DEFAULT_TTL_MINUTES` | env / wrangler | 30 |
| Max TTL | route validation | 1440 (24h) |

Column: `inboxes.expires_at = now + ttl`.

**Active inbox definition:** `expires_at > NOW()` — used everywhere (get, list, quota, findByAddress).

### Cron `purgeExpired`

**Schedule:** `0 * * * *` hourly (`wrangler.jsonc`).

**Handler:** `src/index.ts` → `scheduled`:

```typescript
async scheduled(_controller, env) {
  const result = await purgeExpired(env);
  const audit = await purgeExpiredAuditEvents(env);
  console.log("cron purge", { ...result, auditDeleted: audit.deleted });
}
```

**`purgeExpired` algorithm** (`src/services/inbox.ts`):

1. `SELECT id FROM inboxes WHERE expires_at <= NOW()`
2. `purgeRawMimeForInboxes(env, ids)` — delete R2 objects for `raw_r2_key`
3. `purgeAttachmentR2ForInboxes(env, ids)` — delete attachment R2 keys
4. `DELETE FROM inboxes WHERE expires_at <= NOW() RETURNING id`
5. CASCADE removes messages, search rows, attachments metadata, callback logs

**Returns:** `{ inboxes, rawDeleted, attDeleted }`.

### Audit retention

`purgeExpiredAuditEvents`:

```sql
DELETE FROM audit_events
WHERE created_at < NOW() - (${days} * INTERVAL '1 day')
```

`days` from env `AUDIT_RETENTION_DAYS` (see `auditRetentionDays()` in audit-log.ts).

### Manual delete

`DELETE /v1/inboxes/:id` and bulk by `labelPrefix` — same R2 purge **before** inbox DELETE.

### What TTL does NOT purge

- `agent_run_sessions` — no FK to inbox; separate lifecycle (not cron-purged in current code).
- `teams`, `api_keys`, `domains`, `oidc_identities` — persistent until explicit delete/revoke.

---

## What's NOT in DB

| Data | Where | DB pointer / note |
|------|-------|-------------------|
| Raw MIME bytes (.eml) | **R2** bucket | `messages.raw_r2_key` |
| Attachment file bytes | **R2** (optional cache) | `message_attachments.r2_key` |
| Rate limit counters | **KV** namespace | Sampled per hint/IP |
| SSE wait subscribers | **Durable Object** `InboxWait` | In-memory + DO storage |
| Email queue jobs | **Cloudflare Queues** | Transient; payload has Resend ids |
| OIDC OAuth state / codes | **KV** | Keys `oauth:oidc:state:*`, `oauth:oidc:code:*` TTL 600s |
| MCP access tokens | issued JWT | Not stored; validated crypto |
| Plaintext API keys | client / env only | DB has hash + hint |
| Dedicated Resend secrets | `teams.*_cipher` | Encrypted blob, not plaintext |
| Static assets / docs | **Workers Assets** | — |
| Embedding model weights | **Workers AI** | Vectors in `message_search.embedding` |

**Implication for agents:** deleting SQL rows without R2 purge leaves orphan objects — always use service-layer delete/purge, not raw SQL in ops unless R2 cleanup included.

---

## Neon client usage

### `getDb`

```typescript
// src/db/client.ts
import { neon } from "@neondatabase/serverless";

export function getDb(env: Env) {
  return neon(env.DATABASE_URL);
}
```

- **Driver:** `@neondatabase/serverless` — HTTP-based, Workers-compatible.
- **Connection string:** `DATABASE_URL` secret (pooled endpoint recommended in SETUP.md).
- **No connection pool object** — each `getDb()` returns tagged-template executor.

### Tagged template queries

Primary pattern across all services:

```typescript
const sql = getDb(env);
const rows = await sql`
  SELECT id, address FROM inboxes
  WHERE id = ${inboxId}
  LIMIT 1
`;
```

**Properties:**

- Parameters auto-escaped (SQL injection safe).
- Returns array of row objects.
- JSON/JSONB: pass `JSON.stringify(obj)` or `metaJson::jsonb` cast.
- pgvector: `vectorLiteral(embedding)` + `${vec}::vector` cast in search service.

### `sql.query` in migrate script

`scripts/migrate.mjs` uses `neon(url)` then `sql.query(statement)` for raw DDL strings split by `;`.

### Health check

`GET /health` — `SELECT 1` via same client (`src/routes/health.ts`).

### Error handling conventions

| Case | Pattern |
|------|---------|
| Idempotent insert | try/catch → return null (`insertMessage`) |
| Not found | empty rows → null / false |
| Auth failure | middleware before DB |
| Non-blocking index | catch + console.error (`indexMessageSearch`) |

### Type casting

Services cast rows `as InboxRow[]` etc. — no ORM; interfaces in service files mirror columns.

---

## Migration operations

### Command

```bash
# From repo root — loads .env / .dev.vars via scripts/load-env.mjs
npm run db:migrate
```

Equivalent:

```bash
DATABASE_URL="postgresql://..." npm run db:migrate
```

### Runner behavior (`scripts/migrate.mjs`)

1. Require `DATABASE_URL` or exit 1.
2. Read `migrations/*.sql`, sort lexicographically.
3. For each file: split on `;`, trim, execute each statement via `sql.query`.
4. Log `ok:` + statement prefix.
5. Print `migration complete`.

**No schema_migrations table** — versioning is filename convention only.

### When to run

| Context | Action |
|---------|--------|
| Local dev setup | After Neon project created |
| CI deploy | `.github/workflows/deploy-worker.yml` if secret set |
| Before `issue:pilot-key` | Doctor may warn if schema behind |
| After pulling new migrations | Manual `db:migrate` on each environment |

### Idempotency notes

- Safe to re-run: `CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`.
- **Not tracked:** applied state — operator must ensure 001–017 applied once per env.
- `CREATE EXTENSION vector` — requires Neon support; fails on vanilla Postgres without pgvector.

### Verify schema

```bash
npm run doctor          # local env + schema check
npm run doctor:qa       # prod API smoke (no DATABASE_URL needed)
```

Doctor compares expected tables/columns against live DB when `DATABASE_URL` set.

### Adding migration 018+

1. Create `migrations/018_description.sql` with idempotent DDL.
2. Update service TypeScript if new columns.
3. Run `npm run db:migrate` locally.
4. Update this core doc Entities + chronology tables.
5. Contract tests if API surface changes.

---

## Quick reference: table count

| # | Table | Introduced |
|---|-------|------------|
| 1 | `inboxes` | 001 |
| 2 | `messages` | 001 |
| 3 | `callback_deliveries` | 005 |
| 4 | `teams` | 006 (+ cols 016, 017) |
| 5 | `api_keys` | 006 (+ cols 008) |
| 6 | `oidc_identities` | 007 |
| 7 | `message_attachments` | 010 |
| 8 | `domains` | 012 |
| 9 | `message_search` | 013 |
| 10 | `audit_events` | 014 |
| 11 | `agent_run_sessions` | 015 |

**Total: 11 tables.** Enterprise Resend (016) and team webhook (017) extend `teams` — not separate tables.

---

## Appendix: column lineage by migration

Для быстрого diff «что добавила миграция X»:

**inboxes:** 001 base → 002 allowed_senders → 003 label, callback_url → 004 api_key_hint → 012 domain_id

**messages:** 001 base → 009 raw_r2_key → 011 direction, thread_id, in_reply_to, to_addrs, rfc_message_id

**teams:** 006 base → 016 dedicated_resend_* → 017 event_webhook_url

**api_keys:** 006 base → 008 scope_*

**New tables:** 005 callback_deliveries, 006 teams+api_keys, 007 oidc_identities, 010 message_attachments, 012 domains, 013 message_search, 014 audit_events, 015 agent_run_sessions

---

*Last synced with migrations 001–017 and `src/services/inbox.ts`, `api-key-store.ts` as of repo HEAD.*
