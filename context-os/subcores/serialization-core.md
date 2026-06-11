# Serialization Core — MailAgent

Специализированное ядро Context OS: **как MailAgent превращает сырой email в стабильный JSON** для REST, MCP, callback и agent flows. Охватывает валидацию входа, извлечение OTP/links, verification object, OpenAPI-контракты, Zod-схемы MCP и формат ошибок.

**Когда грузить:** «почему otp null?», «какой формат verification?», «invalid_callback_url», structured extract, OpenAPI schema, scope в api_keys, false positive OTP.

**Связанные subcores:** `otp-core` (узкий OTP troubleshooting), `api-core` (полный список endpoints), `email-core` (Resend ingest), `inbox-core` (wait/SSE).

---

## Purpose

MailAgent — не почтовый клиент, а **сериализатор verification-сигналов** для агентов и QA. Ядро отвечает на четыре группы вопросов:

### 1. Validation (входные контракты)

Перед созданием inbox или agent session вход нормализуется и отклоняется с машиночитаемым `error`:

| Вход | Модуль | Результат |
|------|--------|-----------|
| `callbackUrl` | `lib/callback-url.ts` | Только HTTPS, без localhost/private IP, max 2048 |
| `expectFrom` / `allowedSenders` | `lib/sender-allowlist.ts` | Lowercase, email или `@domain`, subdomain match |
| `runId` | `lib/validate-run-id.ts` | `[a-zA-Z0-9._-]{1,128}` |
| `service` | `lib/service-presets.ts` | Preset → expectFrom, subject hint, TTL |
| MCP tool args | `mcp/src/index.ts` | Zod per-tool (ttl 5–1440, timeout 5–120, …) |
| REST body | `routes/inboxes.ts` | `inboxOptionsFromBody` + OpenAPI `InboxCreate` |

### 2. Format (выходные контракты)

Единый **verification object** (`MessageVerification`) — источник правды для:

- `GET /v1/inboxes/:id/extract`
- `GET /v1/inboxes/:id/messages` (поля `otp`, `links`, `primaryLink`)
- `POST /v1/agent/verify` → `verification` + `agent.primaryAction`
- Callback payload → `verification` nested в `MessageNotifyPayload`
- MCP tools → JSON text content (stringified)

CamelCase в REST/MCP; snake_case только в Postgres (`from_addr`, `links_json`).

### 3. Extract (парсинг при ingest)

OTP и links извлекаются **один раз** при записи сообщения в БД (`processInboundEmail`, `sendFromInbox`, simulate). Read-path **не парсит заново** — читает `messages.otp` и `messages.links_json`.

Structured extract (`structured-extract.ts`) — второй слой: presets (rules) и optional Workers AI для custom schema.

### 4. API contracts (документирование)

- **OpenAPI 3.0.3:** `src/openapi/spec.ts` → `GET /v1/openapi.json`
- **MCP manifest:** `src/mcp/manifest.ts` → `GET /v1/agent` (`mcpTools`)
- **Contract tests:** `npm run test:contract:qa` (simulate, без SMTP)

---

## Entities

### MessageVerification

Файл: `src/services/message-verify.ts`

```typescript
export type MessageVerification = {
  otp: string | null;
  links: string[];
  primaryLink: string | null;
  from: string;
  subject: string;
  messageId: string;
  hasRaw?: boolean;
  rawUrl?: string;  // relative: /v1/inboxes/{inboxId}/messages/{id}/raw
};
```

Фабрика: `formatMessageVerification(row, inboxId?)` — парсит `links_json`, вызывает `primaryLink(links)`.

### MessageRow (Postgres → TypeScript)

Файл: `src/services/inbox.ts`

