# @mailagent/qa

Хелпер для E2E: временный inbox, OTP и magic link в Playwright / Cypress / CI.

## Установка (из репозитория)

```bash
npm install file:../packages/mailagent-qa
# или после publish: npm install @mailagent/qa
```

## Env

```bash
export MAILAGENT_API_URL=https://api.webmailagent.com
export MAILAGENT_API_KEY=your_key
```

## Playwright

```typescript
import { test, expect } from "@playwright/test";
import { createMailAgentQa, MailAgentQa } from "@mailagent/qa";

const mail = createMailAgentQa();

test("signup with email verification", async ({ page }) => {
  const label = MailAgentQa.runLabel("signup");
  const { address, id } = await mail.createInbox({
    label,
    service: "auth0",
  });

  await page.goto("/signup");
  await page.fill('[name="email"]', address);
  await page.click('button[type="submit"]');

  const { otp, primaryLink } = await mail.waitForVerification(id, {
    subjectContains: "verify",
    timeoutSeconds: 120,
  });

  if (otp) {
    await page.fill('[name="code"]', otp);
    await page.click('button[type="submit"]');
  }
  await expect(page).toHaveURL(/dashboard/);

  await mail.deleteInbox(id);
});
```

Полный гайд: [docs/QA.md](../../docs/QA.md)
