# Local development: Mailpit + MailAgent

Two mail testing modes:

| Mode | When | How |
|-------|--------|-----|
| **Mailpit** | Local / docker CI, app sends via SMTP | `docker compose -f examples/docker-compose.mailpit.yml up` |
| **MailAgent** | Staging/CI with real inbound domain | `@mailagent/qa` + Resend webhook |

## Mailpit (local)

```bash
docker compose -f examples/docker-compose.mailpit.yml up -d
```

| Service | URL / port |
|--------|------------|
| Web UI | http://localhost:8025 |
| SMTP | `localhost:1025` |

Configure your app:

```env
SMTP_HOST=127.0.0.1
SMTP_PORT=1025
SMTP_TLS=false
```

### Playwright + mailpit-api (optional)

```bash
npm install mailpit-api --save-dev
```

```typescript
import { test as base } from "@playwright/test";
import { MailpitClient } from "mailpit-api";

export const test = base.extend<{ mailpit: MailpitClient }>({
  mailpit: async ({}, use) => {
    const client = new MailpitClient({ baseUrl: "http://127.0.0.1:8025" });
    await client.deleteAllMessages();
    await use(client);
  },
});
```

## Staging / CI → MailAgent

When mail goes through Resend inbound on your domain:

```typescript
import { createMailAgentQa, MailAgentQa } from "@mailagent/qa";

const mail = createMailAgentQa();
const inbox = await mail.createInbox({
  label: MailAgentQa.ciLabel(),
  service: "auth0",
});
```

See [QA.md](./QA.md), [QA-TROUBLESHOOTING.md](./QA-TROUBLESHOOTING.md).

## Migrating local → CI

1. Local: Mailpit + SMTP in `.env.development`
2. CI: same tests, but `MAILAGENT_API_KEY` + `@mailagent/qa` instead of Mailpit fixture
3. One signup scenario — different env in `playwright.config.ts`
