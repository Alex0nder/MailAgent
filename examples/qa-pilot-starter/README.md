# MailAgent QA pilot starter

Minimal **Playwright + `@mailagent/qa`** project — simulate OTP without staging mail or Resend.

## Quick start

```bash
cp .env.example .env   # set MAILAGENT_API_KEY
npm install
npm test
```

From MailAgent repo root (operators):

```bash
npm run wizard:qa-pilot
```

## Use in your test repo

1. Copy this folder into your repo (or fork).
2. GitHub → Settings → Secrets → `MAILAGENT_API_KEY`.
3. Push — `.github/workflows/mailagent.yml` runs on PR.

## Real signup E2E

Replace `tests/signup-simulate.spec.ts` with a flow that:

1. `mail.createInbox({ label, service: "auth0" })`
2. Fill staging signup form with `inbox.address`
3. `mail.waitForVerification(inbox.id, { subjectContains: "verify" })`

See [mailagent.fixture.ts](../playwright/mailagent.fixture.ts) in the parent repo.

## Docs

- [QA-PILOT.md](../../docs/QA-PILOT.md)
- [webmailagent.com/docs/qa.html](https://webmailagent.com/docs/qa.html)
