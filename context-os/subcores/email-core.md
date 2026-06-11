# Email Core — MailAgent

Специализированное ядро Context OS: **путь inbound/outbound email** через Resend — webhook, queue, ingest, simulate, send/reply, attachments, raw MIME, threads, callbacks, DLQ.

**Когда грузить:** «письма не приходят», webhook/queue, simulate для QA, outbound send, enterprise dedicated Resend, attachments/raw, DLQ, `processInboundEmail` stages.

**Связанные subcores:** `inbox-core` (container + wait), `otp-core` (extract), `serialization-core` (verification JSON), `worker-core` (queue consumer), `auth-billing-core` (dedicated Resend).

---

## Purpose

MailAgent не является полноценным почтовым клиентом. Email core описывает **транспорт и ingest**: как письмо попадает от Resend MX в Postgres + R2, как извлекаются OTP/links, как уведомляются waiters и callbacks, как отправляется outbound.

Четыре группы ответственности:

### 1. Inbound production path

Resend webhook → verify svix → enqueue → queue consumer → `processInboundEmail` → DB + R2 + notify.

### 2. Simulated path (QA/dev)

`POST /v1/inboxes/:id/simulate` — inject без SMTP, `provider_id` prefix `sim_*`, тот же notify/callback path.

### 3. Outbound path

`POST …/send`, `POST …/messages/:id/reply` → Resend send API → `insertMessage` direction=outbound.

### 4. Reliability & enterprise

Idempotency `provider_id` UNIQUE, queue retry 5× → DLQ, enterprise per-team webhook `POST /webhooks/resend/team/:teamId`.

---

## Entities

### EmailQueueMessage

Файл: `src/env.ts`

```typescript
interface EmailQueueMessage {
  provider: "resend";
  emailId: string;       // Resend receiving email_id
  from: string;
  to: string[];
  subject: string;
  receivedAt: string;
  resendTeamId?: string; // enterprise dedicated Resend
}
```

### MessageNotifyPayload

```typescript
interface MessageNotifyPayload {
  id: string;
  inboxId: string;
  from: string;
  subject: string;
  otp: string | null;
  links: string[];
  primaryLink: string | null;
  receivedAt: string;
  verification?: MessageVerification;
}
```

### MessageRow (persisted)

См. `inbox-core` / `data-model-core`. Email core добавляет: `raw_r2_key`, `direction`, `thread_id`, `in_reply_to`, `rfc_message_id`, `to_addrs`.

### Attachment metadata

Таблица `message_attachments` — `id`, `message_id`, `provider_id`, `filename`, `content_type`, `size_bytes`, optional R2 cache key.

### Callback delivery

Таблица `callback_deliveries` — лог POST на `inboxes.callback_url`.

### ThreadSummary

```typescript
type ThreadSummary = {
  threadId: string;
  subject: string;
  messageCount: number;
  lastMessageAt: string;
  lastDirection: "inbound" | "outbound";
  participants: string[];
};
```

---

## Decision history

| # | Решение | Дата/фаза | Статус |
|---|---------|-----------|--------|
| E1 | Webhook только enqueue, не ingest | reliability | active |
| E2 | OTP/links extract в queue, не webhook | reliability | active |
| E3 | `provider_id` UNIQUE idempotency | 001 | active |
| E4 | Sender allowlist silent drop | security | active |
| E5 | Raw MIME в R2, не Postgres | 009 | active |
| E6 | Simulate `sim_*` provider_id | QA | active |
| E7 | Simulate bypasses allowlist at route | QA | active |
| E8 | Outbound AgentMail parity | 011 | active |
| E9 | Dedicated Resend per enterprise team | 016 | active |
| E10 | Team event webhook separate from callback | 017 | active |
| E11 | Queue max_retries=5 → DLQ | wrangler | active |
| E12 | Semantic search index at ingest | message-search | active |
| E13 | Attachments metadata + R2 cache | attachments | active |

### Narrative decisions

**E1 — Fast webhook 200.** Resend ожидает быстрый ответ. Worker verify signature, `MAIL_QUEUE.send(job)`, return `{ ok: true, queued: true }`. Тяжёлый `receiving.get` + extract + R2 — в consumer.

