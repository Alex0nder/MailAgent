/**
 * Playwright + simulate — проверка OTP-пайплайна без staging-почты и Resend.
 * Запуск: MAILAGENT_API_KEY=… npx playwright test signup-simulate.spec.example.ts
 */
import { test, expect } from "@playwright/test";
import { createMailAgentQa, MailAgentQa } from "@mailagent/qa";

const mail = createMailAgentQa();

test.describe("signup (simulate)", () => {
  test("simulateAndVerify returns OTP", async () => {
    const inbox = await mail.createInbox({
      label: MailAgentQa.runLabel("pw-sim"),
      ttlMinutes: 15,
    });

    try {
      const verification = await mail.simulateAndVerify(inbox.id, {
        otp: "556677",
        subject: "Verify your account (simulated)",
        subjectContains: "simulated",
      });

      expect(verification.otp).toBe("556677");
      expect(verification.primaryLink).toContain("example.com");
    } finally {
      await mail.deleteInbox(inbox.id).catch(() => {});
    }
  });
});
