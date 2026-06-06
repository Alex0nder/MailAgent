# Migration from Mailosaur / MailSlurp / Mailtrap

Brief mapping of MailAgent concepts ↔ classic email testing APIs.

## Concepts

| Other service | MailAgent |
|---------------|-----------|
| Inbox / inbox id | `POST /v1/inboxes` → `id`, `address` |
| Email address | `address` (`*@your-inbox-domain`) |
| Wait for email | `GET /v1/inboxes/:id/wait` or SDK `waitForVerification` |
| Get OTP / links | `GET /v1/inboxes/:id/extract` |
| List messages | `GET /v1/inboxes/:id/messages` |
| Delete inbox | `DELETE /v1/inboxes/:id` |
| Tags / metadata | `label` on create |
| Allowlist sender | `service` or `expectFrom` |

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

Mailtrap is often used as SMTP sandbox — mail does not go out. MailAgent accepts **real inbound** via Resend on your domain. For CI without SMTP use `npm run test:contract:qa` (simulate in DB).

## Playwright / Cypress

| | Mailosaur npm | MailAgent |
|---|---------------|-----------|
| Install | `mailosaur` | `@mailagent/qa` |
| CI secret | `MAILOSAUR_API_KEY` | `MAILAGENT_API_KEY` |
| Parallel runs | random address | `mail.runLabel("ci")` + cleanup |

## Migration checklist

1. Replace env: `MAILAGENT_API_URL`, `MAILAGENT_API_KEY`
2. Remove polling on third-party API → `waitForVerification` or `open`
3. Set `service` for your staging From ([QA-PRESETS.md](./QA-PRESETS.md))
4. Add cleanup: `cleanupRun(GITHUB_RUN_ID)` or `DELETE ?labelPrefix=`
5. On 429 check headers `X-RateLimit-*`, `Retry-After`

See [QA.md](./QA.md), [QA-ONBOARDING.md](./QA-ONBOARDING.md).