**E2 — Extract в queue.** Если extract в webhook, timeout webhook → Resend retry storm. Один extract при `insertMessage`, read-path читает stored `otp`/`links_json`.

**E4 — Silent allowlist drop.** `isSenderAllowed(from, inbox.allowed_senders)` false → `processInboundEmail` returns early без error. С точки зрения отправителя письмо «принято» Resend, но в MailAgent не появится. Частая причина «письмо не пришло».

**E6 — Simulate path.** Contract tests и `npm run test:contract:qa` используют simulate — не нужен real SMTP, не нужен `DATABASE_URL` в consumer-only tests. `simulateInboundMessage` вызывает тот же notify DO + optional callback.

**E9 — Enterprise dedicated Resend.** `job.resendTeamId` → `createResendClientForTeam` для `receiving.get`. Webhook: `POST /webhooks/resend/team/:teamId` с team-specific svix secret.

---

## Sources

| Модуль | Роль |
|--------|------|
| `src/routes/webhooks.ts` | Resend + Stripe webhooks |
| `src/queue/consumer.ts` | Batch process, notify DO |
| `src/services/resend-mail.ts` | `processInboundEmail` |
| `src/services/simulate-inbound.ts` | QA inject |
| `src/services/outbound-mail.ts` | send/reply, threads |
| `src/services/extract.ts` | OTP + links at ingest |
| `src/services/message-verify.ts` | verification object |
| `src/services/raw-mime-r2.ts` | .eml archive |
| `src/services/message-attachments.ts` | list/get attachments |
| `src/services/thread-resolve.ts` | threading |
| `src/services/message-search.ts` | index + search |
| `src/services/callback.ts` | fireInboxCallback |
| `src/services/team-event-webhook.ts` | team-wide POST |
| `src/routes/inboxes.ts` | REST email endpoints |
| `wrangler.jsonc` | MAIL_QUEUE, DLQ config |

---

## Inbound pipeline (overview)

```
Sender SMTP
    → Resend MX (INBOX_DOMAIN or team domain)
    → Resend stores email
    → POST /webhooks/resend  (or /webhooks/resend/team/:teamId)
    → svix verify (RESEND_WEBHOOK_SECRET or team secret)
    → event.type === "email.received" else skip
    → MAIL_QUEUE.send(EmailQueueMessage)
    → 200 { ok: true, queued: true }

Queue consumer (handleQueueBatch):
    → processInboundEmail(env, job, notifyInbox)
    → on success: msg.ack()
    → on throw: msg.retry() (max 5)
    → exhausted → mailagent-email-dlq
```

---

## processInboundEmail — stages (resend-mail.ts)

Файл: `src/services/resend-mail.ts` — **источник правды** для production ingest.

### Stage 0: Resend client selection

```typescript
const resend = job.resendTeamId
  ? await createResendClientForTeam(env, job.resendTeamId)
  : createResendClient(env);
```

### Stage 1: Resolve inbox

```typescript
for (const rawTo of job.to) {
  inbox = await findInboxByAddress(env, rawTo);
  if (inbox) break;
}
if (!inbox) return;  // no matching active inbox
```

Проверки: address lowercase match, `expires_at > NOW()`.

### Stage 2: Sender allowlist

```typescript
if (!isSenderAllowed(job.from, inbox.allowed_senders)) return;
```

`allowed_senders` empty → allow all. Иначе email или `@domain` match (`sender-allowlist.ts`).

### Stage 3: Fetch body from Resend

```typescript
const { data: email, error } = await resend.emails.receiving.get(job.emailId);
if (error || !email) throw new Error(...);  // triggers queue retry
```

### Stage 4: Extract OTP + links

```typescript
const combined = `${email.text ?? ""}\n${email.html ?? ""}`;
const otp = extractOtp(combined);
const links = extractLinks(combined);
```

Детали regex — `otp-core`, `extract.ts`.

### Stage 5: Raw MIME → R2

```typescript
const rawDownload = email.raw?.download_url;
if (rawDownload?.startsWith("http")) {
  rawR2Key = await storeRawMimeFromUrl(env, inbox.id, messageId, rawDownload);
}
```

### Stage 6: Thread resolution

```typescript
const inboundHeaders = readInboundHeaders(email);
const resolved = await resolveInboundThread(env, {
  inboxId, subject, inReplyTo, references, headers
}, messageId);
const rfcMessageId = normalizeMessageId(...);
```

