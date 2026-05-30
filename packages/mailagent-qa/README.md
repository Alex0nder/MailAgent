# @mailagent/qa

Playwright / Cypress helpers for [MailAgent](https://webmailagent.com) test inboxes.

```bash
npm install @mailagent/qa
```

```ts
import { MailAgentQA } from "@mailagent/qa";

const mail = new MailAgentQA({
  baseUrl: process.env.MAILAGENT_API_URL!,
  apiKey: process.env.MAILAGENT_API_KEY!,
});

const inbox = await mail.createInbox({ label: "ci-run-42", ttlMinutes: 15 });
const { otp } = await mail.waitForVerification(inbox.id, { timeoutSeconds: 90 });
```

See [QA docs](https://webmailagent.com/docs/qa.html).
