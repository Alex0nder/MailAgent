# Локальная разработка: Mailpit + MailAgent

Два режима тестирования почты:

| Режим | Когда | Как |
|-------|--------|-----|
| **Mailpit** | Локально / docker CI, app шлёт на SMTP | `docker compose -f examples/docker-compose.mailpit.yml up` |
| **MailAgent** | Staging/CI с реальным inbound доменом | `@mailagent/qa` + Resend webhook |

## Mailpit (локально)

```bash
docker compose -f examples/docker-compose.mailpit.yml up -d
```

| Сервис | URL / порт |
|--------|------------|
| Web UI | http://localhost:8025 |
| SMTP | `localhost:1025` |

Настройте приложение:

```env
SMTP_HOST=127.0.0.1
SMTP_PORT=1025
SMTP_TLS=false
```

### Playwright + mailpit-api (опционально)

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

Когда письма идут через Resend inbound на ваш домен:

```typescript
import { createMailAgentQa, MailAgentQa } from "@mailagent/qa";

const mail = createMailAgentQa();
const inbox = await mail.createInbox({
  label: MailAgentQa.ciLabel(),
  service: "auth0",
});
```

См. [QA.md](./QA.md), [QA-TROUBLESHOOTING.md](./QA-TROUBLESHOOTING.md).

## Миграция local → CI

1. Локально: Mailpit + SMTP в `.env.development`
2. CI: те же тесты, но `MAILAGENT_API_KEY` + `@mailagent/qa` вместо Mailpit fixture
3. Один сценарий signup — разные env в `playwright.config.ts`