| Поле TS | Колонка SQL | Тип | Назначение |
|---------|-------------|-----|------------|
| `id` | `id` | TEXT PK | nanoid(16) |
| `inbox_id` | `inbox_id` | TEXT FK | inbox |
| `provider_id` | `provider_id` | TEXT UNIQUE | Resend email_id или `sim_*` |
| `from_addr` | `from_addr` | TEXT | Raw From header |
| `subject` | `subject` | TEXT | Subject |
| `text_preview` | `text_preview` | TEXT | До ~2000 символов |
| `html_preview` | `html_preview` | TEXT | До ~4000 символов |
| `otp` | `otp` | TEXT NULL | Pre-extracted OTP |
| `links_json` | `links_json` | JSONB | `string[]`, max 5 at extract |
| `received_at` | `received_at` | TIMESTAMPTZ | ingest time |
| `raw_r2_key` | `raw_r2_key` | TEXT NULL | R2 key для .eml |

REST `formatMessage()` (`routes/inboxes.ts`) маппит row → camelCase `Message` (`from`, `textPreview`, `links`, `primaryLink`, `receivedAt`, `hasRaw`, `rawUrl`).

### MessageNotifyPayload (callback / DO notify)

Файл: `src/env.ts`

```typescript
export interface MessageNotifyPayload {
  id: string;
  inboxId: string;
  from: string;
  subject: string;
  otp: string | null;
  links: string[];
  primaryLink: string | null;
  receivedAt: string;
  verification?: MessageVerification;  // nested duplicate for agents
}
```

Callback расширяет payload: `address`, `label` (`services/callback.ts`).

### ExtractPreset & StructuredExtractResult

Файл: `src/services/structured-extract.ts`

```typescript
export type ExtractPreset =
  | "2fa" | "magic_link" | "invite" | "invoice" | "receipt";

export type StructuredExtractResult = {
  messageId: string;
  preset: ExtractPreset | null;
  extractor: "rules" | "ai" | "hybrid";
  data: Record<string, unknown>;
};
```

`listExtractPresets()` — metadata для `GET …/extract/presets`.

### OpenAPI components (ключевые)

Файл: `src/openapi/spec.ts`

| Schema | Поля |
|--------|------|
| `Error` | `{ error: string }` |
| `InboxCreate` | ttlMinutes, service, expectFrom, allowedSenders, label, callbackUrl, username, domainId |
| `InboxOpen` | InboxCreate + subjectContains, messageIndex, timeoutSeconds, deleteAfter |
| `Inbox` | id, address, expiresAt, allowedSenders, label, callbackUrl, messageCount |
| `Message` | id, from, subject, textPreview, otp, links, primaryLink, receivedAt, hasRaw, rawUrl, attachmentCount |
| `Verification` | otp, links, primaryLink, from, subject, messageId |
| `CallbackDelivery` | id, callbackUrl, messageId, statusCode, ok, error, durationMs, createdAt |
| `Domain` | id, name, status, dnsRecords, … |

Responses: `Unauthorized`, `NotFound`, `RateLimited` (`error`, `limitPerMinute`, `retryAfterSeconds`).

### ApiKeyScope (JSON в auth context, не в каждом response)

Файл: `src/lib/key-scope.ts`

```typescript
export type ApiKeyScope = {
  labelPrefix: string | null;  // DB: scope_label_prefix
  readOnly: boolean;           // DB: scope_read_only
};
```

Колонки: `migrations/008_api_key_scopes.sql`.

### Agent primaryAction

Файл: `src/lib/agent-recipes.ts` — `buildPrimaryAction(verification)`:

```typescript
{ type: "otp" | "magic_link" | "link" | "manual"; value?: string; instruction: string }
```

Приоритет: OTP > primaryLink > links[0] > manual.

### EmailQueueMessage (queue, не REST)

```typescript
export interface EmailQueueMessage {
  provider: "resend";
  emailId: string;
  from: string;
  to: string[];
  subject: string;
  receivedAt: string;
  resendTeamId?: string;
}
```

Webhook кладёт минимальный job; body fetch — в queue consumer.

---

## Decision history

### Extract в queue, не в webhook

**Решение:** `POST /webhooks/resend` только verify Svix signature → `MAIL_QUEUE.send(job)` → 200.

**Почему:**

1. Webhook timeout Resend/Svix — секунды; `emails.receiving.get` + extract + R2 + attachments может занять дольше.
2. Retry/DLQ queue переживает transient Resend errors.
3. Hot path webhook не блокируется парсингом HTML.

