# Developer email relay (notifyEmail)

**Status:** implemented · v0.78 (API + MCP + contract; run migration `018_notify_email.sql`)

## Problem

During manual signup QA the developer wants:

1. **Signup form** — any disposable MailAgent address (`inbox-abc@…`), not their real inbox.
2. **Code delivery** — OTP / magic link summary on **their real email** (`dev@company.com`), like a forward.

Today: API poll, `callbackUrl` (HTTPS webhook), MCP extract — all programmatic. No path for **human reads code in Gmail/Outlook** while the app under test still uses a temp address.

## Solution

Optional `notifyEmail` on inbox create. After inbound ingest + extract, MailAgent sends a **transactional notification** via Resend (`OUTBOUND_FROM`) to that address.

```
App signup form          Service (Auth0, etc.)
      │                           │
      │  address = inbox-xyz@…    │
      └──────────────────────────►│
                                  │ verification email
                                  ▼
                         MailAgent inbound (temp inbox)
                                  │
                    extract OTP + primaryLink
                                  │
              ┌───────────────────┼───────────────────┐
              ▼                   ▼                   ▼
         API / MCP           callbackUrl          notifyEmail
         (agents/CI)         (webhook)         dev@company.com
```

**Not** full MIME forward by default — structured summary reduces abuse surface and spam complaints.

## API (draft)

### Create inbox

```json
POST /v1/inboxes
{
  "label": "manual-auth0-test",
  "service": "auth0",
  "notifyEmail": "dev@company.com",
  "notifyMode": "verification"
}
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `notifyEmail` | string (email) | — | Developer inbox; validated RFC-ish, max 254 |
| `notifyMode` | enum | `verification` | `verification` \| `off` (future: `full_forward`) |

Response `Inbox` includes `notifyEmail` (nullable).

### Notification payload (email body)

Subject: `[MailAgent] {label}: {subject}` or `[MailAgent] OTP for {service}`

Body (text + html):

- Temp address used in signup
- `otp` (if extracted)
- `primaryLink` (if extracted)
- Link to debug UI (`debugUiUrl`)
- Footer: MailAgent, inbox id, expires_at

### Delivery log

`GET /v1/inboxes/:id/notify-deliveries` — mirror `callbacks` (status, Resend id, error).

Table: `notify_deliveries` (inbox_id, message_id, notify_email, resend_id, ok, error, created_at).

## Implementation sketch

| Layer | Change |
|-------|--------|
| Migration `018_notify_email.sql` | `inboxes.notify_email`, `inboxes.notify_mode`, `notify_deliveries` |
| `src/lib/notify-email.ts` | Parse + validate email; block disposable relay loops |
| `src/services/notify-mail.ts` | `sendVerificationNotify(env, inbox, message, payload)` via Resend |
| `src/services/resend-mail.ts` | After `fireInboxCallback`, call notify if `inbox.notify_email` |
| `src/routes/inboxes.ts` | create/open body + notify deliveries route |
| `src/mcp/manifest.ts` | `create_inbox.notifyEmail` optional |
| OpenAPI | `InboxCreate.notifyEmail`, `NotifyDelivery` |
| Console | inbox detail: notify email + delivery log |
| Contract | `contract-qa-notify` via simulate → assert Resend mock or delivery row |

Reuse: `outbound-mail.ts` Resend client, `formatMessageVerification`, `parseCallbackUrl`-style validation.

## Security & abuse

| Risk | Mitigation |
|------|------------|
| Open relay | `notifyEmail` only on inbox create; one address per inbox; no arbitrary `to` |
| Spam to third parties | Require API key; rate limit per team; plan quota |
| PII in email | Summary only in v1; no full HTML forward |
| Bounce / complaint | Resend domain reputation; opt-in per inbox |
| Loop (notify → same inbox) | Reject if `notifyEmail` domain === `INBOX_DOMAIN` |

Plan gate (proposal): **free** — 10 notify emails/day; **pro+** — `PLAN_LIMITS.notifyEmailsPerDay`.

## MCP / SDK

```typescript
// create_inbox
notifyEmail: z.string().email().optional()
```

`@mailagent/agent` / `@mailagent/qa`: `notifyEmail` on `createInbox` / `openInbox`.

## Deploy

```bash
npm run db:migrate   # applies 018_notify_email.sql
# OUTBOUND_FROM must be set for ok=true deliveries (see docs/outbound.html)
```

## Done when

1. Developer creates inbox with `notifyEmail`, submits signup with temp `address`, receives OTP on real inbox within ~30s.
2. CI/agents unchanged — `notifyEmail` optional, no breaking change.
3. Contract test + doctor hint if `OUTBOUND_FROM` missing.
4. Console shows last notify delivery status.

## Explicitly not in v1

- Full MIME forward (`notifyMode: full_forward`)
- SMS / Slack notify
- Team-wide default notify address (future: team setting)

## Related

- `callbackUrl` — HTTPS webhook for CI
- `OUTBOUND_FROM` — [outbound.html](../public/docs/outbound.html)
- Team event webhook — team-wide events, not per-message OTP
