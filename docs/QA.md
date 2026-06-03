# MailAgent для QA / E2E

Временный inbox в CI: signup, OTP, magic link — без общих почтовых ящиков и ручной проверки.

## Боли тестировщиков → как закрываем

| Боль | Решение |
|------|---------|
| Общий test@company.com — гонки, чужие письма | **Inbox на тест** (`label` = id прогона CI) |
| Ждать письмо 60–120 с в тесте | **POST /v1/inboxes/open** — один вызов |
| Flaky: письмо пришло, poll не увидел | **SSE** + poll; опционально **callbackUrl** |
| Нужен OTP / ссылка, не парсить HTML | **verification.otp**, **primaryLink** |
| Падение теста — что в ящике? | **GET /v1/inboxes?label=...** + messages |
| Письма не от staging | **expectFrom** / **service** allowlist |

## Быстрый сценарий (CI)

```bash
export MAILAGENT_API_URL=https://api.webmailagent.com
export MAILAGENT_API_KEY=your_key
export RUN_ID="${GITHUB_RUN_ID:-local-$(date +%s)}"

# 1. Создать inbox и дождаться письма
RESULT=$(curl -sS -X POST "$MAILAGENT_API_URL/v1/inboxes/open" \
  -H "Authorization: Bearer $MAILAGENT_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"label\": \"ci-$RUN_ID\",
    \"service\": \"auth0\",
    \"subjectContains\": \"verification\",
    \"timeoutSeconds\": 120,
    \"deleteAfter\": false
  }")

echo "$RESULT" | jq .
OTP=$(echo "$RESULT" | jq -r '.verification.otp')
LINK=$(echo "$RESULT" | jq -r '.verification.primaryLink')
ADDRESS=$(echo "$RESULT" | jq -r '.address')

# 2. Подставить $ADDRESS в форму signup в Playwright/Cypress
# 3. Если open вызвали ДО отправки формы — отдельно wait:
# curl "$MAILAGENT_API_URL/v1/inboxes/$INBOX_ID/wait?timeout=120&subjectContains=code"
```

## Playwright (`@mailagent/qa`)

```bash
npm run build:qa   # в репозитории MailAgent
# в проекте тестов:
npm install file:../MailAgent/packages/mailagent-qa
```

```typescript
import { test, expect } from "@playwright/test";
import { createMailAgentQa, MailAgentQa } from "@mailagent/qa";

const mail = createMailAgentQa();

test("signup with email verify", async ({ page }) => {
  const inbox = await mail.createInbox({
    label: MailAgentQa.runLabel("signup"),
    service: "auth0",
  });

  await page.goto("/signup");
  await page.fill('[name=email]', inbox.address);
  await page.click('button[type=submit]');

  const verification = await mail.waitForVerification(inbox.id, {
    subjectContains: "verify",
    timeoutSeconds: 120,
  });

  if (verification.otp) {
    await page.fill('[name=code]', verification.otp);
    await page.click('button[type=submit]');
  }

  await mail.deleteInbox(inbox.id);
});
```

Полный пример: [examples/playwright/signup-email.spec.example.ts](../examples/playwright/signup-email.spec.example.ts).

**Fixture:** [examples/playwright/mailagent.fixture.ts](../examples/playwright/mailagent.fixture.ts) — `testInbox` с auto-delete.

**CI:** [examples/github-actions/qa-email.yml](../examples/github-actions/qa-email.yml) — в конце job `DELETE /v1/inboxes?labelPrefix=ci-$RUN_ID`.

**Cleanup после suite:**

```typescript
// один prefix на прогон CI
const label = mail.runLabel(); // ci-1234567890-1
await mail.cleanupLabelPrefix(label.split("-").slice(0, 2).join("-")); // ci-1234567890
// или для GitHub Actions run id:
await mail.cleanupRun(process.env.GITHUB_RUN_ID!);
```

```bash
curl -X DELETE "$MAILAGENT_API_URL/v1/inboxes?labelPrefix=ci-$GITHUB_RUN_ID" \
  -H "Authorization: Bearer $MAILAGENT_API_KEY"
```

**Roadmap для QA:** [QA-ROADMAP.md](./QA-ROADMAP.md) — P0/P1/P2.

**Доп. гайды:**

- [QA-PRESETS.md](./QA-PRESETS.md) — матрица `service` / `expectFrom`
- [QA-CALLBACK.md](./QA-CALLBACK.md) — smee.io, webhook, `/callbacks`
- [QA-TROUBLESHOOTING.md](./QA-TROUBLESHOOTING.md) — timeout / OTP / webhook
- [QA-LOCAL-SMTP.md](./QA-LOCAL-SMTP.md) — Mailpit для локальной разработки
- [QA-ONBOARDING.md](./QA-ONBOARDING.md) — отдельный QA-ключ и team
- [QA-MIGRATION.md](./QA-MIGRATION.md) — Mailosaur / MailSlurp
- [QA-CI-ALERTS.md](./QA-CI-ALERTS.md) — Slack webhook, PR comment на failure
- Contract test без SMTP: `npm run test:contract:qa` (нужен `DATABASE_URL`; проверяет wait/extract и `messageIndex`)
- Callback contract: `npm run test:contract:qa:callback` — simulate + `POST` на `callbackUrl` (по умолчанию `https://httpbin.org/post`), poll `GET …/callbacks`
- Simulate с callback: `node scripts/simulate-inbound.mjs <inboxId> <otp> <from> --fire-callback`
- Cypress: [examples/cypress/](../examples/cypress/)

