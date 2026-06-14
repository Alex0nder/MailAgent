# Troubleshooting email tests

Quick checklist when `wait` / `open` returned **408 timeout** or OTP is empty.

## Decision tree

### 1. Zero messages in inbox

**Symptom:** `GET …/messages` → `[]`, wait timeout.

| Check | Action |
|----------|----------|
| Did staging send mail? | App logs, mail queue |
| Resend webhook | `GET /health` → `webhook: /webhooks/resend`; Resend Dashboard — Events → receiving |
| Inbox domain | Address `@your-inbox-domain`, not random Gmail |
| Allowlist | `service` preset or `expectFrom` — mail from other From is dropped |

```bash
curl -sS "$MAILAGENT_API_URL/v1/inboxes/INBOX_ID/messages" \
  -H "Authorization: Bearer $MAILAGENT_API_KEY" | jq .
```

### 2. Messages exist, wait still times out

**Symptom:** debug UI shows mail, but wait returned 408 with `subjects[]`.

- Relax `subjectContains` or remove temporarily
- **Welcome + verify:** first mail is welcome, second is OTP → `messageIndex=1`

```bash
curl "$MAILAGENT_API_URL/v1/inboxes/INBOX_ID/wait?timeout=120&messageIndex=1&subjectContains=verify"
```

### 3. Message exists, OTP / link empty

- Open raw MIME: `GET …/messages/:id/raw` (if `hasRaw: true`)
- Check HTML-only mail — extract uses text + html from Resend
- Magic link in button — see `links[]` and `primaryLink`

### 4. callbackUrl did not fire

```bash
curl -sS "$MAILAGENT_API_URL/v1/inboxes/INBOX_ID/callbacks" \
  -H "Authorization: Bearer $MAILAGENT_API_KEY" | jq .
```

| `ok` | What to do |
|------|------------|
| `false`, 4xx/5xx | CI runner URL not reachable from internet — smee.io / webhook.site ([QA-CALLBACK.md](./QA-CALLBACK.md)) |
| `false`, timeout | Increase timeout on your endpoint |
| no records | `callbackUrl` not passed on create or mail did not arrive |

### 5. Rate limit / quota

```bash
curl -sS "$MAILAGENT_API_URL/v1/me" -H "Authorization: Bearer $KEY" | jq .
```

- `429 inbox_limit_reached` — cleanup: `DELETE …/inboxes?labelPrefix=ci-RUN_ID`
- `429` + `Retry-After` — wait or scoped key for separate team

## SDK: automatic context

```typescript
import { createMailAgentQa, formatAllureAttachment } from "@mailagent/qa";

try {
  await mail.waitForVerification(inboxId, { subjectContains: "verify" });
} catch (e) {
  if (e instanceof MailAgentTimeoutError && e.details?.inboxId) {
    const ctx = await mail.getDebugContext(e.details.inboxId as string);
    console.error(ctx.troubleshooting.join("\n"));
    // Allure: testInfo.attach(formatAllureAttachment(ctx));
  }
  throw e;
}
```

## Debug UI

[webmailagent.com/debug.html?inbox=INBOX_ID](https://webmailagent.com/debug.html) — message table, callbacks, raw/attachment links, **troubleshooting** from `GET …/diagnose`.

```bash
curl -sS "$MAILAGENT_API_URL/v1/inboxes/INBOX_ID/diagnose" \
  -H "Authorization: Bearer $MAILAGENT_API_KEY" | jq .
```

Agent recovery fields:

| Field | Use |
|-------|-----|
| `failureSummary.code` | Stable reason (`no_messages`, `subject_filter_no_match`, `message_index_too_high`, `callback_failed`, `message_received`, `unknown`) |
| `recommendedAction` | Best next step for an agent |
| `retry.wait` | Ready-to-use wait retry payload |
| `retry.simulate` | Ready-to-use simulate payload for SMTP-free debugging |
| `nextActions` | Ordered alternatives, including debug UI |

## Smoke after deploy

```bash
export MAILAGENT_API_URL=https://api.webmailagent.com
export MAILAGENT_API_KEY=mak_...
npm run smoke:qa
npm run smoke:prod
```
