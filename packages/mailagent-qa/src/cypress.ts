/**
 * Cypress node tasks для MailAgent — подключение в cypress.config.
 */
import {
  createMailAgentQa,
  MailAgentQa,
  type CallbackDelivery,
  type CreateInboxOptions,
  type MailAgentQaConfig,
  type OpenInboxOptions,
  type Verification,
} from "./index.js";

export type MailAgentCypressTasks = {
  mailagentRunLabel: (prefix?: string) => string;
  mailagentCreateInbox: (options?: CreateInboxOptions) => Promise<{ id: string; address: string; label?: string | null }>;
  mailagentOpen: (options?: OpenInboxOptions) => Promise<{
    inboxId: string;
    address: string;
    verification: Verification;
  }>;
  mailagentWaitVerification: (args: {
    inboxId: string;
    timeoutSeconds?: number;
    subjectContains?: string;
  }) => Promise<Verification>;
  mailagentWaitWithRetry: (args: {
    inboxId: string;
    timeoutSeconds?: number;
    subjectContains?: string;
    messageIndex?: number;
    retries?: number;
  }) => Promise<Verification>;
  mailagentWaitCallback: (args: {
    inboxId: string;
    timeoutSeconds?: number;
    pollIntervalMs?: number;
    callbackIndex?: number;
  }) => Promise<{ delivery: CallbackDelivery; verification: Verification }>;
  mailagentDeleteInbox: (inboxId: string) => Promise<null>;
  mailagentCleanupRun: (runId: string) => Promise<{ deleted: number; ids: string[] }>;
};

/** Зарегистрировать tasks: on('task', createMailAgentCypressTasks()) */
export function createMailAgentCypressTasks(
  config?: Partial<MailAgentQaConfig>
): MailAgentCypressTasks {
  const mail = createMailAgentQa(config);

  return {
    mailagentRunLabel(prefix = "cy") {
      return MailAgentQa.runLabel(prefix);
    },

    async mailagentCreateInbox(options = {}) {
      return mail.createInbox(options);
    },

    async mailagentOpen(options = {}) {
      const r = await mail.open(options);
      return {
        inboxId: r.inboxId,
        address: r.address,
        verification: r.verification,
      };
    },

    async mailagentWaitVerification({ inboxId, ...opts }) {
      return mail.waitForVerification(inboxId, opts);
    },

    async mailagentWaitWithRetry(args: {
      inboxId: string;
      timeoutSeconds?: number;
      subjectContains?: string;
      messageIndex?: number;
      retries?: number;
    }) {
      const { inboxId, retries, ...opts } = args;
      return mail.waitWithRetry(inboxId, opts, retries ?? 3);
    },

    async mailagentWaitCallback(args: {
      inboxId: string;
      timeoutSeconds?: number;
      pollIntervalMs?: number;
      callbackIndex?: number;
    }) {
      return mail.waitForCallback(args.inboxId, args);
    },

    async mailagentDeleteInbox(inboxId) {
      await mail.deleteInbox(inboxId);
      return null;
    },

    async mailagentCleanupRun(runId) {
      return mail.cleanupRun(runId);
    },
  };
}
