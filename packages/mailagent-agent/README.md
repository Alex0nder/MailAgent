# @mailagent/agent

Minimal SDK for [MailAgent](https://webmailagent.com) agent flows.

```bash
npm install @mailagent/agent
```

```ts
import { MailAgent } from "@mailagent/agent";

const mail = new MailAgent({
  baseUrl: "https://api.webmailagent.com",
  apiKey: process.env.MAILAGENT_API_KEY!,
});

const step1 = await mail.verifySignup({
  service: "github",
  runId: "my-agent-session",
  timeoutSeconds: 5,
  deleteAfter: false,
});
// step1.email.address → signup form

const step2 = await mail.verifySignup({
  inboxId: step1.email!.inboxId,
  timeoutSeconds: 90,
});
console.log(step2.agent?.primaryAction);
```

See [Agent docs](https://webmailagent.com/docs/agents.html).