**Где extract:** `src/services/resend-mail.ts` → `processInboundEmail()`:

```typescript
const combined = `${text}\n${html}`;
const otp = extractOtp(combined);
const links = extractLinks(combined);
await insertMessage(env, { ..., otp, links });
```

**Источник комментария:** `extract.ts` line 1: `Extract OTP and links on ingest (not in webhook hot path)`.

### LINK_NOISE — фильтр «не magic link»

**Решение:** URL matching `LINK_NOISE` исключаются из `links[]`:

```typescript
const LINK_NOISE =
  /unsubscribe|list-manage|mailto:|privacy|preferences|trk\.|click\./i;
```

**Почему:** Marketing emails содержат десятки tracking/unsubscribe URL. Агент не должен открывать их как verification link. `trk.` и `click.` — типичные redirect wrappers ESP.

**Не фильтруем:** verify URLs на тех же доменах — они проходят через `LINK_VERIFY` ranking.

### OTP regex order — specificity before generic

**Порядок `OTP_PATTERNS`:**

1. `code:` / `verification:` / `one-time password:` — явные метки (4–8 цифр)
2. `\b(\d{6})\b` — стандартный 6-digit OTP
3. `\b(\d{4})\b` — fallback 4-digit

**Почему такой порядок:** Generic `\d{6}` раньше explicit labels давал false positives (order numbers, dates). Explicit patterns first — industry standard (Auth0, Google templates).

**Guard:** 4-digit codes starting with `20` skipped (years 2000–2099).

**Fallback:** npm `parse-otp-message` если regex не сработали — только если `^\d{4,8}$`.

### primaryLink = links[0] after rank

Links sorted by `linkScore`: +2 if `LINK_VERIFY` match. `primaryLink()` returns `links[0]`. Не отдельный алгоритм — ranking уже в `extractLinks`.

### Pre-extract at insert, not at read

**Решение:** `otp` и `links_json` immutable после ingest (simulate может задать явно).

**Почему:** O(1) read для wait/extract/MCP; deterministic contract tests; search index uses stored otp.

**Exception:** `POST …/messages/:messageId/extract` — on-demand structured/AI поверх stored previews.

### callbackUrl HTTPS-only

**Решение:** `parseCallbackUrl` rejects http, localhost, `.local`, 127.*, 10.*, 192.168.*

**Почему:** Callback carries OTP/links — must not leak to MITM or dev-only URLs in prod API.

### simulate bypasses allowlist ingest

Simulate (`simulate-inbound.ts`) пишет напрямую в DB — **не** проходит `isSenderAllowed` в queue. QA может inject arbitrary `from`. Production inbound still filtered.

### Hybrid extract: rules + AI merge

If `preset` + `custom schema` + `env.AI`: `extractor: "hybrid"`, `data: { ...rulesData, ...aiData }` — AI keys win on collision.

### OpenAPI err schema minimal

`{ error: string }` — без nested `message` по умолчанию. Некоторые routes add `hint`, `active`, `max` (quota). Agents should parse `error` first.

### MCP stdio vs remote MCP

- **stdio** (`mcp/src/index.ts`): Zod at registerTool; client calls REST.
- **remote** (`src/mcp/handlers.ts`): manifest JSON Schema; same backend logic.

`mailagent_extract_structured` — только remote MCP (manifest + handlers), не в stdio `index.ts` (на момент документа).

---

## Sources

**Extract/verify:** `src/services/extract.ts`, `message-verify.ts`, `structured-extract.ts`, `resend-mail.ts`, `simulate-inbound.ts`

**REST/OpenAPI:** `src/routes/inboxes.ts`, `src/routes/agent.ts`, `src/openapi/spec.ts`

**Validation libs:** `src/lib/callback-url.ts`, `sender-allowlist.ts`, `validate-run-id.ts`, `service-presets.ts`, `key-scope.ts`

**MCP:** `mcp/src/index.ts` (stdio Zod), `src/mcp/handlers.ts`, `src/mcp/manifest.ts`

