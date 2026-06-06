/** QA/dev: вставка тестового письма без Resend (обходит allowlist ingest) */
import { nanoid } from "nanoid";
import type { Env, MessageNotifyPayload } from "../env";
import { primaryLink } from "./extract";
import { getInbox, insertMessage, type MessageRow } from "./inbox";
import { fireInboxCallback } from "./callback";
import { formatMessageVerification } from "./message-verify";
import { getDb } from "../db/client";

export type SimulateInboundInput = {
  inboxId: string;
  apiKeyHint?: string;
  otp?: string;
  from?: string;
  subject?: string;
  fireCallback?: boolean;
  attachmentFilename?: string;
};

export type SimulateInboundResult = {
  inboxId: string;
  messageId: string;
  address: string;
  otp: string;
  subject: string;
  attachmentId?: string;
  callback?: { ok: boolean; statusCode: number | null };
};

export async function simulateInboundMessage(
  env: Env,
  input: SimulateInboundInput
): Promise<SimulateInboundResult | null> {
  const inbox = await getInbox(env, input.inboxId, {
    apiKeyHint: input.apiKeyHint,
  });
  if (!inbox) return null;

  const otp = input.otp?.trim() || "482910";
  const from = input.from?.trim() || "qa-simulate@mailagent.test";
  const subject = input.subject?.trim() || "MailAgent simulated OTP";
  const links = ["https://example.com/verify?token=simulated"];
  const messageId = nanoid(16);
  const providerId = `sim_${nanoid(12)}`;

  const row = await insertMessage(env, {
    id: messageId,
    inboxId: inbox.id,
    providerId,
    from,
    subject,
    textPreview: `Your verification code is ${otp}`,
    htmlPreview: null,
    otp,
    links,
    threadId: messageId,
  });
  if (!row) return null;

  let attachmentId: string | undefined;
  if (input.attachmentFilename?.trim()) {
    attachmentId = await insertSimulatedAttachment(
      env,
      row.id,
      input.attachmentFilename.trim()
    );
  }

  const payload = toNotifyPayload(row, inbox.id);
  await notifyInboxWaiters(env, inbox.id, payload);

  let callback: SimulateInboundResult["callback"];
  if (input.fireCallback && inbox.callback_url) {
    callback = await fireInboxCallback(env, {
      inboxId: inbox.id,
      messageId: row.id,
      callbackUrl: inbox.callback_url,
      payload: {
        ...payload,
        address: inbox.address,
        label: inbox.label,
      },
    });
  }

  return {
    inboxId: inbox.id,
    messageId: row.id,
    address: inbox.address,
    otp,
    subject,
    ...(attachmentId ? { attachmentId } : {}),
    ...(callback ? { callback } : {}),
  };
}

async function insertSimulatedAttachment(
  env: Env,
  messageId: string,
  filename: string
): Promise<string> {
  const sql = getDb(env);
  const id = nanoid(12);
  const providerId = `sim_att_${nanoid(8)}`;
  await sql`
    INSERT INTO message_attachments (
      id, message_id, provider_id, filename, content_type, size_bytes
    ) VALUES (
      ${id}, ${messageId}, ${providerId}, ${filename},
      ${"application/pdf"}, ${1024}
    )
  `;
  return id;
}

function toNotifyPayload(row: MessageRow, inboxId: string): MessageNotifyPayload {
  const links = parseLinks(row.links_json);
  return {
    id: row.id,
    inboxId: row.inbox_id,
    from: row.from_addr,
    subject: row.subject,
    otp: row.otp,
    links,
    primaryLink: primaryLink(links),
    receivedAt: row.received_at,
    verification: formatMessageVerification(row, inboxId),
  };
}

async function notifyInboxWaiters(
  env: Env,
  inboxId: string,
  payload: MessageNotifyPayload
): Promise<void> {
  const id = env.INBOX_WAIT.idFromName(inboxId);
  const stub = env.INBOX_WAIT.get(id);
  await stub.fetch("http://do/notify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
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
