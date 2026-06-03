/**
 * Playwright: list + meta вложений через @mailagent/qa.
 * Письмо с вложением: реальный inbound или simulate-inbound --with-attachment=… в CI.
 */
import { test, expect } from "./mailagent.fixture";

test.describe("email attachments", () => {
  test("listAttachments returns metadata after message arrives", async ({
    mail,
    testInbox,
  }) => {
    const messageId = process.env.MAILAGENT_TEST_MESSAGE_ID;
    test.skip(
      !messageId,
      "Set MAILAGENT_TEST_MESSAGE_ID after simulate-inbound or real email"
    );

    const attachments = await mail.listAttachments(testInbox.id, messageId!);
    expect(attachments.length).toBeGreaterThan(0);

    const first = attachments[0];
    expect(first.filename).toBeTruthy();
    expect(first.downloadUrl).toContain("/attachments/");

    const meta = await mail.getAttachmentMeta(
      testInbox.id,
      messageId!,
      first.id
    );
    expect(meta.filename).toBe(first.filename);
    expect(meta.contentType).toBeTruthy();
  });
});
