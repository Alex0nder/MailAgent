# Vitest + MailAgent

Минимальный пример для команд на **Vitest** (не Playwright/Cypress).

## Setup

```bash
npm install -D vitest @mailagent/qa
export MAILAGENT_API_KEY=…
export MAILAGENT_API_URL=https://api.webmailagent.com
```

## Run

```bash
npx vitest run examples/vitest/mailagent-signup.example.test.ts
```

## Паттерн

1. `createInbox({ label: MailAgentQa.runLabel("vitest") })` — изоляция на тест
2. Submit форму на staging с `address`
3. `waitForVerification(inboxId, { subjectContains, messageIndex })`
4. При `MailAgentTimeoutError` — `getDebugContext()` / `formatAllureAttachment()` в CI log

Диагностика на API: `GET /v1/inboxes/:id/diagnose` (или MCP `mailagent_diagnose_inbox`).

См. также [QA-TROUBLESHOOTING.md](../../docs/QA-TROUBLESHOOTING.md).
