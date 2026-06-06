/**
 * MailAgent E2E example — copy into your project and set MAILAGENT_API_KEY.
 * Run: npx playwright test (after installing @mailagent/qa)
 */
import { test, expect } from "@playwright/test";
import { createMailAgentQa, MailAgentQa } from "@mailagent/qa";

const mail = createMailAgentQa();

test.describe("signup email flow", () => {
  test("receives OTP and completes verify", async ({ page }) => {
    const label = MailAgentQa.runLabel("signup");
    const inbox = await mail.createInbox({
      label,
      service: "auth0",
      ttlMinutes: 30,
    });

    await page.goto(process.env.APP_URL ?? "https://your-staging.app/signup");
    await page.getByLabel(/email/i).fill(inbox.address);
    await page.getByRole("button", { name: /sign up|register/i }).click();

    const verification = await mail.waitForVerification(inbox.id, {
      subjectContains: "verify",
      timeoutSeconds: 120,
    });

    expect(verification.otp ?? verification.primaryLink).toBeTruthy();

    if (verification.otp) {
      await page.getByLabel(/code|otp/i).fill(verification.otp);
      await page.getByRole("button", { name: /confirm|verify/i }).click();
    }

    await mail.deleteInbox(inbox.id);
  });
});