**DB:** `migrations/001_init.sql`, `008_api_key_scopes.sql`, `src/services/inbox.ts`

**Tests/docs:** `scripts/contract-qa*.ts`, `docs/AUTOTESTS.md` · см. также `otp-core.md`, `api-core.md`

---

## OTP extraction

### Pipeline

```
Resend receiving.get → text + html
        ↓
combined = text + "\n" + html
        ↓
extractOtp(combined) → messages.otp
        ↓
formatMessageVerification → REST/MCP/callback
```

### OTP_PATTERNS (ordered)

```typescript
const OTP_PATTERNS = [
  /code[:\s]+(\d{4,8})/i,
  /verification[:\s]+(\d{4,8})/i,
  /one[- ]?time(?: password)?[:\s]+(\d{4,8})/i,
  /\b(\d{6})\b/,
  /\b(\d{4})\b/,
];
```

| Pattern | Example | Notes |
|---------|---------|-------|
| `code:` / `verification:` / `one-time password:` | explicit labels | tried first |
| `\b(\d{6})\b` | 6-digit standalone | common OTP |
| `\b(\d{4})\b` | 4-digit | skip if starts with `20` (year) |

### parse-otp-message fallback

```typescript
const parsed = parseOtpMessage(text);
if (parsed?.code && /^\d{4,8}$/.test(parsed.code)) return parsed.code;
```

Библиотека понимает больше natural-language шаблонов. Вызывается **после** всех regex — не переопределяет explicit match.

Type stub: `src/types/parse-otp-message.d.ts`.

### False positives (known)

| Symptom | Cause | Mitigation |
|---------|-------|------------|
| OTP = year fragment | 4-digit regex | `20xx` guard |
| Wrong/null OTP | multiple codes / HTML-only | messageIndex, raw MIME, structured extract |
| Magic link only | no OTP in mail | use `primaryLink` / primaryAction |

### simulate OTP

```bash
POST /v1/inboxes/:id/simulate
{ "otp": "482910", "from": "noreply@auth0.com", "subject": "Verify your email" }
```

Simulate **не** re-runs extract on provided otp — stores explicit value. Default otp `482910` if omitted.

Scenarios: `otp`, `magic_link`, `attachment`, `invite`, `invoice_fixture` (`lib/simulate-scenarios.ts`).

### extract2faFromText (tests)

Re-export for unit tests — runs extract on arbitrary combined string:

```typescript
export function extract2faFromText(row: MessageRow, combined: string) {
  const otp = extractOtp(combined);
  const links = extractLinks(combined);
  return { otp, links, primaryLink: primaryLink(links), ... };
}
```

---

## Link extraction

### extractLinks algorithm

```typescript
export function extractLinks(text: string, max = 5): string[] {
  const found = text.match(LINK_PATTERN) ?? [];
  const unique = [...new Set(found.map((u) => u.replace(/[.,;]+$/, "")))];
  const filtered = unique.filter((u) => !LINK_NOISE.test(u));
  const ranked = filtered.sort((a, b) => linkScore(b) - linkScore(a));
  return ranked.slice(0, max);
}
```

`LINK_PATTERN`: `/https?:\/\/[^\s<>"')\]]+/gi`

### LINK_VERIFY ranking

```typescript
const LINK_VERIFY =
  /verify|confirm|activation|magic|token|oauth|sign[-_]?in|signup|password[-_]?reset|auth/i;

function linkScore(url: string): number {
  return LINK_VERIFY.test(url) ? 2 : 0;
}
```

Verify-like URLs sort first; stable sort preserves discovery order among equals.

### primaryLink

```typescript
export function primaryLink(links: string[]): string | null {
  return links[0] ?? null;
}
```

Used in: `formatMessageVerification`, `formatMessage`, `MessageNotifyPayload`, `buildPrimaryAction`.

### Magic-link-only emails

Many services (Auth0, Notion) send **no OTP** — only link. Agent flow:

1. Check `verification.otp` — if null
2. Use `verification.primaryLink` or `agent.primaryAction.type === "magic_link"`
3. Do **not** treat `links[1]` as primary unless diagnose suggests wrong ranking

