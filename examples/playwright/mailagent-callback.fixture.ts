/**
 * Playwright: inbox с callbackUrl + ожидание доставки через listCallbackDeliveries.
 * Требует реальное письмо или simulate-inbound --fire-callback в contract.
 */
import { test as base, expect } from "@playwright/test";
import {
  createMailAgentQa,
  MailAgentQa,
  type InboxInfo,
} from "@mailagent/qa";

type Fixtures = {
  mail: MailAgentQa;
  callbackInbox: InboxInfo;
};

export const test = base.extend<Fixtures>({
  mail: async ({}, use) => {
    await use(createMailAgentQa());
  },

  callbackInbox: async ({ mail }, use) => {
    const callbackUrl = process.env.MAILAGENT_CALLBACK_URL;
    if (!callbackUrl) {
      throw new Error("Set MAILAGENT_CALLBACK_URL (HTTPS) for callback tests");
    }
    const inbox = await mail.createInbox({
      label: MailAgentQa.ciLabel("pw-cb"),
      ttlMinutes: 30,
      callbackUrl,
    });
    await use(inbox);
    await mail.deleteInbox(inbox.id).catch(() => {});
  },
});

export { expect };
