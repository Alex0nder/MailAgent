/**
 * Playwright: attachments after globalSetup (simulate) or MAILAGENT_TEST_MESSAGE_ID.
 */
import { test, expect } from "@playwright/test";
import { createMailAgentQa } from "@mailagent/qa";
import { loadMailAgentContext } from "./mailagent-context";

const mail = createMailAgentQa();

test.describe("email attachments", () => {
  test.afterAll(async () => {
    const ctx = loadMailAgentContext();
    if (ctx?.inboxId) {
      await mail.deleteInbox(ctx.inboxId).catch(() => {});
    }
  });

  test("listAttachments returns metadata", async () => {
    const ctx = loadMailAgentContext();
    const messageId = ctx?.messageId ?? process.env.MAILAGENT_TEST_MESSAGE_ID;
    const inboxId = ctx?.inboxId ?? process.env.MAILAGENT_TEST_INBOX_ID;

    test.skip(
      !messageId || !inboxId,
      "Run: npm run test:pw:setup (needs DATABASE_URL) or set MAILAGENT_TEST_* env"
    );

    const attachments = await mail.listAttachments(inboxId!, messageId!);
    expect(attachments.length).toBeGreaterThan(0);

    const first = attachments[0];
    expect(first.filename).toBeTruthy();
    if (ctx?.attachmentFilename) {
      expect(first.filename).toBe(ctx.attachmentFilename);
    }
    expect(first.downloadUrl).toContain("/attachments/");

    const meta = await mail.getAttachmentMeta(inboxId!, messageId!, first.id);
    expect(meta.filename).toBe(first.filename);
    expect(meta.contentType).toBeTruthy();
  });
});
