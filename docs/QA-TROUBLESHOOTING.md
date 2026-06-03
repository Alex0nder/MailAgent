# Troubleshooting email tests

Быстрый чеклист когда `wait` / `open` вернули **408 timeout** или OTP пустой.

## Дерево решений

### 1. В inbox 0 сообщений

**Симптом:** `GET …/messages` → `[]`, timeout на wait.

| Проверка | Действие |
|----------|----------|
| Staging отправил письмо? | Логи app, mail queue |
| Resend webhook | `GET /health` → `webhook: /webhooks/resend`; в Resend Dashboard — Events → receiving |
| Домен inbox | Адрес `@your-inbox-domain`, не случайный Gmail |
| Allowlist | `service` preset или `expectFrom` — письмо от другого From отбрасывается |

```bash
curl -sS "$MAILAGENT_API_URL/v1/inboxes/INBOX_ID/messages" \
  -H "Authorization: Bearer $MAILAGENT_API_KEY" | jq .
```

### 2. Сообщения есть, wait всё равно timeout

**Симптом:** в debug UI видны письма, но wait вернул 408 с `subjects[]`.

- Ослабьте `subjectContains` или уберите временно
- **Welcome + verify:** первое письмо — welcome, второе — OTP → `messageIndex=1`

```bash
curl "$MAILAGENT_API_URL/v1/inboxes/INBOX_ID/wait?timeout=120&messageIndex=1&subjectContains=verify"
```

### 3. Сообщение есть, OTP / link пустые

- Откройте raw MIME: `GET …/messages/:id/raw` (если `hasRaw: true`)
- Проверьте HTML-only письма — extract идёт по text + html от Resend
- Magic link в кнопке — смотрите `links[]` и `primaryLink`

### 4. callbackUrl не сработал

```bash
curl -sS "$MAILAGENT_API_URL/v1/inboxes/INBOX_ID/callbacks" \
  -H "Authorization: Bearer $MAILAGENT_API_KEY" | jq .
```

| `ok` | Что делать |
|------|------------|
| `false`, 4xx/5xx | URL CI runner недоступен с интернета — smee.io / webhook.site ([QA-CALLBACK.md](./QA-CALLBACK.md)) |
| `false`, timeout | Увеличить timeout на вашем endpoint |
| нет записей | `callbackUrl` не передали при create или письмо не дошло |

### 5. Rate limit / quota

```bash
curl -sS "$MAILAGENT_API_URL/v1/me" -H "Authorization: Bearer $KEY" | jq .
```

- `429 inbox_limit_reached` — cleanup: `DELETE …/inboxes?labelPrefix=ci-RUN_ID`
- `429` + `Retry-After` — подождать или scoped key на отдельную команду

## SDK: автоматический контекст

```typescript
import { createMailAgentQa, formatAllureAttachment } from "@mailagent/qa";

try {
  await mail.waitForVerification(inboxId, { subjectContains: "verify" });
} catch (e) {
  if (e instanceof MailAgentTimeoutError && e.details?.inboxId) {
    const ctx = await mail.getDebugContext(e.details.inboxId as string);
    console.error(ctx.troubleshooting.join("\n"));
    // Allure: testInfo.attach(formatAllureAttachment(ctx));
  }
  throw e;
}
```

## Debug UI

[webmailagent.com/debug.html?inbox=INBOX_ID](https://webmailagent.com/debug.html) — таблица писем, callbacks, ссылки raw/attachments.

## Smoke после деплоя

```bash
export MAILAGENT_API_URL=https://api.webmailagent.com
export MAILAGENT_API_KEY=mak_...
npm run smoke:qa
npm run smoke:prod
```