### Link storage

At insert: `JSON.stringify(links)` → `links_json` JSONB.

At read: `parseLinks(raw)` handles array or JSON string (legacy):

```typescript
function parseLinks(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw as string[];
  if (typeof raw === "string") {
    try { return JSON.parse(raw) as string[]; } catch { return []; }
  }
  return [];
}
```

---

## Verification object

### Construction

```typescript
export function formatMessageVerification(
  row: MessageRow,
  inboxId?: string
): MessageVerification {
  const links = parseLinks(row.links_json);
  return {
    otp: row.otp,
    links,
    primaryLink: primaryLink(links),
    from: row.from_addr,
    subject: row.subject,
    messageId: row.id,
    hasRaw: Boolean(row.raw_r2_key),
    ...(row.raw_r2_key && inboxId
      ? { rawUrl: `/v1/inboxes/${inboxId}/messages/${row.id}/raw` }
      : {}),
  };
}
```

### REST endpoints returning verification

| Endpoint | Shape |
|----------|-------|
| `GET /v1/inboxes/:id/extract` | `MessageVerification` (latest message) |
| `GET /v1/inboxes/:id/wait` | `{ message: Message }` — Message includes otp/links |
| `POST /v1/inboxes/open` | `{ verification, inbox, … }` |
| `POST /v1/agent/verify` | `{ verification, agent: { primaryAction, … } }` |
| Callback POST | `MessageNotifyPayload` + `verification` nested |

### MCP mapping

| Tool | Returns |
|------|---------|
| `mailagent_extract_verification` | Latest verification JSON |
| `mailagent_verify_signup` | Full verify result + primaryAction |
| `mailagent_wait_and_extract` | Wait + verification |
| `mailagent_list_messages` | Per-message otp, links (via REST) |

MCP wraps all in `{ content: [{ type: "text", text: JSON.stringify(data) }] }`.

### rawUrl semantics

Relative path — client prepends API base (`https://api.webmailagent.com`). Requires Bearer on download. `hasRaw: false` if R2 store skipped (size limit, no Resend raw URL).

---

## OpenAPI spec structure

Файл: `src/openapi/spec.ts` — exported `openApiSpec`.

### Meta

```typescript
openapi: "3.0.3"
info: { title: "MailAgent API", version: "0.2.1" }
servers: [
  { url: "https://api.webmailagent.com" },
  { url: "http://127.0.0.1:8787" },
]
security: bearerAuth (HTTP Bearer) on /v1/*
```

### Tags

`meta`, `inboxes`, `webhooks`, `health`, `domains`, …

### Major paths (serialization-relevant)

Inbox lifecycle: `POST /v1/inboxes`, `POST /v1/inboxes/open`, `GET|DELETE /v1/inboxes/{id}`.

Read verification: `GET …/messages`, `GET …/extract`, `GET …/wait`, `GET …/events` (SSE), `GET …/diagnose`.

Structured: `GET …/extract/presets`, `POST …/messages/{messageId}/extract`, `GET …/messages/{messageId}/raw`.

Webhook (no OTP in body): `POST /webhooks/resend` → `{ ok, queued }`.

Discovery: `GET /v1`, `GET /v1/openapi.json`, `GET /health`.

### components.schemas hierarchy

`Error` · `InboxCreate` / `InboxOpen` · `Inbox` · `Message` · `Verification` · `CallbackDelivery` · `Domain` · `Attachment`

### Error response refs

```typescript
Unauthorized: { error: string }
NotFound: { error: string }
RateLimited: { error, limitPerMinute, retryAfterSeconds }
```

### Drift note

OpenAPI `preset` enum on extract may list subset (`2fa`, `invoice`, `receipt`); code supports also `magic_link`, `invite`. Trust `listExtractPresets()` at runtime over static enum if mismatch.

---

## Input validation

### callback-url (HTTPS)

```typescript
export function parseCallbackUrl(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  const url = raw.trim();
  if (url.length > 2048) return null;
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return null;
    const host = u.hostname.toLowerCase();
    if (
      host === "localhost" ||
      host.endsWith(".local") ||
      host.startsWith("127.") ||
      host.startsWith("10.") ||
      host.startsWith("192.168.")
    ) return null;
    return u.toString();
  } catch { return null; }
}
```

