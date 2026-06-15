/**
 * Allure: on test failure attach MailAgent debug (inbox + messages).
 */
import { test } from "@playwright/test";
import {
  createMailAgentQa,
  formatFailureArtifactAttachment,
  MailAgentTimeoutError,
  writeFailureArtifact,
} from "@mailagent/qa";

const mail = createMailAgentQa();

test.afterEach(async ({}, testInfo) => {
  const inboxId = testInfo.annotations.find((a) => a.type === "mailagent-inbox")?.description;
  if (!inboxId || testInfo.status === "passed") return;

  const ctx = await mail.getDebugContext(inboxId);
  const att = formatFailureArtifactAttachment(ctx, {
    testName: testInfo.title,
    runId: process.env.GITHUB_RUN_ID,
  });
  await testInfo.attach(att.name, { body: att.body, contentType: att.contentType });
  await writeFailureArtifact(ctx, {
    testName: testInfo.title,
    runId: process.env.GITHUB_RUN_ID,
    writeGitHubStepSummary: true,
  });
});

test("signup with retry", async ({ page }) => {
  const inbox = await mail.createInbox({
    label: mail.runLabel("ci"),
    service: "auth0",
  });
  test.info().annotations.push({ type: "mailagent-inbox", description: inbox.id });

  await page.goto("/signup");
  await page.fill('[name=email]', inbox.address);
  await page.click('button[type=submit]');

  try {
    const v = await mail.waitWithRetry(inbox.id, { subjectContains: "verify" }, 3);
    if (v.otp) await page.fill('[name=code]', v.otp);
  } catch (e) {
    if (e instanceof MailAgentTimeoutError) {
      console.error(e.details?.debugUiUrl);
    }
    throw e;
  }
});
