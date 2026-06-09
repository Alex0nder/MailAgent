/** Playwright fixture — auto-create inbox and cleanup after test */
import { test as base, expect } from "@playwright/test";
import {
  createMailAgentQa,
  MailAgentQa,
  type InboxInfo,
} from "@mailagent/qa";

type MailFixtures = {
  mail: MailAgentQa;
  testInbox: InboxInfo;
};

export const test = base.extend<MailFixtures>({
  mail: async ({}, use) => {
    await use(createMailAgentQa());
  },

  testInbox: async ({ mail }, use) => {
    const inbox = await mail.createInbox({
      label: MailAgentQa.ciLabel("pilot"),
      service: "auth0",
      ttlMinutes: 30,
    });
    await use(inbox);
    await mail.deleteInbox(inbox.id).catch(() => {});
  },
});

export { expect };
