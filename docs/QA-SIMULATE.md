# Simulate-first QA (without Resend)

When staging does not send mail yet, or you need **deterministic OTP** in CI — use `POST /v1/inboxes/:id/simulate`.

## When to use

| Scenario | Solution |
|----------|---------|
| CI consumer repo without Neon | `simulate` via REST or `@mailagent/qa` |
| Local OTP parser debug | Debug UI → "Simulate OTP email" |
| MailAgent contract / smoke | `npm run test:contract:qa` (API key only) |
| Full E2E with staging | Normal `waitForVerification` + Resend |

## REST

```bash
INBOX=$(curl -sS -X POST "$MAILAGENT_API_URL/v1/inboxes" \
  -H "Authorization: Bearer $MAILAGENT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"label":"sim-test","ttlMinutes":15}' | jq -r .id)

curl -sS -X POST "$MAILAGENT_API_URL/v1/inboxes/$INBOX/simulate" \
  -H "Authorization: Bearer $MAILAGENT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"otp":"482910","subject":"Verify (simulated)"}' | jq .

curl -sS "$MAILAGENT_API_URL/v1/inboxes/$INBOX/extract" \
  -H "Authorization: Bearer $MAILAGENT_API_KEY" | jq .otp
```

## Threading (v0.18)

Simulate a thread without SMTP — for contract `npm run test:contract:qa:threads`:

```bash
ROOT=$(curl -sS -X POST "$MAILAGENT_API_URL/v1/inboxes/$INBOX/simulate" \
  -H "Authorization: Bearer $MAILAGENT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"subject":"Support ticket","rfcMessageId":"root@sim.test"}')

ROOT_ID=$(echo "$ROOT" | jq -r .messageId)

curl -sS -X POST "$MAILAGENT_API_URL/v1/inboxes/$INBOX/simulate" \
  -H "Authorization: Bearer $MAILAGENT_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"subject\":\"Re: Support ticket\",\"inReplyToMessageId\":\"$ROOT_ID\"}" | jq .threadId

curl -sS "$MAILAGENT_API_URL/v1/inboxes/$INBOX/threads" \
  -H "Authorization: Bearer $MAILAGENT_API_KEY" | jq .
```

## `@mailagent/qa`

```typescript
const inbox = await mail.createInbox({ label: MailAgentQa.runLabel("ci") });

const verification = await mail.simulateAndVerify(inbox.id, {
  otp: "556677",
  subjectContains: "simulated",
});

expect(verification.otp).toBe("556677");
await mail.deleteInbox(inbox.id);
```

## Playwright

- Example: [examples/playwright/signup-simulate.spec.example.ts](../examples/playwright/signup-simulate.spec.example.ts)
- Fixture: [examples/playwright/mailagent-simulate.fixture.ts](../examples/playwright/mailagent-simulate.fixture.ts)

## GitHub Actions (consumer repo)

Copy [examples/github-actions/qa-simulate-only.yml](../examples/github-actions/qa-simulate-only.yml) — secret: `MAILAGENT_API_KEY`.

## MCP / Codex

`mailagent_simulate_message` → then `mailagent_wait_and_extract` or `mailagent_verify_signup`.

See also [QA-TROUBLESHOOTING.md](./QA-TROUBLESHOOTING.md) · [QA-LOCAL-SMTP.md](./QA-LOCAL-SMTP.md).
