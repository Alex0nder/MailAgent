# Playwright examples

Copy into your test repo (`tests/` or `e2e/`).

| File | Purpose |
|------|---------|
| `mailagent.fixture.ts` | Auto create/delete inbox per test |
| `mailagent-callback.fixture.ts` | Inbox with `MAILAGENT_CALLBACK_URL` |
| `signup-email.spec.example.ts` | OTP signup flow |
| `attachment.spec.example.ts` | List attachment metadata (`MAILAGENT_TEST_MESSAGE_ID`) |
| `allure-on-failure.example.ts` | Attach debug context on timeout |

## Attachment test without real SMTP

In MailAgent repo (needs `DATABASE_URL`):

```bash
export MAILAGENT_API_KEY=...
export DATABASE_URL=...
export MAILAGENT_API_URL=https://api.webmailagent.com

# create inbox via API, then:
node scripts/simulate-inbound.mjs INBOX_ID 123456 billing@example.com \
  --subject="Invoice test.pdf" --with-attachment=test.pdf

export MAILAGENT_TEST_MESSAGE_ID=<messageId from simulate output>
npx playwright test examples/playwright/attachment.spec.example.ts
```

Or run contract: `npm run test:contract:qa:attachments`
