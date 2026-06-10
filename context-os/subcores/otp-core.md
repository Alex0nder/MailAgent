# OTP Core

Специализированное ядро: извлечение и доставка OTP / magic links.

## Как работает получение OTP

### Extraction (at ingest)

**File:** `src/services/extract.ts`

1. Combine `text + html` from Resend receiving API.
2. `extractOtp(combined)`:
   - Regex: `code:`, `verification:`, `one-time password:`, `\b\d{6}\b`, `\b\d{4}\b`
   - Skip 4-digit years starting with `20`
   - Fallback: `parse-otp-message` npm package
3. `extractLinks(combined)`:
   - URL regex, dedupe, filter noise (unsubscribe, privacy, trk.)
   - Rank verify-like URLs higher (`LINK_VERIFY` pattern)
   - Max 5 links
4. `primaryLink(links)` → best magic link

**Stored:** `messages.otp`, `messages.links_json` at `insertMessage()` in queue consumer.

**NOT extracted in webhook** — only in queue processing (reliability).

### Read API

| Endpoint | Returns |
|----------|---------|
| `GET /v1/inboxes/:id/extract` | Latest message `verification` |
| `GET /v1/inboxes/:id/messages` | Per-message `otp`, `primaryLink` |
| `POST /v1/inboxes/open` | Wait + `verification` |
| `POST /v1/agent/verify` | Agent-oriented verify |

**Verification object** (`src/services/message-verify.ts`):
- `otp`, `links`, `primaryLink`, `from`, `subject`, `messageId`, `hasRaw`, `rawUrl`

### MCP tools

| Tool | Purpose |
|------|---------|
| `mailagent_extract_verification` | OTP + links from latest |
| `mailagent_verify_signup` | **Preferred** — wait + `agent.primaryAction` |
| `mailagent_wait_and_extract` | One-shot create/wait/extract/delete |
| `mailagent_extract_structured` | AI preset (2fa, invoice, receipt) |

### Wait before extract

Must receive message first:
- `mailagent_wait_for_message` — poll server-side
- SSE via MCP client (`mcp/src/sse.ts`)
- `GET …/wait` or `…/events`

**Filters:**
- `subjectContains` — case-insensitive substring
- `messageIndex` — 0=newest match, 1=second (welcome email case)

## Simulate OTP (testing)

```bash
POST /v1/inboxes/:id/simulate
{ "otp": "123456", "from": "noreply@auth0.com", "subject": "Verify" }
```

Contract tests use simulate — no real SMTP.

## Где искать ошибки OTP

### Symptom: timeout, no OTP

| Check | Command / action |
|-------|------------------|
| Zero messages | `GET …/messages` — webhook, domain, allowlist |
| Messages but timeout | Relax `subjectContains`; try `messageIndex=1` |
| Message exists, otp null | `GET …/messages/:id/raw`; check HTML-only |
| Magic link only | Use `primaryLink` or `links[]` |
| Wrong service preset | Match `service` to actual From domain |

### Symptom: wrong OTP

- Multiple codes in email — extract takes first regex match
- `messageIndex` — may be reading welcome email not verify email

### Debug tools

```bash
GET /v1/inboxes/:id/diagnose?subjectContains=…&messageIndex=…
mailagent_diagnose_inbox
GET /v1/inboxes/:id/callbacks   # if using callbackUrl
curl /v1/me                     # quota/rate limit
```

**Doc:** docs/QA-TROUBLESHOOTING.md (decision tree sections 1–3).

### Structured extract fallback

If regex fails: `POST …/messages/:id/extract` with preset `2fa` (Workers AI `EXTRACT_MODEL`).

## Dependencies

- `parse-otp-message` package
- Resend `emails.receiving.get` must return text/html
- Queue must process successfully (check DLQ)
