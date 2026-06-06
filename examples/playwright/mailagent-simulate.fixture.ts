/**
 * Playwright fixture: inbox + simulateAndVerify — without real SMTP.
 * Usage: import { test, expect } from "./mailagent-simulate.fixture";
 */
import { test as base, expect } from "@playwright/test";
import {
  createMailAgentQa,
  MailAgentQa,
  type InboxInfo,
  type Verification,
} from "@mailagent/qa";

type MailSimFixtures = {
  mail: MailAgentQa;
  testInbox: InboxInfo;
  simulatedVerification: Verification;
};

export const test = base.extend<MailSimFixtures>({
  mail: async ({}, use) => {
    await use(createMailAgentQa());
  },

  testInbox: async ({ mail }, use) => {
    const inbox = await mail.createInbox({
      label: MailAgentQa.ciLabel("pw-sim"),
      ttlMinutes: 15,
    });
    await use(inbox);
    await mail.deleteInbox(inbox.id).catch(() => {});
  },

  simulatedVerification: async ({ mail, testInbox }, use) => {
    const verification = await mail.simulateAndVerify(testInbox.id, {
      otp: "112233",
    });
    await use(verification);
  },
});

export { expect };
