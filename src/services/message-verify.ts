/** Verification format for REST, callback, agent */
import { primaryLink } from "./extract";
import type { MessageRow } from "./inbox";

export type MessageVerification = {
  otp: string | null;
  links: string[];
  primaryLink: string | null;
  from: string;
  subject: string;
  messageId: string;
  hasRaw?: boolean;
  rawUrl?: string;
};

export function formatMessageVerification(
  row: MessageRow,
  inboxId?: string
): MessageVerification {
  const links = parseLinks(row.links_json);
  return {
    otp: row.otp,
    links,
    primaryLink: primaryLink(links),
    from: row.from_addr,
    subject: row.subject,
    messageId: row.id,
    hasRaw: Boolean(row.raw_r2_key),
    ...(row.raw_r2_key && inboxId
      ? { rawUrl: `/v1/inboxes/${inboxId}/messages/${row.id}/raw` }
      : {}),
  };
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
