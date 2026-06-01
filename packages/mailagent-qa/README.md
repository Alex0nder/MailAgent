# @mailagent/qa

Playwright / Cypress helpers for [MailAgent](https://webmailagent.com) test inboxes.

```bash
npm install @mailagent/qa
```

## Playwright

```ts
import { createMailAgentQa } from "@mailagent/qa";

const mail = createMailAgentQa();
const inbox = await mail.createInbox({ label: mail.runLabel("ci"), service: "auth0" });
const { otp } = await mail.waitForVerification(inbox.id, { subjectContains: "verify" });
await mail.cleanupRun(process.env.GITHUB_RUN_ID!);
```

Fixture: [examples/playwright/mailagent.fixture.ts](../../examples/playwright/mailagent.fixture.ts).

## Cypress

`cypress.config.ts`:

```ts
import { createMailAgentCypressTasks } from "@mailagent/qa/cypress";

export default defineConfig({
  e2e: {
    setupNodeEvents(on) {
      on("task", createMailAgentCypressTasks());
    },
  },
});
```

Spec: [examples/cypress/signup-email.cy.example.ts](../../examples/cypress/signup-email.cy.example.ts).

Tasks: `mailagentRunLabel`, `mailagentCreateInbox`, `mailagentWaitVerification`, `mailagentOpen`, `mailagentDeleteInbox`, `mailagentCleanupRun`.

## Docs

- [QA guide](https://webmailagent.com/docs/qa.html)
- [Service presets](../../docs/QA-PRESETS.md)
- [Callback cookbook](../../docs/QA-CALLBACK.md)
