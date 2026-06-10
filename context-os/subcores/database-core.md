# Database Core

Специализированное ядро: Neon Postgres schema и критичные таблицы.

## Как устроена БД

- **Engine:** Neon Postgres (serverless).
- **Driver:** `@neondatabase/serverless` via `src/db/client.ts`.
- **Migrations:** `migrations/*.sql` (16 files), applied by `npm run db:migrate` (`scripts/migrate.mjs`).
- **Connection:** `DATABASE_URL` secret (pooling recommended per SETUP.md).

## Миграции (хронология)

| # | File | Adds |
|---|------|------|
| 001 | `001_init.sql` | `inboxes`, `messages` |
| 002 | `002_allowed_senders.sql` | `allowed_senders` column |
| 003 | `003_qa_fields.sql` | `label`, `callback_url` |
| 004 | `004_api_key_hint.sql` | `api_key_hint` on inboxes |
| 005 | `005_callback_deliveries.sql` | callback log table |
| 006 | `006_teams_api_keys.sql` | `teams`, `api_keys` |
| 007 | `007_oidc_identities.sql` | OIDC for MCP login |
| 008 | `008_api_key_scopes.sql` | `scope_label_prefix`, `scope_read_only` |
| 009 | `009_message_raw_r2.sql` | `raw_r2_key` on messages |
| 010 | `010_message_attachments.sql` | attachments table |
| 011 | `011_outbound_threads.sql` | thread fields, outbound direction |
| 012 | `012_custom_domains.sql` | custom domains |
| 013 | `013_message_search.sql` | search index + embeddings |
| 014 | `014_audit_log.sql` | audit events |
| 015 | `015_agent_run_sessions.sql` | agent run state |
| 016 | `016_team_dedicated_resend.sql` | enterprise Resend per team |

## Критичные таблицы

### `inboxes` — ядро продукта
```sql
id, address (UNIQUE), expires_at, created_at,
allowed_senders, label, callback_url, api_key_hint, domain_id
```
- TTL lifecycle, tenant scoping via `api_key_hint`.
- Index: `expires_at`, `label`.

### `messages` — содержимое почты
```sql
id, inbox_id (FK CASCADE), provider_id (UNIQUE),
from_addr, subject, text_preview, html_preview,
otp, links_json, received_at, raw_r2_key,
direction, thread_id, in_reply_to, to_addrs, rfc_message_id
```
- **Idempotency:** `provider_id` UNIQUE (Resend `email_id` or `sim_*`).
- Index: `(inbox_id, received_at DESC)`.

### `teams` + `api_keys` — multi-tenant auth
- `teams`: plan, Stripe customer/subscription.
- `api_keys`: `key_hash` UNIQUE, `key_hint`, scopes.

### `custom_domains` — verified domains for inbox addresses

### `message_attachments` — attachment metadata + R2 keys

### `callback_deliveries` — QA callback audit

### `message_search` — full-text + vector embeddings (Workers AI)

### `audit_events` — team audit trail (retention via cron)

### `agent_run_sessions` — multi-step agent state by runId

### `team_dedicated_resend` — enterprise per-team Resend credentials

## Доступ из кода

Primary service: `src/services/inbox.ts` (most inbox/message queries).

Auth: `src/services/api-key-store.ts` (api_keys, teams).

## Health check

`GET /health` — `SELECT 1` via Neon client.

## Операции

```bash
DATABASE_URL=postgresql://... npm run db:migrate
```

Optional in CI deploy workflow for session table auto-migrate.

## Что НЕ в БД

- Raw MIME bytes → R2 (`raw_r2_key` is pointer)
- Rate limit counters → KV (sampled)
- SSE subscriber state → Durable Object memory
- Queue messages → Cloudflare Queues (transient)

## Backup / DR

Not documented in repo — Neon project-level backups (operator responsibility per SETUP.md).
