# Playwright examples

Copy into your test repo (`tests/` or `e2e/`).

| File | Purpose |
|------|---------|
| `mailagent.fixture.ts` | Auto create/delete inbox per test |
| `mailagent-callback.fixture.ts` | Inbox with `MAILAGENT_CALLBACK_URL` |
| `mailagent-context.ts` | Read `.mailagent-context.json` from globalSetup |
| `playwright.config.example.ts` | Config with `globalSetup` |
| `signup-email.spec.example.ts` | OTP signup flow |
| `attachment.spec.example.ts` | List attachment metadata |
| `allure-on-failure.example.ts` | Attach debug context on timeout |

## Attachment test with globalSetup (recommended)

В корне MailAgent (нужны `MAILAGENT_API_KEY` + `DATABASE_URL`):

```bash
export MAILAGENT_API_KEY=...
export DATABASE_URL=...
export MAILAGENT_API_URL=https://api.webmailagent.com

npm run test:pw:setup
# writes examples/playwright/.mailagent-context.json

# in your Playwright project (with @playwright/test + @mailagent/qa):
npx playwright test attachment.spec.example.ts -c playwright.config.example.ts
```

`globalSetup` создаёт inbox, simulate с `--with-attachment`, ждёт письмо, пишет context.  
`afterAll` в spec удаляет inbox.

## Manual (without globalSetup)

```bash
node scripts/simulate-inbound.mjs INBOX_ID 123456 billing@example.com \
  --subject="Invoice test.pdf" --with-attachment=test.pdf

export MAILAGENT_TEST_INBOX_ID=...
export MAILAGENT_TEST_MESSAGE_ID=...
```

Or contract: `npm run test:contract:qa:attachments`
