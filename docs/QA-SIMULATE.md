# Simulate-first QA (без Resend)

Когда staging ещё не шлёт письма, или нужен **детерминированный OTP** в CI — используй `POST /v1/inboxes/:id/simulate`.

## Когда использовать

| Сценарий | Решение |
|----------|---------|
| CI consumer-репо без Neon | `simulate` через REST или `@mailagent/qa` |
| Локальная отладка OTP-парсера | Debug UI → «Simulate OTP email» |
| Contract / smoke MailAgent | `npm run test:contract:qa` (только API key) |
| Полный E2E со staging | Обычный `waitForVerification` + Resend |

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

- Пример: [examples/playwright/signup-simulate.spec.example.ts](../examples/playwright/signup-simulate.spec.example.ts)
- Fixture: [examples/playwright/mailagent-simulate.fixture.ts](../examples/playwright/mailagent-simulate.fixture.ts)

## GitHub Actions (consumer repo)

Скопируй [examples/github-actions/qa-simulate-only.yml](../examples/github-actions/qa-simulate-only.yml) — secret: `MAILAGENT_API_KEY`.

## MCP / Codex

`mailagent_simulate_message` → затем `mailagent_wait_and_extract` или `mailagent_verify_signup`.

См. также [QA-TROUBLESHOOTING.md](./QA-TROUBLESHOOTING.md) · [QA-LOCAL-SMTP.md](./QA-LOCAL-SMTP.md).
