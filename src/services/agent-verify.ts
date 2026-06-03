/** Agent verify: inbox → wait → extract + primaryAction для LLM */
import type { Env } from "../env";
import { parseCallbackUrl } from "../lib/callback-url";
import { buildPrimaryAction, resolveAgentLabel } from "../lib/agent-recipes";
import { resolveExpectFrom } from "../lib/service-presets";
import { primaryLink } from "../services/extract";
import {
  createInbox,
  deleteInbox,
  getInbox,
  type InboxRow,
} from "../services/inbox";
import { waitForFirstMessage, type WaitProgressEvent } from "../services/wait";

export type VerifyInput = {
  inboxId?: string;
  ttlMinutes?: number;
  service?: string;
  expectFrom?: string | string[];
  allowedSenders?: string | string[];
  label?: string;
  callbackUrl?: string;
  subjectContains?: string;
  timeoutSeconds?: number;
  deleteAfter?: boolean;
  runId?: string;
  apiKeyHint: string;
  onProgress?: (event: WaitProgressEvent) => void;
};

function parseLinks(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw as string[];
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as string[];
    } catch {
      return [];
    }
  }
  return [];
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
    inbox = await createInbox(env, {
      ttlMinutes: input.ttlMinutes,
      expectFrom,
      allowedSenders: input.allowedSenders,
      label,
      callbackUrl,
      apiKeyHint: input.apiKeyHint,
    });
  }

  const timeoutSec = Math.min(Number(input.timeoutSeconds ?? 90), 120);
  const message = await waitForFirstMessage(env, inbox.id, timeoutSec, {
    subjectContains: input.subjectContains,
    onProgress: input.onProgress,
  });

  if (!message) {
    const deleteAfter = input.deleteAfter !== false && !input.inboxId;
    if (deleteAfter) {
      await deleteInbox(env, inbox.id, { apiKeyHint: input.apiKeyHint });
    }
    return {
      status: "timeout" as const,
      statusCode: 408 as const,
      email: formatEmail(inbox),
      hint: "No matching email. Check webhook, expectFrom, subjectContains.",
      inboxKept: !deleteAfter,
    };
  }

  const links = parseLinks(message.links_json);
  const verification = {
    otp: message.otp,
    links,
    primaryLink: primaryLink(links),
    from: message.from_addr,
    subject: message.subject,
    messageId: message.id,
    hasRaw: Boolean(message.raw_r2_key),
    ...(message.raw_r2_key
      ? {
          rawUrl: `/v1/inboxes/${inbox.id}/messages/${message.id}/raw`,
        }
      : {}),
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
