/**
 * Simulate OTP — no staging mail. Validates MailAgent API key + CI wiring.
 */
import { test, expect } from "@playwright/test";
import { createMailAgentQa, MailAgentQa } from "@mailagent/qa";

const mail = createMailAgentQa();

test.describe("signup (simulate)", () => {
  test("simulateAndVerify returns OTP", async () => {
    const inbox = await mail.createInbox({
      label: MailAgentQa.ciLabel("pilot"),
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