Usage in `inboxOptionsFromBody`:

```typescript
const callbackUrl = parseCallbackUrl(body.callbackUrl);
// callbackInvalid: Boolean(body.callbackUrl && !callbackUrl)
// → rejectInvalidCallback → { error: "invalid_callback_url" } 400
```

MCP: `callbackUrl: z.string().url().optional()` — Zod accepts http; **server** still enforces HTTPS via REST.

### sender-allowlist

```typescript
export function normalizeAllowedSenders(input: string | string[] | undefined): string[] {
  // trim, lowercase
  // full email → as-is
  // bare domain → prefix @
  // dedupe
}

export function isSenderAllowed(from: string, allowedSenders: string[] | null | undefined): boolean {
  if (!allowedSenders?.length) return true;  // empty = any sender
  // parse <email> from From header
  // exact email match OR hostMatchesDomain (subdomains OK)
}
```

**Create inbox:** `resolveExpectFrom(service, expectFrom)` merges preset + explicit.

**Inbound drop:** `processInboundEmail` returns early if `!isSenderAllowed` — message **не** попадает в DB (silent drop, no error to sender).

### validate-run-id

```typescript
const RUN_ID_RE = /^[a-zA-Z0-9._-]{1,128}$/;

export function validateRunId(runId: string): boolean {
  return RUN_ID_RE.test(runId.trim());
}
```

Used: `POST /v1/agent/verify`, run session GET/PATCH, MCP `mailagent_get_run_session`.

Invalid runId → `{ error: "invalid_run_id" }` (routes/agent.ts).

Label convention: `agent-{runId}` or `agent-{runId}:{label}` (MCP create_inbox).

### service-presets

Three maps in `lib/service-presets.ts`:

| Export | Purpose |
|--------|---------|
| `SERVICE_EXPECT_FROM` | Domain/email allowlist per service |
| `SERVICE_SUBJECT_HINTS` | Default `subjectContains` for wait |
| `SERVICE_TTL_MINUTES` | Default inbox TTL if not explicit |

Helpers:

```typescript
resolveExpectFrom(service?, extra?) → string[] | undefined
resolveSubjectHint(service?) → string | undefined
resolveTtlMinutes(service?, explicit?) → number | undefined
```

Example:

```typescript
SERVICE_EXPECT_FROM.dribbble = ["dribbble.com", "m.dribbble.com"];
SERVICE_SUBJECT_HINTS.dribbble = "confirm";
```

**25 services** in `SERVICE_NAMES` (MCP enum) — see file for full list.

### REST create body flow

```
POST /v1/inboxes
  body: InboxCreate
    → inboxOptionsFromBody()
    → rejectInvalidCallback()
    → createInbox({ ttlMinutes, expectFrom, allowedSenders, label, callbackUrl, ... })
```

OpenAPI-doc fields not validated in parseCallbackUrl: `ttlMinutes` clamped at MCP (5–1440); REST uses server defaults.

---

## Structured extract

### Presets (rules-only path)

| Preset | Key fields |
|--------|------------|
| `2fa` | otp, links, primaryLink, from, subject, messageId, hasRaw? |
| `magic_link` | primaryLink, links, from, subject, messageId |
| `invite` | inviteUrl, inviter, workspace, role |
| `invoice` | invoiceNumber, amount, currency, dueDate, vendor |
| `receipt` | orderId, total, currency, merchant, purchaseDate |

Regex presets use `messageBodyText(row)` — subject + from + text/html previews, tags stripped.

### Workers AI path

Requires `env.AI` binding.

```typescript
const model = env.EXTRACT_MODEL?.trim() || "@cf/meta/llama-3.1-8b-instruct";
```

Prompt: extract JSON keys from custom schema; max 10k chars email; max 800 tokens response.

Errors:

