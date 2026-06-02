# Миграция с Mailosaur / MailSlurp / Mailtrap

Краткое сопоставление концепций MailAgent ↔ классические email testing API.

## Концепции

| Другой сервис | MailAgent |
|---------------|-----------|
| Inbox / inbox id | `POST /v1/inboxes` → `id`, `address` |
| Email address | `address` (`*@your-inbox-domain`) |
| Wait for email | `GET /v1/inboxes/:id/wait` или SDK `waitForVerification` |
| Get OTP / links | `GET /v1/inboxes/:id/extract` |
| List messages | `GET /v1/inboxes/:id/messages` |
| Delete inbox | `DELETE /v1/inboxes/:id` |
| Tags / metadata | `label` на create |
| Allowlist sender | `service` или `expectFrom` |

## Mailosaur

```javascript
// Mailosaur
const serverId = "...";
const email = `anything@${serverId}.mailosaur.net`;
const msg = await mailosaur.messages.get(serverId, { sentTo: email });

// MailAgent
const inbox = await mail.createInbox({ label: "test-1", service: "auth0" });
// signup with inbox.address
const v = await mail.waitForVerification(inbox.id, { subjectContains: "verify" });
// v.otp, v.primaryLink
```

## MailSlurp

```javascript
// MailSlurp
const inbox = await inboxesApi.createInbox();
await waitController.waitForLatestEmail(inbox.id, 120_000);

// MailAgent
const { inboxId, verification } = await mail.open({
  label: "ci-1",
  subjectContains: "code",
  timeoutSeconds: 120,
});
```

## Mailtrap (testing inbox)

Mailtrap часто используют как SMTP sandbox — письма не уходят наружу. MailAgent принимает **реальный inbound** через Resend на ваш домен. Для CI без SMTP используйте `npm run test:contract:qa` (simulate в БД).

## Playwright / Cypress

| | Mailosaur npm | MailAgent |
|---|---------------|-----------|
| Install | `mailosaur` | `@mailagent/qa` |
| CI secret | `MAILOSAUR_API_KEY` | `MAILAGENT_API_KEY` |
| Parallel runs | random address | `mail.runLabel("ci")` + cleanup |

## Чеклист переезда

1. Заменить env: `MAILAGENT_API_URL`, `MAILAGENT_API_KEY`
2. Убрать polling по стороннему API → `waitForVerification` или `open`
3. Настроить `service` под From вашего staging ([QA-PRESETS.md](./QA-PRESETS.md))
4. Добавить cleanup: `cleanupRun(GITHUB_RUN_ID)` или `DELETE ?labelPrefix=`
5. При 429 смотреть заголовки `X-RateLimit-*`, `Retry-After`

См. [QA.md](./QA.md), [QA-ONBOARDING.md](./QA-ONBOARDING.md).
