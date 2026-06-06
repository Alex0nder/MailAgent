# Vitest example

Minimal example for teams on **Vitest** (not Playwright/Cypress).

```bash
MAILAGENT_API_KEY=ma_… npx vitest run examples/vitest/mailagent-signup.example.test.ts
```

## Pattern

1. `createInbox({ label: MailAgentQa.runLabel("vitest") })` — isolation per test
2. Submit form on staging with `address`
3. `waitForVerification` / `extractVerification`
4. On `MailAgentTimeoutError` — `getDebugContext()` / `formatAllureAttachment()` in CI log

API diagnostics: `GET /v1/inboxes/:id/diagnose` (or MCP `mailagent_diagnose_inbox`).

See also [QA-TROUBLESHOOTING.md](../../docs/QA-TROUBLESHOOTING.md).
