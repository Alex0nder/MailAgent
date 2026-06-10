# Email Core

Специализированное ядро: путь inbound/outbound email через Resend.

## Как проходят email messages

### Inbound (production)

```
Sender → Resend MX (INBOX_DOMAIN)
    → Resend stores email
    → Webhook POST /webhooks/resend (event: email.received)
    → Verify svix signature (RESEND_WEBHOOK_SECRET)
    → MAIL_QUEUE.send({ provider, emailId, from, to, subject, receivedAt })
    → 200 { ok: true, queued: true }  [fast response]

Queue consumer:
    → findInboxByAddress(to[])
    → isSenderAllowed(from, inbox.allowed_senders) — STOP if false
    → resend.emails.receiving.get(emailId)
    → extractOtp + extractLinks from text/html
    → insertMessage (provider_id UNIQUE — idempotency)
    → storeRawMimeFromUrl → R2 (if download URL present)
    → saveAttachmentsFromEmail
    → resolveInboundThread (thread_id, in_reply_to)
    → indexMessageSearch (embeddings)
    → fireInboxCallback if callback_url set
    → notifyInbox → INBOX_WAIT DO SSE broadcast
```

**Enterprise path:** `POST /webhooks/resend/team/:teamId` with team-specific secret + API key.

### Simulated (QA/dev)

```
POST /v1/inboxes/:id/simulate
    → simulateInboundMessage()
    → provider_id prefix sim_*
    → same extract + notify path (no Resend fetch)
```

MCP: `mailagent_simulate_message`.

### Outbound

```
POST /v1/inboxes/:id/send
POST /v1/inboxes/:id/messages/:messageId/reply
    → outbound-mail.ts → Resend send API
    → OUTBOUND_FROM env or inbox address
    → Enterprise: team dedicated Resend for custom-domain inboxes
```

MCP: `mailagent_send_message`.

## Как обрабатываются сообщения

| Stage | Where | What |
|-------|-------|------|
| Webhook | `src/routes/webhooks.ts` | Verify, enqueue only |
| Queue | `src/queue/consumer.ts` | Batch ack/retry |
| Ingest | `src/services/resend-mail.ts` | Fetch, filter, extract, store |
| Extract | `src/services/extract.ts` | OTP + links |
| Verify format | `src/services/message-verify.ts` | `verification` object |
| Raw MIME | `src/services/raw-mime-r2.ts` | R2 archive |
| Attachments | `src/services/message-attachments.ts` | Metadata + R2 cache |
| Threads | `src/services/thread-resolve.ts` | Conversation grouping |
| Search | `src/services/message-search.ts` | Keyword + semantic |
| Callback | `src/services/callback.ts` | POST to callbackUrl |
| Notify | `src/durable-objects/inbox-wait.ts` | SSE push |

## Endpoints участвующие в email flow

| Endpoint | Role |
|----------|------|
| `POST /webhooks/resend` | Inbound trigger |
| `POST /webhooks/resend/team/:teamId` | Enterprise inbound |
| `POST /v1/inboxes/:id/simulate` | Test inject |
| `POST /v1/inboxes/:id/send` | Outbound |
| `POST /v1/inboxes/:id/messages/:messageId/reply` | Thread reply |
| `GET /v1/inboxes/:id/messages` | List |
| `GET /v1/inboxes/:id/messages/:messageId/raw` | Raw MIME |
| `GET /v1/inboxes/:id/messages/:messageId/attachments` | Attachments |
| `GET /v1/inboxes/:id/events` | Real-time notify |
| `GET /v1/inboxes/:id/callbacks` | Callback delivery log |

## Reliability (README)

- Webhook responds after queue send (not after DB write).
- Idempotency: `messages.provider_id` UNIQUE.
- Queue retry up to 5 → DLQ `mailagent-email-dlq`.
- OTP/links extracted in queue, not webhook.

## Troubleshooting «письма не приходят»

1. Resend webhook events (dashboard).
2. `INBOX_DOMAIN` matches address suffix.
3. `allowed_senders` / `service` preset — wrong From dropped silently.
4. Queue/DLQ in Cloudflare dashboard.
5. `GET …/diagnose` or `mailagent_diagnose_inbox`.

**Doc:** docs/QA-TROUBLESHOOTING.md