### Playwright (сырой fetch, без пакета)

```typescript
// tests/helpers/mailagent.ts — если не ставите @mailagent/qa
const API = process.env.MAILAGENT_API_URL!;
const KEY = process.env.MAILAGENT_API_KEY!;

export async function openTestInbox(opts: {
  label: string;
  service?: string;
  subjectContains?: string;
}) {
  const res = await fetch(`${API}/v1/inboxes/open`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      label: opts.label,
      service: opts.service ?? "auth0",
      subjectContains: opts.subjectContains,
      timeoutSeconds: 120,
      deleteAfter: false,
    }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<{
    address: string;
    verification: { otp: string | null; primaryLink: string | null };
  }>;
}

// legacy one-shot (open до submit — только если API ждёт после create)
test("signup with email verify (one-shot)", async ({ page }) => {
  const label = `pw-${test.info().parallelIndex}-${Date.now()}`;

  await page.goto("/signup");
  const { address } = await openTestInbox({ label, subjectContains: "verify" });

  await page.fill('[name=email]', address);
  await page.click('button[type=submit]');

  const { verification } = await openTestInbox({ label }); // предпочитайте create → submit → wait
  if (verification.otp) {
    await page.fill('[name=code]', verification.otp);
  }
});
```

Рекомендуемый порядок в E2E:

1. `POST /v1/inboxes` с `label` → получить `address`
2. Заполнить форму на стенде
3. `GET /v1/inboxes/:id/wait?subjectContains=...` или `POST /open` только если письмо уже в пути

## Callback (webhook в CI)

Подробный гайд: [QA-CALLBACK.md](./QA-CALLBACK.md) (smee.io, webhook.site, отладка `/callbacks`).

Кратко — если есть публичный URL (smee.io, ngrok, staging hook):

```json
{
  "label": "ci-123",
  "callbackUrl": "https://your-ci-hook.example/events",
  "service": "stripe"
}
```

При письме MailAgent шлёт `POST` с телом:

```json
{
  "event": "message.received",
  "inboxId": "...",
  "otp": "123456",
  "primaryLink": "https://...",
  "subject": "..."
}
```

## Отладка после падения

```bash
curl -sS "$MAILAGENT_API_URL/v1/inboxes?label=ci-12345" \
  -H "Authorization: Bearer $MAILAGENT_API_KEY" | jq .

curl -sS "$MAILAGENT_API_URL/v1/inboxes/INBOX_ID/messages" \
  -H "Authorization: Bearer $MAILAGENT_API_KEY" | jq .
```

## API (QA-поля)

| Поле | Где | Зачем |
|------|-----|-------|
| `label` | create, open | id прогона / воркера |
| `subjectContains` | open, wait | фильтр по теме |
| `callbackUrl` | create, open | HTTPS webhook при письме |
| `deleteAfter` | open | `false` — оставить для отладки |

### Rate limit (429)

При превышении лимита API возвращает заголовки:

| Header | Значение |
|--------|----------|
| `X-RateLimit-Limit` | лимит в минуту на ключ |
| `X-RateLimit-Remaining` | осталось в текущей минуте |
| `X-RateLimit-Reset` | Unix sec, конец окна |
| `Retry-After` | секунд до retry (только 429) |

В SDK: `MailAgentRateLimitError` с `retryAfterSeconds`.

### TTL в CI

```bash
export QA_TTL_MINUTES=60   # @mailagent/qa подставит в create/open, если ttlMinutes не задан
```

### Несколько писем в inbox

```bash
curl -sS "$MAILAGENT_API_URL/v1/inboxes/ID/messages?subjectContains=verify" \
  -H "Authorization: Bearer $KEY" | jq .
```

SDK: `mail.listMessages(inboxId, { subjectContains: "verify" })`.

### Retry при flaky wait

```typescript
await mail.waitWithRetry(inbox.id, { subjectContains: "verify" }, 3);
```

### Allure / отчёты

```typescript
import { formatAllureAttachment } from "@mailagent/qa";
const ctx = await mail.getDebugContext(inbox.id);
await testInfo.attach(...formatAllureAttachment(ctx));
```

Пример: [examples/playwright/allure-on-failure.example.ts](../examples/playwright/allure-on-failure.example.ts).

### Миграция с Mailosaur / MailSlurp

[QA-MIGRATION.md](./QA-MIGRATION.md)

### Лог callback (webhook не сработал?)

```bash
curl -sS "$MAILAGENT_API_URL/v1/inboxes/INBOX_ID/callbacks" \
  -H "Authorization: Bearer $MAILAGENT_API_KEY" | jq .
```

Ответ: `deliveries[]` с `ok`, `statusCode`, `error`, `durationMs`. UI: [/debug.html](https://webmailagent.com/debug.html).

Миграции: `npm run db:migrate` (`003_qa_fields.sql`, `005_callback_deliveries.sql`).