### Stage 7: insertMessage (idempotent)

```typescript
const row = await insertMessage(env, {
  id: messageId,           // nanoid(16)
  inboxId: inbox.id,
  providerId: job.emailId, // UNIQUE — duplicate → null, early return
  from, subject,
  textPreview: buildPreviewText(text),
  htmlPreview: buildPreviewText(html, 4000),
  otp, links, rawR2Key,
  threadId: resolved.threadId,
  inReplyTo: resolved.inReplyToMessageId,
  rfcMessageId,
});
if (!row) return;
```

### Stage 8: Search index

```typescript
await indexMessageSearch(env, row);
```

Keyword + optional semantic embeddings (`message-search.ts`).

### Stage 9: Attachments

```typescript
await saveAttachmentsFromEmail(env, inbox.id, row.id, job.emailId, email);
```

Metadata в Postgres; bytes в R2 при наличии download URL.

### Stage 10: Notify waiters (SSE)

```typescript
const payload = toNotifyPayload(row, inbox.id);
await notify(inbox, payload);  // → INBOX_WAIT DO POST /notify
```

`toNotifyPayload` включает nested `verification` через `formatMessageVerification`.

### Stage 11: Inbox callback

```typescript
if (inbox.callback_url) {
  await fireInboxCallback(env, {
    inboxId, messageId: row.id,
    callbackUrl: inbox.callback_url,
    payload: { ...payload, address, label },
  });
}
```

### Stage 12: Team event webhook

```typescript
await fireTeamEventForMessage(env, { inbox, messageId: row.id, payload });
```

`teams.event_webhook_url` — POST для всех inboxes команды (migration 017). Отдельно от per-inbox `callbackUrl`.

---

## Webhook endpoints

| Method | Path | Auth | Action |
|--------|------|------|--------|
| POST | `/webhooks/resend` | svix + `RESEND_WEBHOOK_SECRET` | Enqueue shared Resend |
| POST | `/webhooks/resend/team/:teamId` | team svix secret | Enqueue with `resendTeamId` |
| POST | `/webhooks/stripe` | stripe-signature | Billing (не email) |

### Resend webhook handler

```typescript
// 1. resend.webhooks.verify({ payload, headers, webhookSecret })
// 2. invalid → 401 invalid_signature
// 3. type !== email.received → { ok: true, skipped }
// 4. MAIL_QUEUE.send({ provider, emailId, from, to, subject, receivedAt })
// 5. { ok: true, queued: true }
```

Enterprise: `getTeamWebhookSecret(teamId)` — 404 `dedicated_resend_not_configured` если нет.

---

## Simulate path

### Endpoint

`POST /v1/inboxes/:id/simulate` — write scope required.

### Body

```typescript
{
  scenario?: string;           // otp | magic_link | attachment | invite | invoice_fixture
  otp?: string;
  from?: string;
  subject?: string;
  fireCallback?: boolean;
  attachmentFilename?: string;
  inReplyToMessageId?: string;
  rfcMessageId?: string;
  inReplyTo?: string;
  references?: string;
  headers?: Record<string, string | string[]>;
}
```

### simulateInboundMessage() flow

1. `getInbox` — must exist, not expired
2. `resolveSimulateScenario(scenario)` — fixture defaults
3. Default otp `482910` if not provided
4. `providerId = sim_{nanoid12}`
5. `insertMessage` — **не проверяет allowlist** (в отличие от production ingest)
6. `indexMessageSearch`
7. Optional simulated attachment row
8. `notifyInboxWaiters` → DO
9. Optional `fireInboxCallback` if `fireCallback && inbox.callback_url`
10. `fireTeamEventForMessage`

MCP: `mailagent_simulate_message`.

### Scenarios list

`GET /v1/inboxes/simulate/scenarios` → `listSimulateScenarios()`.

**Doc:** `docs/QA-SIMULATE.md`

---

## Outbound send / reply

### Endpoints

| Method | Path | Body |
|--------|------|------|
| POST | `/v1/inboxes/:id/send` | `to`, `subject`, `text?`, `html?`, `cc?`, `bcc?`, `inReplyToMessageId?` |
| POST | `/v1/inboxes/:id/messages/:messageId/reply` | `to?` (default parent.from), `text?`, `html?`, `subject?` |

