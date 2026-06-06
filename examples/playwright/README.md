# Playwright examples

```bash
npm install @mailagent/qa playwright
```

From MailAgent repo root (requires `MAILAGENT_API_KEY` + `DATABASE_URL`):

```bash
MAILAGENT_API_KEY=ma_… DATABASE_URL=… \
  npx playwright test -c examples/playwright/playwright.config.example.ts
```

## Files

| File | Purpose |
|------|---------|
| `mailagent.fixture.ts` | Auto-delete inbox after test |
| `mailagent-simulate.fixture.ts` | `simulateAndVerify` without SMTP |
| `mailagent-callback.fixture.ts` | `callbackUrl` + delivery poll |
| `signup-email.spec.example.ts` | Real staging mail |
| `signup-simulate.spec.example.ts` | Simulate only |
| `attachment.spec.example.ts` | Attachments after globalSetup |

`globalSetup` creates inbox, simulate with `--with-attachment`, waits for message, writes context.  
`afterAll` in spec deletes inbox.
