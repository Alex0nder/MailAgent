# Product Core — MailAgent

Описание пользовательских сценариев и flows на основе README, docs/QA.md, AGENTS.md, skills/mailagent/SKILL.md.

## Основные пользовательские сценарии

| # | Сценарий | Entry point | Результат |
|---|----------|-------------|-----------|
| 1 | One-shot verify | `POST /v1/inboxes/open` | OTP/link + auto-delete |
| 2 | Step-by-step QA | `POST /v1/inboxes` → form → `GET …/wait` | verification object |
| 3 | Agent MCP verify | `mailagent_verify_signup` | `agent.primaryAction` |
| 4 | CI без SMTP | `POST …/simulate` | injected OTP email |
| 5 | Debug failed wait | `GET …/diagnose` или `mailagent_diagnose_inbox` | hints, subjects, debugUiUrl |
| 6 | Callback to CI | `callbackUrl` on create | webhook on message |
| 7 | Custom domain inbox | `POST /v1/domains` → verify → create with `domainId` | `@mail.example.com` |
| 8 | Outbound reply | `POST …/send`, `mailagent_send_message` | thread reply via Resend |
| 9 | Multi-step agent run | `mailagent_get_run_session` / `patch_run_session` | persisted state by `runId` |
| 10 | Console/dashboard | `public/dashboard.html` + `/v1/console/*` | human debug UI |

---

## Inbox Flow

```
Client (REST/MCP)
    │
    ▼
POST /v1/inboxes  ──► createInbox() ──► Neon INSERT inboxes
    │                      │
    │                      ├─ address: inbox-{nanoid}@{INBOX_DOMAIN}
    │                      ├─ или {username}@{verified-domain}
    │                      ├─ ttlMinutes (default from DEFAULT_TTL_MINUTES=30)
    │                      ├─ allowed_senders from expectFrom/service
    │                      ├─ label, callback_url (QA)
    │                      └─ api_key_hint, team_id
    ▼
Returns: { id, address, expiresAt, allowedSenders, label, callbackUrl }

Read:
  GET /v1/inboxes/:id
  GET /v1/inboxes?label=…&labelPrefix=…
  GET /v1/inboxes/:id/messages

Wait:
  GET /v1/inboxes/:id/events   (SSE via Durable Object)
  GET /v1/inboxes/:id/wait     (server poll 500ms)

Delete:
  DELETE /v1/inboxes/:id
  DELETE /v1/inboxes?labelPrefix=…  (bulk QA cleanup)

Expiry:
  Cron hourly → purgeExpired() deletes expired inboxes + R2 attachments
```

**Quota:** plan limits on active inboxes (`429 inbox_limit_reached`).

**Scoped keys:** `labelPrefix` enforced on create; `readOnly` blocks write.

---

## Email Flow

```
Resend inbound
    │
    ▼
POST /webhooks/resend  (или /webhooks/resend/team/:teamId)
    │ verify svix signature
    │ enqueue EmailQueueMessage
    ▼
Cloudflare Queue (mailagent-email)
    │ max_retries: 5 → DLQ mailagent-email-dlq
    ▼
processInboundEmail() in queue consumer
    │ findInboxByAddress(to)
    │ isSenderAllowed(from, allowed_senders) — drop if not allowed
    │ resend.emails.receiving.get(emailId)
    │ extractOtp + extractLinks
    │ insertMessage (provider_id UNIQUE = idempotency)
    │ store raw MIME → R2 (optional)
    │ save attachments
    │ indexMessageSearch (Workers AI embeddings)
    │ fireInboxCallback(callback_url) if set
    ▼
notifyInbox → Durable Object INBOX_WAIT /notify
    │
    ▼
SSE subscribers on GET …/events receive event: message
```

**Simulate path (QA/dev):** `POST /v1/inboxes/:id/simulate` — inject without SMTP, provider_id `sim_*`.

---

## OTP Flow

```
Email body (text + html combined)
    │
    ▼
extractOtp() — src/services/extract.ts
    │ regex patterns (code, verification, 4-8 digits)
    │ parse-otp-message library fallback
    ▼
Stored in messages.otp at ingest (NOT in webhook hot path)

Read paths:
  GET /v1/inboxes/:id/extract          → latest message verification
  GET /v1/inboxes/:id/messages         → per-message otp
  POST /v1/inboxes/open                → wait + verification
  mailagent_extract_verification
  mailagent_verify_signup              → agent.primaryAction

Links:
  extractLinks() → links_json, primaryLink (verify/confirm URLs ranked)
```

**Troubleshooting (docs/QA-TROUBLESHOOTING.md):**
- 0 messages → webhook, domain, allowlist
- messages but timeout → subjectContains, messageIndex (welcome vs verify)
- message but empty OTP → raw MIME, HTML-only, links[]

---

## QA Flow

```
CI env: MAILAGENT_API_URL + MAILAGENT_API_KEY + RUN_ID

Option A — one-shot:
  POST /v1/inboxes/open { label: "ci-$RUN_ID", service, timeoutSeconds }

Option B — Playwright @mailagent/qa:
  createInbox → fill form → waitForVerification → deleteInbox

Option C — simulate only (no real email):
  POST /v1/inboxes → POST …/simulate { otp, from, subject }
  Contract tests: npm run test:contract:qa

Option D — callback:
  create with callbackUrl → message triggers POST to CI runner
  Debug: GET …/callbacks

Cleanup:
  DELETE /v1/inboxes?labelPrefix=ci-$RUN_ID
```

Presets: `dribbble`, `github`, `google`, `auth0`, `stripe`, `vercel`, `supabase`, `clerk`, `discord`, `openai`, `resend`, `firebase` (src/lib/service-presets.ts).

---

## AI Agent Flow

```
Discovery:
  GET /v1/agent  → mcpTools, auth.oidc, remoteMcp, docs

Typical MCP flow:
  1. mailagent_create_inbox { service, label/runId }
  2. [agent fills signup form with address]
  3. mailagent_wait_for_message { inboxId, subjectContains, messageIndex }
     OR mailagent_verify_signup (preferred)
  4. mailagent_extract_verification (if needed)
  5. mailagent_delete_inbox

One-shot:
  mailagent_wait_and_extract
  POST /v1/agent/verify

Remote MCP:
  POST https://api.webmailagent.com/mcp (JSON-RPC)
  Auth: Bearer API key or OAuth mat_ JWT

Run session (multi-step):
  label agent-{runId}
  GET/PATCH /v1/agent/runs/:runId/session
  mailagent_get_run_session / mailagent_patch_run_session

On failure:
  mailagent_diagnose_inbox
  POST …/simulate then retry
```

**Clients:** Cursor (`.cursor/mcp.json`), Codex (`codex mcp add`), npx `@mailagent/mcp`, Agent Skills (`npx skills add`).