| error | HTTP |
|-------|------|
| `preset_or_schema_required` | 400 |
| `unknown_preset` | 400 |
| `ai_required_for_custom_schema` | 501 |
| `ai_extract_failed` | 502 |

### Extractor modes

| Condition | extractor |
|-----------|-----------|
| preset only, no AI or no custom schema | `rules` |
| custom schema only + AI | `ai` |
| preset + custom schema + AI | `hybrid` (merge) |

### API

```bash
GET  /v1/inboxes/:id/extract/presets
POST /v1/inboxes/:id/messages/:messageId/extract
     { "preset": "invoice" }
     { "schema": { "properties": { "poNumber": { "type": "string" } } } }
```

MCP: `mailagent_extract_structured` (remote) — args: `inboxId`, `messageId`, `preset?`, `schema?`.

---

## MCP Zod schemas

Файл: `mcp/src/index.ts` — `@modelcontextprotocol/sdk` + `zod`.

### Shared patterns

```typescript
const senderSchema = z.union([z.string(), z.array(z.string())]).optional();

// SERVICE_NAMES from ./service-presets.js — enum for service field
```

### Per-tool validation summary

**Inbox/create/wait:** `create_inbox`, `verify_signup`, `wait_and_extract` — ttl 5–1440, `service` enum, sender union, `callbackUrl.url()`, timeout 5–120.

**Read:** `list_inboxes` (limit 1–50), `wait_for_message`, `list_messages`, `extract_verification`, `get_inbox`, `diagnose_inbox` (messageIndex ≥ 0).

**Write/simulate:** `simulate_message` (optional otp/from/subject/thread headers), `send_message` (to + subject), `delete_inbox`.

**Raw/session:** `get_raw_message` (includeBody), `get_run_session` / `patch_run_session` (runId + merge records).

### Output format

All tools return `toolText(data)` → pretty JSON string in MCP content.

Errors from REST propagate as JSON `{ error: "…", hint?: "…" }` — not Zod throws (client-side validation happens before HTTP).

### Remote MCP (handlers.ts)

Uses manifest JSON Schema from `src/mcp/manifest.ts` — no Zod. Same business validation on server (scope, allowlist, etc.).

---

## JSON fields in DB

### links_json

```sql
-- migrations/001_init.sql
links_json JSONB NOT NULL DEFAULT '[]'::jsonb
```

**Write path** (`insertMessage`):

```typescript
${JSON.stringify(input.links)}  // string[] max 5
```

**Read path:** Postgres driver may return array or string — always through `parseLinks()`.

**Search:** `message_search` index includes otp and text; links searchable via keyword mode.

### scope in api_keys

```sql
-- migrations/008_api_key_scopes.sql
ALTER TABLE api_keys
  ADD COLUMN scope_label_prefix TEXT,
  ADD COLUMN scope_read_only BOOLEAN NOT NULL DEFAULT false;
```

**Not JSON** — relational columns. Loaded via `scopeFromDb()`:

```typescript
{
  labelPrefix: row.scope_label_prefix?.trim().slice(0, 64) || null,
  readOnly: Boolean(row.scope_read_only),
}
```

**Effects on serialization:**

- Read-only key: write endpoints → `{ error: "scope_read_only" }`
- Label prefix: create requires label matching prefix; list filtered; inaccessible inbox → `inbox_not_found` (not 403 leak)

JWT MCP embeds scope: `slp` (label prefix), `sro` (read-only) in `lib/mcp-jwt.ts`.

### Other JSONB columns (related)

| Table | Column | Content |
|-------|--------|---------|
| `messages` | `to_addrs` | outbound recipients JSON array |
| `inboxes` | `allowed_senders` | TEXT[] (Postgres array, not JSONB) |

---

## Error response format

### Hono standard

Most routes:

```typescript
return c.json({ error: "inbox_not_found" }, 404);
```

OpenAPI `Error` schema: single `error` string (snake_case code).

### Extended errors (examples)

Quota/rate: `{ error: "rate_limit_exceeded", limitPerMinute, retryAfterSeconds }`, `{ error: "inbox_limit_reached", plan, active, max }`.

