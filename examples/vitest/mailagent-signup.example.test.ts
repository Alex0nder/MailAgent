/**
 * Vitest + MailAgent — signup OTP without Mailosaur.
 * Run: MAILAGENT_API_KEY=… npx vitest run examples/vitest/mailagent-signup.example.test.ts
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  MailAgentQa,
  MailAgentTimeoutError,
  createMailAgentQa,
  formatAllureAttachment,
} from "@mailagent/qa";

const mail = createMailAgentQa();
const created: string[] = [];

beforeEach(() => {
  if (!process.env.MAILAGENT_API_KEY) {
    throw new Error("Set MAILAGENT_API_KEY");
  }
});

afterEach(async () => {
  for (const id of created.splice(0)) {
    await mail.deleteInbox(id).catch(() => {});
  }
});

describe("signup verification", () => {
  it("creates inbox and surfaces diagnose on timeout", async () => {
    const label = MailAgentQa.runLabel("vitest");
    const inbox = await mail.createInbox({ label, service: "github" });
    created.push(inbox.id);

    try {
      await mail.waitForVerification(inbox.id, {
        timeoutSeconds: 8,
        subjectContains: "__vitest_no_mail__",
      });
      expect.fail("expected timeout");
    } catch (e) {
      expect(e).toBeInstanceOf(MailAgentTimeoutError);
      const err = e as MailAgentTimeoutError;
      expect(err.details?.inboxId).toBe(inbox.id);
      expect(Array.isArray(err.details?.troubleshooting)).toBe(true);

      const ctx = await mail.getDebugContext(inbox.id, {
        subjectContains: "__vitest_no_mail__",
      });
      expect(ctx.debugUiUrl).toContain("debug.html?inbox=");
      expect(ctx.troubleshooting.length).toBeGreaterThan(0);
      // Allure / CI artifact:
      void formatAllureAttachment(ctx);
    }
  });
});
