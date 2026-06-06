/** Agent verify: inbox → wait → extract + primaryAction для LLM */
import type { Env } from "../env";
import { parseCallbackUrl } from "../lib/callback-url";
import { buildPrimaryAction, resolveAgentLabel } from "../lib/agent-recipes";
import { resolveExpectFrom } from "../lib/service-presets";
import { countAttachmentsForMessage } from "./message-attachments";
import {
  createInbox,
  deleteInbox,
  getInbox,
  type InboxRow,
} from "./inbox";
import { formatMessageVerification } from "./message-verify";
import {
  buildWaitTimeoutDebug,
  waitForMessage,
  type WaitProgressEvent,
} from "./wait";

export type VerifyInput = {
  inboxId?: string;
  ttlMinutes?: number;
  service?: string;
  expectFrom?: string | string[];
  allowedSenders?: string | string[];
  label?: string;
  callbackUrl?: string;
  subjectContains?: string;
  messageIndex?: number;
  timeoutSeconds?: number;
  deleteAfter?: boolean;
  runId?: string;
  apiKeyHint: string;
  teamId?: string | null;
  username?: string;
  domainId?: string;
  onProgress?: (event: WaitProgressEvent) => void;
};

export async function runAgentVerify(env: Env, input: VerifyInput) {
  const callbackUrl = parseCallbackUrl(input.callbackUrl);
  if (input.callbackUrl && !callbackUrl) {
    return { error: "invalid_callback_url" as const, status: 400 as const };
  }

  const expectFrom = resolveExpectFrom(input.service, input.expectFrom);
  const label = resolveAgentLabel({
    label: input.label,
    runId: input.runId,
  });
  let inbox: InboxRow;

  if (input.inboxId) {
    const existing = await getInbox(env, input.inboxId, {
      apiKeyHint: input.apiKeyHint,
    });
    if (!existing) {
      return { error: "inbox_not_found" as const, status: 404 as const };
    }
    inbox = existing;
  } else {
    const created = await createInbox(env, {
      ttlMinutes: input.ttlMinutes,
      expectFrom,
      allowedSenders: input.allowedSenders,
      label,
      callbackUrl,
      apiKeyHint: input.apiKeyHint,
      teamId: input.teamId ?? null,
      username: input.username,
      domainId: input.domainId,
    });
    if ("error" in created) {
      return { error: created.error, status: 400 as const };
    }
    inbox = created;
  }

  const timeoutSec = Math.min(Number(input.timeoutSeconds ?? 90), 120);
  const messageIndex = Math.max(0, Math.floor(Number(input.messageIndex ?? 0)));
  const waitOpts = {
    subjectContains: input.subjectContains,
    messageIndex,
    onProgress: input.onProgress,
  };
  const message = await waitForMessage(env, inbox.id, timeoutSec, waitOpts);

  if (!message) {
    const deleteAfter = input.deleteAfter !== false && !input.inboxId;
    if (deleteAfter) {
      await deleteInbox(env, inbox.id, { apiKeyHint: input.apiKeyHint });
    }
    const debug = await buildWaitTimeoutDebug(env, inbox.id, waitOpts);
    return {
      status: "timeout" as const,
      statusCode: 408 as const,
      email: formatEmail(inbox),
      ...debug,
      inboxKept: !deleteAfter,
    };
  }

  const attachmentCount = await countAttachmentsForMessage(env, message.id);
  const verification = {
    ...formatMessageVerification(message, inbox.id),
    attachmentCount,
    hasAttachments: attachmentCount > 0,
  };

  const deleted =
    input.deleteAfter !== false &&
    (input.inboxId ? input.deleteAfter === true : true);
  if (deleted) {
    await deleteInbox(env, inbox.id, { apiKeyHint: input.apiKeyHint });
  }

  return {
    status: "verified" as const,
    statusCode: 200 as const,
    email: formatEmail(inbox),
    verification,
    agent: {
      primaryAction: buildPrimaryAction(verification),
      service: input.service ?? null,
    },
    deleted,
  };
}

function formatEmail(inbox: InboxRow) {
  return {
    inboxId: inbox.id,
    address: inbox.address,
    expiresAt: inbox.expires_at,
    allowedSenders: inbox.allowed_senders,
    label: inbox.label,
  };
}