Validation: `{ error: "invalid_callback_url" }`, `{ error: "domain_not_verified", hint }`, `{ error: "scope_read_only" }`, `{ error: "label_prefix_mismatch", hint }`.

Wait 408: `{ error: "timeout", inboxId, messageCount, subjects[], hint }`.

Extract: `{ error: "ai_required_for_custom_schema" }` (501), `{ error: "ai_extract_failed" }` (502).

### Webhook errors

```typescript
{ error: "invalid_signature" }  // 401
{ ok: true, skipped: event.type }  // non email.received
{ ok: true, queued: true }
```

### MCP error surfacing

`textResult({ error: "…" }, isError?: true)` — still JSON in text content; Cursor shows as tool result.

### Agent parsing guideline

1. Parse JSON from MCP text content
2. If `error` key present → branch on code
3. If `verification` present → use before re-extracting
4. HTTP: check status + `error` body

---

## Troubleshooting empty OTP / wrong format

### Decision tree

```
wait/verify timeout?
├─ messageCount = 0 → webhook, address typo, allowlist drop, expired inbox
├─ messages exist, timeout → subjectContains too strict; try messageIndex=1
└─ message arrived
    ├─ otp null, primaryLink set → magic link flow (not bug)
    ├─ otp null, links empty → HTML-only / image OTP / extract miss
    │   ├─ GET …/raw or mailagent_get_raw_message
    │   ├─ POST …/extract preset 2fa
    │   └─ POST …/extract custom schema + AI
    └─ otp wrong → multiple codes; wrong messageIndex; regex order picked first match
```

### Commands

```bash
curl -s -H "Authorization: Bearer $MAILAGENT_API_KEY" \
  "https://api.webmailagent.com/v1/inboxes/$INBOX_ID/diagnose?subjectContains=verify" | jq .
curl -s -H "Authorization: Bearer $MAILAGENT_API_KEY" \
  "https://api.webmailagent.com/v1/inboxes/$INBOX_ID/extract" | jq .
curl -s -X POST -H "Authorization: Bearer $MAILAGENT_API_KEY" -H "Content-Type: application/json" \
  -d '{"preset":"2fa"}' \
  "https://api.webmailagent.com/v1/inboxes/$INBOX_ID/messages/$MSG_ID/extract" | jq .
```

### MCP tools for debug

| Tool | When |
|------|------|
| `mailagent_diagnose_inbox` | First stop on failure |
| `mailagent_list_messages` | See all otp values |
| `mailagent_get_raw_message` | includeBody for HTML source |
| `mailagent_extract_structured` | AI/rules preset |
| `mailagent_simulate_message` | Repro extract pipeline |

### Common root causes

| Root cause | Fix |
|------------|-----|
| Allowlist rejected sender | Match `service` preset or add `expectFrom` |
| Welcome email before verify | `messageIndex=1` |
| OTP in attached PDF | attachment extract not automatic — download attachment |
| Unicode homoglyph digits | Rare; raw body + manual |
| Queue backlog | Check worker logs / DLQ; webhook returns queued but consumer slow |
| Stale read before ingest done | Wait for SSE/messageCount increment |
| Using extract before message | `mailagent_wait_for_message` first |

### Contract test verification

After changing extract or verification shape:

```bash
npm run test:contract:qa          # simulate + extract contracts
npm run test:contract:qa:agent    # if agent.ts / MCP hub changed
npm run doctor:qa                 # on failure
```

### Wrong format (client-side)

| Mistake | Correct |
|---------|---------|
| Expect numeric otp in XML | JSON only; otp is string or null |
| Parse email HTML in agent | Use pre-parsed `verification.otp` |
| Use http callbackUrl | HTTPS only |
| Assume links include unsubscribe | Filtered by LINK_NOISE |
| Read webhook body for OTP | Webhook has no body — poll extract/wait |

---

*Последняя синхронизация с кодом: extract.ts, message-verify.ts, structured-extract.ts, openapi/spec.ts, mcp/src/index.ts, resend-mail.ts, lib/callback-url.ts, lib/sender-allowlist.ts, lib/validate-run-id.ts, lib/service-presets.ts.*
