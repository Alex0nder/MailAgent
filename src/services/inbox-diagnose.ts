/** Diagnose inbox — messages, callbacks, troubleshooting (QA + agents) */
import type { Env } from "../env";
import { listCallbackDeliveries } from "./callback-log";
import { getInbox, listMessages } from "./inbox";
import { primaryLink } from "./extract";
import { buildWaitTimeoutDebug } from "./wait";

export type InboxDiagnoseOptions = {
  subjectContains?: string;
  messageIndex?: number;
  apiBaseUrl: string;
};

export type InboxDiagnoseResult = {
  inboxId: string;
  address: string;
  label: string | null;
  expiresAt: string;
  callbackUrl: string | null;
  messageCount: number;
  messages: Array<{
    id: string;
    from: string;
    subject: string;
    otp: string | null;
    primaryLink: string | null;
    receivedAt: string;
    hasRaw: boolean;
    rawUrl?: string;
    attachmentCount?: number;
  }>;
  callbacks: Array<{
    id: string;
    callbackUrl: string;
    messageId: string | null;
    statusCode: number | null;
    ok: boolean;
    error: string | null;
    durationMs: number | null;
    createdAt: string;
  }>;
  waitDebug: Awaited<ReturnType<typeof buildWaitTimeoutDebug>>;
  troubleshooting: string[];
  debugUiUrl: string;
  apiMessagesUrl: string;
};

export async function buildInboxDiagnose(
  env: Env,
  inboxId: string,
  options: InboxDiagnoseOptions
): Promise<InboxDiagnoseResult | null> {
  const inbox = await getInbox(env, inboxId);
  if (!inbox) return null;

  const subjectContains = options.subjectContains?.trim();
  const messageIndex = Math.max(0, Math.floor(options.messageIndex ?? 0));
  const waitOpts = { subjectContains, messageIndex };

  const [allMessages, filteredMessages, callbacks, waitDebug] = await Promise.all([
    listMessages(env, inboxId, {}),
    subjectContains
      ? listMessages(env, inboxId, { subjectContains })
      : listMessages(env, inboxId, {}),
    listCallbackDeliveries(env, inboxId, 20),
    buildWaitTimeoutDebug(env, inboxId, waitOpts),
  ]);

  const messages = allMessages.map((m) => {
    const links = parseLinks(m.links_json);
    return {
      id: m.id,
      from: m.from_addr,
      subject: m.subject,
      otp: m.otp,
      primaryLink: primaryLink(links),
      receivedAt: m.received_at,
      hasRaw: Boolean(m.raw_r2_key),
      ...(m.raw_r2_key
        ? { rawUrl: `/v1/inboxes/${inboxId}/messages/${m.id}/raw` }
        : {}),
    };
  });

  const troubleshooting = buildTroubleshooting({
    subjectContains,
    messageIndex,
    messageCount: allMessages.length,
    matchingCount: subjectContains ? filteredMessages.length : allMessages.length,
    callbacks,
    waitHint: waitDebug.hint,
  });

  const base = options.apiBaseUrl.replace(/\/$/, "");

  return {
    inboxId: inbox.id,
    address: inbox.address,
    label: inbox.label,
    expiresAt: inbox.expires_at,
    callbackUrl: inbox.callback_url,
    messageCount: allMessages.length,
    messages,
    callbacks: callbacks.map((row) => ({
      id: row.id,
      callbackUrl: row.callback_url,
      messageId: row.message_id,
      statusCode: row.status_code,
      ok: row.ok,
      error: row.error_text,
      durationMs: row.duration_ms,
      createdAt: row.created_at,
    })),
    waitDebug,
    troubleshooting,
    debugUiUrl: debugUiUrl(base, inboxId),
    apiMessagesUrl: `${base}/v1/inboxes/${inboxId}/messages`,
  };
}

function buildTroubleshooting(input: {
  subjectContains?: string;
  messageIndex: number;
  messageCount: number;
  matchingCount: number;
  callbacks: Awaited<ReturnType<typeof listCallbackDeliveries>>;
  waitHint: string;
}): string[] {
  const steps: string[] = [input.waitHint];

  if (!input.messageCount) {
    steps.push(
      "0 messages: check Resend webhook POST /webhooks/resend and that staging sends mail."
    );
    steps.push("Check service / expectFrom allowlist (GET /v1 for presets).");
  } else if (input.subjectContains) {
    steps.push(
      `${input.messageCount} message(s), subjectContains="${input.subjectContains}", messageIndex=${input.messageIndex}.`
    );
    if (input.messageIndex > 0) {
      steps.push("Welcome + verify: use messageIndex=1 for the second email.");
    }
  } else if (input.messageIndex > 0 && input.messageCount <= input.messageIndex) {
    steps.push(
      `Need messageIndex=${input.messageIndex}, but only ${input.messageCount} message(s).`
    );
  }

  const failedCb = input.callbacks.filter((d) => !d.ok);
  if (failedCb.length) {
    steps.push(
      `Callback failed (${failedCb.length}): status ${failedCb.map((d) => d.status_code).join(", ")} — see GET …/callbacks.`
    );
  } else if (input.callbacks.length) {
    steps.push(`Callbacks OK (${input.callbacks.length} delivery log entries).`);
  }

  steps.push("Open debugUiUrl or GET /v1/inboxes?label=… for related inboxes.");
  return steps;
}

export function debugUiUrl(apiBase: string, inboxId: string): string {
  const base = apiBase.replace(/\/$/, "");
  if (base.includes("://api.")) {
    return `${base.replace("://api.", "://")}/debug.html?inbox=${encodeURIComponent(inboxId)}`;
  }
  if (base.includes("workers.dev") || base.includes("localhost") || base.includes("127.0.0.1")) {
    return `${base}/debug.html?inbox=${encodeURIComponent(inboxId)}`;
  }
  return `https://webmailagent.com/debug.html?inbox=${encodeURIComponent(inboxId)}`;
}

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
