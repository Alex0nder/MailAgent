/** Inbound threading: In-Reply-To, References, Re: subject fallback */
import type { Env } from "../env";
import { findMessageForThreading, type MessageRow } from "./inbox";

export type InboundThreadInput = {
  inboxId: string;
  subject: string;
  inReplyTo?: string | null;
  references?: string | null;
  headers?: Record<string, string | string[] | undefined> | null;
};

export type ResolvedThread = {
  threadId: string;
  inReplyToMessageId: string | null;
  rfcMessageId: string | null;
};

/** Parse Message-ID / References / In-Reply-To values into normalized ids */
export function parseMessageIdList(raw: string | null | undefined): string[] {
  if (!raw?.trim()) return [];
  const matches = raw.match(/<[^>]+>|[^\s,<>]+@[^\s,<>]+/g) ?? [];
  const ids: string[] = [];
  for (const m of matches) {
    const id = normalizeMessageId(m);
    if (id) ids.push(id);
  }
  return [...new Set(ids)];
}

export function normalizeMessageId(raw: string): string {
  const t = raw.trim();
  if (t.startsWith("<") && t.endsWith(">")) return t.slice(1, -1);
  return t;
}

/** Strip Re:/Fwd: prefixes for subject-based thread fallback */
export function normalizeSubject(subject: string): string {
  let s = subject.trim();
  for (let i = 0; i < 5; i++) {
    const next = s.replace(/^(re|fwd|fw):\s*/i, "").trim();
    if (next === s) break;
    s = next;
  }
  return s.toLowerCase();
}

function headerValue(
  headers: Record<string, string | string[] | undefined> | null | undefined,
  name: string
): string | null {
  if (!headers) return null;
  const key = Object.keys(headers).find(
    (k) => k.toLowerCase() === name.toLowerCase()
  );
  if (!key) return null;
  const v = headers[key];
  if (Array.isArray(v)) return v.join(" ");
  return typeof v === "string" ? v : null;
}

export function readInboundHeaders(email: unknown): {
  messageId: string | null;
  inReplyTo: string | null;
  references: string | null;
} {
  if (!email || typeof email !== "object") {
    return { messageId: null, inReplyTo: null, references: null };
  }
  const e = email as Record<string, unknown>;
  const headers =
    e.headers && typeof e.headers === "object"
      ? (e.headers as Record<string, string | string[] | undefined>)
      : null;

  const messageId =
    headerValue(headers, "Message-ID") ??
    headerValue(headers, "Message-Id") ??
    (typeof e.message_id === "string" ? e.message_id : null);

  const inReplyTo =
    headerValue(headers, "In-Reply-To") ??
    (typeof e.in_reply_to === "string" ? e.in_reply_to : null);

  const references =
    headerValue(headers, "References") ??
    (typeof e.references === "string" ? e.references : null);

  return { messageId, inReplyTo, references };
}

export async function resolveInboundThread(
  env: Env,
  input: InboundThreadInput,
  newMessageId: string
): Promise<ResolvedThread> {
  const inReplyRaw =
    input.inReplyTo ?? headerValue(input.headers ?? null, "In-Reply-To");
  const refsRaw =
    input.references ?? headerValue(input.headers ?? null, "References");

  const refIds = [
    ...parseMessageIdList(inReplyRaw),
    ...parseMessageIdList(refsRaw),
  ];

  let parent: MessageRow | null = null;
  if (refIds.length) {
    parent = await findMessageForThreading(env, input.inboxId, refIds);
  }

  if (!parent && /^(re|fwd|fw):/i.test(input.subject.trim())) {
    const norm = normalizeSubject(input.subject);
    if (norm) {
      parent = await findMessageBySubjectNorm(env, input.inboxId, norm);
    }
  }

  const rfcRaw =
    headerValue(input.headers ?? null, "Message-ID") ??
    headerValue(input.headers ?? null, "Message-Id");
  const rfcMessageId = rfcRaw
    ? normalizeMessageId(parseMessageIdList(rfcRaw)[0] ?? rfcRaw)
    : null;

  if (parent) {
    return {
      threadId: parent.thread_id ?? parent.id,
      inReplyToMessageId: parent.id,
      rfcMessageId,
    };
  }

  return {
    threadId: newMessageId,
    inReplyToMessageId: null,
    rfcMessageId,
  };
}

async function findMessageBySubjectNorm(
  env: Env,
  inboxId: string,
  normalizedSubject: string
): Promise<MessageRow | null> {
  const { getDb } = await import("../db/client");
  const sql = getDb(env);
  const rows = (await sql`
    SELECT id, inbox_id, provider_id, from_addr, subject,
           text_preview, html_preview, otp, links_json, received_at,
           raw_r2_key, direction, thread_id, in_reply_to, to_addrs, rfc_message_id
    FROM messages
    WHERE inbox_id = ${inboxId}
    ORDER BY received_at DESC
    LIMIT 50
  `) as MessageRow[];

  for (const row of rows) {
    if (normalizeSubject(row.subject) === normalizedSubject) {
      return row;
    }
  }
  return null;
}
