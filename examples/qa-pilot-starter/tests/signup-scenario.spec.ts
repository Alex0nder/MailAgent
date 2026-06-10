/**
 * Simulate scenario preset — magic_link body without hand-written HTML.
 */
import { test, expect } from "@playwright/test";
import { createMailAgentQa, MailAgentQa } from "@mailagent/qa";

const mail = createMailAgentQa();

test.describe("signup (scenario)", () => {
  test("magic_link scenario returns primaryLink", async () => {
    const inbox = await mail.createInbox({
      label: MailAgentQa.ciLabel("pilot-scenario"),
      ttlMinutes: 15,
    });

    try {
      const verification = await mail.simulateAndVerify(inbox.id, {
        scenario: "magic_link",
        subjectContains: "Verify your email",
        timeoutSeconds: 30,
      });

      expect(verification.primaryLink).toMatch(/^https?:\/\//);
    } finally {
      await mail.deleteInbox(inbox.id).catch(() => {});
    }
  });
});
