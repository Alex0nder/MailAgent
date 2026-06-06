/**
 * Jest + MailAgent — signup OTP для команд на Jest (не Vitest/Playwright).
 * Запуск: MAILAGENT_API_KEY=… npx jest examples/jest/mailagent-signup.example.test.js
 */
const {
  MailAgentQa,
  MailAgentTimeoutError,
  createMailAgentQa,
  formatAllureAttachment,
} = require("@mailagent/qa");

const mail = createMailAgentQa();
const created = [];

afterEach(async () => {
  for (const id of created.splice(0)) {
    await mail.deleteInbox(id).catch(() => {});
  }
});

beforeAll(() => {
  if (!process.env.MAILAGENT_API_KEY) {
    throw new Error("Set MAILAGENT_API_KEY");
  }
});

describe("signup verification", () => {
  it("surfaces diagnose context on wait timeout", async () => {
    const label = MailAgentQa.runLabel("jest");
    const inbox = await mail.createInbox({ label, service: "github" });
    created.push(inbox.id);

    await expect(
      mail.waitForVerification(inbox.id, {
        timeoutSeconds: 8,
        subjectContains: "__jest_no_mail__",
      })
    ).rejects.toBeInstanceOf(MailAgentTimeoutError);

    const ctx = await mail.getDebugContext(inbox.id, {
      subjectContains: "__jest_no_mail__",
    });
    expect(ctx.debugUiUrl).toMatch(/debug\.html\?inbox=/);
    expect(ctx.troubleshooting.length).toBeGreaterThan(0);
    expect(formatAllureAttachment(ctx).body).toContain(ctx.inboxId);
  });
});
