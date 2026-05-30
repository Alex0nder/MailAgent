import { Resend } from "resend";
import type { Env } from "../env";
import { isSenderAllowed } from "../lib/sender-allowlist";
import {
  buildPreviewText,
  extractLinks,
  extractOtp,
  primaryLink,
} from "./extract";
import { fireInboxCallback } from "./callback";
import {
  findInboxByAddress,
  insertMessage,
  type InboxRow,
  type MessageRow,
} from "./inbox";
import type { EmailQueueMessage, MessageNotifyPayload } from "../env";

export function createResendClient(env: Env) {
  return new Resend(env.RESEND_API_KEY);
}

/** Обработка письма из очереди: fetch body, extract, save, notify DO */
export async function processInboundEmail(
  env: Env,
  job: EmailQueueMessage,
  notify: (
    inbox: InboxRow,
    payload: MessageNotifyPayload
  ) => Promise<void>
): Promise<void> {
  const resend = createResendClient(env);

  let inbox = null;
  for (const rawTo of job.to) {
    inbox = await findInboxByAddress(env, rawTo);
    if (inbox) break;
  }
  if (!inbox) return;

  if (!isSenderAllowed(job.from, inbox.allowed_senders)) {
    return;
  }

  const { data: email, error } = await resend.emails.receiving.get(job.emailId);
  if (error || !email) {
    throw new Error(error?.message ?? "receiving.get failed");
  }

  const text = email.text ?? "";
  const html = email.html ?? "";
  const combined = `${text}\n${html}`;
  const otp = extractOtp(combined);
  const links = extractLinks(combined);

  const row = await insertMessage(env, {
    inboxId: inbox.id,
    providerId: job.emailId,
    from: job.from,
    subject: job.subject,
    textPreview: buildPreviewText(text),
    htmlPreview: buildPreviewText(html, 4000),
    otp,
    links,
  });

  if (!row) return;

  const payload = toNotifyPayload(row);
  await notify(inbox, payload);

  if (inbox.callback_url) {
    await fireInboxCallback(inbox.callback_url, {
      ...payload,
      address: inbox.address,
      label: inbox.label,
    });
  }
}

function toNotifyPayload(row: MessageRow): MessageNotifyPayload {
  const links = Array.isArray(row.links_json)
    ? row.links_json
    : (JSON.parse(String(row.links_json)) as string[]);
  return {
    id: row.id,
    inboxId: row.inbox_id,
    from: row.from_addr,
    subject: row.subject,
    otp: row.otp,
    links,
    primaryLink: primaryLink(links),
    receivedAt: row.received_at,
  };
}
