# Callback cookbook (QA / CI)

Асинхронная альтернатива poll: MailAgent шлёт `POST` на ваш `callbackUrl`, когда письмо обработано.

## Когда использовать

| Poll (`/wait`) | Callback |
|----------------|----------|
| Простой E2E, один поток | Параллельные тесты, длинный flow |
| Нет публичного URL | Есть smee.io / staging hook / webhook.site |
| Playwright по умолчанию | Custom runner ждёт HTTP event |

## 1. Публичный URL в dev

### smee.io (рекомендуется локально)

```bash
npx smee -u https://smee.io/YOUR_CHANNEL -t http://127.0.0.1:9999/mailagent
```

В другом терминале — простой listener (Node):

```javascript
// scripts/callback-listener.mjs
import http from "node:http";
const pending = new Map();

http.createServer((req, res) => {
  if (req.method !== "POST" || req.url !== "/mailagent") {
    res.writeHead(404);
    res.end();
    return;
  }
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    const data = JSON.parse(body);
    pending.set(data.inboxId, data);
    console.log("callback", data.inboxId, data.otp ?? data.primaryLink);
    res.writeHead(200);
    res.end("ok");
  });
}).listen(9999, () => console.log("listening :9999/mailagent"));

export function waitCallback(inboxId, timeoutMs = 120_000) {
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    const iv = setInterval(() => {
      if (pending.has(inboxId)) {
        clearInterval(iv);
        resolve(pending.get(inboxId));
        pending.delete(inboxId);
      } else if (Date.now() - t0 > timeoutMs) {
        clearInterval(iv);
        reject(new Error("callback timeout"));
      }
    }, 500);
  });
}
```

Публичный URL для MailAgent: `https://smee.io/YOUR_CHANNEL` (smee проксирует на localhost).

### webhook.site (быстрый ручной тест)

1. Откройте https://webhook.site → скопируйте unique URL.
2. `callbackUrl: "https://webhook.site/xxxx-..."` при create inbox.
3. Триггерите письмо → смотрите payload в UI.
4. Для автотестов webhook.site неудобен — лучше smee или свой endpoint.

## 2. Create inbox с callback

```bash
CALLBACK="https://smee.io/YOUR_CHANNEL"

curl -sS -X POST "$MAILAGENT_API_URL/v1/inboxes" \
  -H "Authorization: Bearer $MAILAGENT_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"label\":\"cb-test\",\"callbackUrl\":\"$CALLBACK\",\"service\":\"auth0\"}"
```

Тело webhook:

```json
{
  "event": "message.received",
  "inboxId": "abc-123",
  "id": "msg-id",
  "otp": "482910",
  "primaryLink": "https://...",
  "from": "noreply@auth0.com",
  "subject": "Verify your email",
  "verification": {
    "otp": "482910",
    "primaryLink": "https://...",
    "links": ["https://..."],
    "from": "noreply@auth0.com",
    "subject": "Verify your email",
    "messageId": "msg-id",
    "hasRaw": true,
    "rawUrl": "/v1/inboxes/abc-123/messages/msg-id/raw"
  }
}
```

Поле `verification` — готовый блок для assert в CI (как `GET /extract`).

## 3. Assert в тесте (poll логов API)

Если webhook не дошёл — смотрите доставку:

```bash
curl -sS "$MAILAGENT_API_URL/v1/inboxes/INBOX_ID/callbacks" \
  -H "Authorization: Bearer $MAILAGENT_API_KEY" | jq .
```

Поля: `deliveries[].ok`, `statusCode`, `error`, `durationMs`.

### SDK: `waitForCallback` (@mailagent/qa ≥0.1.9)

Когда inbox с `callbackUrl`, но тест не слушает webhook напрямую — poll лога доставки:

```typescript
import { createMailAgentQa, MailAgentQa } from "@mailagent/qa";

const mail = createMailAgentQa();
const since = new Date();

const inbox = await mail.createInbox({
  label: MailAgentQa.ciLabel(),
  service: "auth0",
  callbackUrl: "https://smee.io/YOUR_CHANNEL",
});

// ... signup с inbox.address ...

const { verification, delivery } = await mail.waitForCallback(inbox.id, {
  since,
  timeoutSeconds: 120,
});

expect(verification.otp).toMatch(/^\d+$/);
console.log("callback ok", delivery.statusCode);
```

Cypress: `cy.task("mailagentWaitCallback", { inboxId })`.

## 4. GitHub Actions

Публичный URL в GHA без smee сложнее. Варианты:

1. **Poll** — `waitForVerification` / `GET /wait` (проще).
2. **Self-hosted runner** + ngrok/smee на той же машине.
3. **Staging hook** вашего приложения, который пишет OTP в artifact / Redis — callback бьёт туда.

Пример job только с poll: [examples/github-actions/qa-email.yml](../examples/github-actions/qa-email.yml).

## 5. Чеклист отладки callback

- [ ] URL **HTTPS** (http отклонится при create)
- [ ] Endpoint отвечает **2xx** за &lt; 10s
- [ ] Firewall не режет исходящие с Cloudflare Workers
- [ ] `GET …/callbacks` — `ok: false` → смотрите `statusCode` / `error`
- [ ] UI: [debug.html](https://webmailagent.com/debug.html) → inbox id

См. [QA.md](./QA.md#callback-webhook-в-ci).