MCP: `mailagent_send_message`.

### sendFromInbox() — ключевые шаги

1. `getInbox` + access
2. `resolveOutboundSend` — shared Resend или team dedicated
3. Dedicated requires `inbox.domain_id` — иначе throw `dedicated_outbound_requires_custom_domain_inbox` → 403
4. `resend.emails.send({ from, to, subject, text, html, headers })`
5. Extract otp/links from outbound body (same `extract.ts`)
6. `insertMessage` direction=`outbound`, `to_addrs`
7. `indexMessageSearch`
8. Return `{ messageId, threadId, providerId, from, to, subject }`

### From address resolution

```typescript
// Shared: env.OUTBOUND_FROM || `MailAgent <${inbox.address}>`
// Dedicated: `MailAgent <${inbox.address}>` on custom domain
```

---

## Attachments

### List

`GET /v1/inboxes/:id/messages/:messageId/attachments`

Response: `{ messageId, attachments: [{ id, filename, contentType, sizeBytes, downloadUrl }] }`.

### Download

`GET /v1/inboxes/:id/messages/:messageId/attachments/:attachmentId`

- Default: binary stream
- `Accept: application/json` → metadata + base64 or URL

MCP: `mailagent_list_attachments`, `mailagent_get_attachment`.

### Ingest storage

`saveAttachmentsFromEmail` — fetch from Resend attachment URLs, optional R2 cache, INSERT `message_attachments`.

Simulate: `insertSimulatedAttachment` — metadata only, fake PDF 1KB.

---

## Raw MIME

### Endpoint

`GET /v1/inboxes/:id/messages/:messageId/raw`

- Default: `message/rfc822` stream from R2
- `Accept: application/json` → `{ rawBase64?, downloadUrl?, sizeBytes }`

MCP: `mailagent_get_raw_message`.

### Storage

`storeRawMimeFromUrl` — download Resend `raw.download_url`, put R2, store key in `messages.raw_r2_key`.

Purge: `purgeRawMimeForInboxes` on inbox delete / `purgeExpired`.

---

## Threads

### List threads

`GET /v1/inboxes/:id/threads` → `{ threads: ThreadSummary[] }`

MCP: `mailagent_list_threads`.

### Thread messages

`GET /v1/inboxes/:id/threads/:threadId/messages`

Returns messages with `direction`, `threadId`, `inReplyTo`, `to`.

### Resolution logic

`resolveInboundThread` (`thread-resolve.ts`):
- Match In-Reply-To / References against `findMessageForThreading`
- Fallback: subject normalization (strip Re:/Fwd:)
- New thread: `thread_id = messageId`

---

## Callback fire

### Per-inbox callbackUrl

`fireInboxCallback` (`callback.ts`):

```typescript
POST callbackUrl
{ "event": "message.received", ...MessageNotifyPayload, address, label }
```

Logged in `callback_deliveries`. Non-2xx → `ok: false`, still logged.

### Inspect deliveries

`GET /v1/inboxes/:id/callbacks?limit=20`

### Team event webhook

`fireTeamEventForMessage` — lookup team by `api_key_hint`, POST `teams.event_webhook_url` if set. Same payload shape + team context.

---

## Queue, retry, DLQ

### wrangler.jsonc

```json
{
  "queue": "mailagent-email",
  "max_batch_size": 5,
  "max_batch_timeout": 2,
  "max_retries": 5,
  "dead_letter_queue": "mailagent-email-dlq"
}
```

### Consumer behavior

```typescript
try {
  await processInboundEmail(env, msg.body, notifyInbox);
  msg.ack();
} catch (err) {
  console.error("queue process failed", err);
  msg.retry();
}
```

Failures: `receiving.get` error, R2 upload throw, DB transient. After 5 retries → message in **mailagent-email-dlq**.

### DLQ triage

1. Cloudflare dashboard → Queues → mailagent-email-dlq
2. Typical causes: Resend API down, invalid emailId, R2 binding missing
3. Fix + replay manually or wait for Resend retry (new webhook)

---

## Все endpoints email flow

