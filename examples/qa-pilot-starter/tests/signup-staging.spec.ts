/**
 * Real signup E2E — requires staging that sends mail from your service preset.
 * Skipped until APP_SIGNUP_URL is set (simulate test runs in CI by default).
 */
import { test, expect } from "../mailagent.fixture";

const signupUrl = process.env.APP_SIGNUP_URL?.trim();

test.describe("signup (staging)", () => {
  test.skip(!signupUrl, "Set APP_SIGNUP_URL to enable staging E2E");

  test("receives OTP from staging signup", async ({ page, mail, testInbox }) => {
    await page.goto(signupUrl!);
    await page.getByLabel(/email/i).fill(testInbox.address);
    await page.getByRole("button", { name: /sign up|register|continue/i }).click();

    const verification = await mail.waitForVerification(testInbox.id, {
      subjectContains: process.env.MAIL_SUBJECT_CONTAINS ?? "verify",
      timeoutSeconds: Number(process.env.MAIL_WAIT_SECONDS ?? 120),
    });

    expect(verification.otp ?? verification.primaryLink).toBeTruthy();

    if (verification.otp) {
      await page.getByLabel(/code|otp|verification/i).fill(verification.otp);
      await page.getByRole("button", { name: /confirm|verify|continue/i }).click();
    }
  });
});
