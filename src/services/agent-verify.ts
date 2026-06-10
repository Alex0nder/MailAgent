/** Agent verify: inbox → wait → extract + primaryAction for LLM */
import type { Env } from "../env";
import { parseCallbackUrl } from "../lib/callback-url";
import { buildPrimaryAction, resolveAgentLabel } from "../lib/agent-recipes";
import { debugUiUrl } from "./inbox-diagnose";
import {
  resolveExpectFrom,
  resolveSubjectHint,
  resolveTtlMinutes,
} from "../lib/service-presets";
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
import {
  recordVerifyRunSession,
  sessionOwnerKey,
  getAgentRunSession,
  type AgentRunSession,
} from "./agent-run-session";
import { validateRunId } from "../lib/validate-run-id";

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
  apiBaseUrl?: string;
};

async function attachRunSession<T extends Record<string, unknown>>(
  env: Env,
  input: VerifyInput,
  result: T
): Promise<T & { session?: AgentRunSession }> {
  if (!input.runId || !validateRunId(input.runId)) return result;
  const session = await getAgentRunSession(
    env,
    input.runId,
    sessionOwnerKey(input.teamId, input.apiKeyHint)
  );
  return session ? { ...result, session } : result;
}

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
      ttlMinutes: resolveTtlMinutes(input.service, input.ttlMinutes),
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
  const subjectContains =
    input.subjectContains?.trim() || resolveSubjectHint(input.service);
  const waitOpts = {
    subjectContains,
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
    const apiBase = input.apiBaseUrl ?? "https://api.webmailagent.com";
    const timeoutResult = {
      status: "timeout" as const,
      statusCode: 408 as const,
      email: formatEmail(inbox),
      ...debug,
      debugUiUrl: debugUiUrl(apiBase, inbox.id),
      suggestedSubjectContains: resolveSubjectHint(input.service) ?? null,
      inboxKept: !deleteAfter,
    };
    await recordVerifyRunSession(
      env,
      input.runId,
      sessionOwnerKey(input.teamId, input.apiKeyHint),
      input.service,
      { status: "timeout", email: { inboxId: inbox.id } }
    );
    return await attachRunSession(env, input, timeoutResult);
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

  const verifiedResult = {
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
  await recordVerifyRunSession(
    env,
    input.runId,
    sessionOwnerKey(input.teamId, input.apiKeyHint),
    input.service,
    {
      status: "verified",
      email: { inboxId: inbox.id },
      verification: {
        otp: verification.otp ?? null,
        primaryLink: verification.primaryLink ?? null,
      },
    }
  );
  return await attachRunSession(env, input, verifiedResult);
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
