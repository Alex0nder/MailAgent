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

## Playwright (пример)

```typescript
// tests/helpers/mailagent.ts
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

// test
test("signup with email verify", async ({ page }) => {
  const label = `pw-${test.info().parallelIndex}-${Date.now()}`;
  const inboxPromise = openTestInbox({ label, subjectContains: "verify" });

  await page.goto("/signup");
  const { address } = await inboxPromise; // или create отдельно, потом submit, потом wait

  await page.fill('[name=email]', address);
  await page.click('button[type=submit]');

  const { verification } = await openTestInbox({ label }); // лучше: create → submit → GET wait
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

Если есть публичный URL (smee.io, ngrok, staging hook):

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

Миграция: `npm run db:migrate` (файл `003_qa_fields.sql`).