| Endpoint | Direction | Role |
|----------|-----------|------|
| `POST /webhooks/resend` | inbound trigger | enqueue |
| `POST /webhooks/resend/team/:teamId` | inbound trigger | enterprise enqueue |
| `POST /v1/inboxes/:id/simulate` | test inject | QA ingest |
| `GET /v1/inboxes/simulate/scenarios` | — | fixture list |
| `POST /v1/inboxes/:id/send` | outbound | send |
| `POST /v1/inboxes/:id/messages/:messageId/reply` | outbound | reply |
| `GET /v1/inboxes/:id/messages` | read | list |
| `GET /v1/inboxes/:id/messages/:messageId/raw` | read | raw MIME |
| `GET /v1/inboxes/:id/messages/:messageId/attachments` | read | attachment list |
| `GET /v1/inboxes/:id/messages/:messageId/attachments/:id` | read | attachment bytes |
| `POST /v1/inboxes/:id/messages/:messageId/extract` | read | structured extract |
| `GET /v1/inboxes/:id/extract` | read | latest verification |
| `GET /v1/inboxes/:id/extract/presets` | read | AI preset list |
| `GET /v1/inboxes/:id/events` | notify | SSE |
| `GET /v1/inboxes/:id/wait` | notify | poll wait |
| `GET /v1/inboxes/:id/callbacks` | debug | callback log |
| `GET /v1/inboxes/:id/threads` | read | threads |
| `GET /v1/inboxes/:id/threads/:threadId/messages` | read | thread messages |
| `GET /v1/inboxes/:id/search` | read | keyword/semantic |

---

## MCP tools (email surface)

| Tool | Endpoint equivalent |
|------|---------------------|
| `mailagent_simulate_message` | POST simulate |
| `mailagent_send_message` | POST send |
| `mailagent_list_messages` | GET messages |
| `mailagent_get_raw_message` | GET raw |
| `mailagent_list_attachments` | GET attachments |
| `mailagent_get_attachment` | GET attachment |
| `mailagent_list_threads` | GET threads |
| `mailagent_search_messages` | GET search |
| `mailagent_extract_verification` | GET extract |
| `mailagent_extract_structured` | POST message extract |

---

## Troubleshooting «письма не приходят»

### Decision tree

```
1. Есть ли сообщения в GET …/messages?
   NO → inbound path problem
   YES → wait/filter problem (см. inbox-core, otp-core)

2. Inbound path (messageCount = 0):
   a. Resend dashboard → webhook deliveries → 200?
   b. INBOX_DOMAIN matches suffix адреса inbox?
   c. allowed_senders / service preset — From совпадает?
   d. Inbox expired? (expires_at)
   e. Cloudflare Queues → mailagent-email consumer lag?
   f. DLQ mailagent-email-dlq — failed jobs?
   g. Enterprise: правильный webhook URL team?

3. Message exists but otp null:
   a. GET …/raw — HTML-only code?
   b. structured extract preset 2fa
   c. См. otp-core

4. Callback не сработал:
   a. GET …/callbacks
   b. callbackUrl HTTPS reachable?
   c. simulate с fireCallback: true для изоляции
```

### Quick commands

```bash
# Diagnose inbox
curl -s -H "Authorization: Bearer $MAILAGENT_API_KEY" \
  "https://api.webmailagent.com/v1/inboxes/$INBOX_ID/diagnose" | jq .

# Simulate OTP without SMTP
curl -s -X POST -H "Authorization: Bearer $MAILAGENT_API_KEY" \
  -H "Content-Type: application/json" \
  "https://api.webmailagent.com/v1/inboxes/$INBOX_ID/simulate" \
  -d '{"otp":"123456","from":"noreply@auth0.com","subject":"Verify"}' | jq .

# Contract tests (simulate)
npm run test:contract:qa
```

**Doc:** `docs/QA-TROUBLESHOOTING.md`

---

## Enterprise dedicated Resend

Условия:
- `teams.plan === enterprise` + `dedicated_resend_*_cipher` configured
- Inbound webhook: `https://api…/webhooks/resend/team/{teamId}`
- `EmailQueueMessage.resendTeamId = teamId`
- Outbound: requires custom domain inbox (`domain_id` set)

См. `auth-billing-core` D13, `team-resend.ts`.

---

## Тесты

`resend-mail.ts` / webhooks → `npm run test:contract:qa`; attachments → `test:contract:qa:attachments`; merge → `npm run test:prod`.
