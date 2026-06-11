import { nanoid } from "nanoid";
import { purgeRawMimeForInboxes } from "./raw-mime-r2";
import { purgeAttachmentR2ForInboxes } from "./message-attachments";
import type { Env } from "../env";
import { getDb } from "../db/client";
import { normalizeAllowedSenders } from "../lib/sender-allowlist";
import {
  getDomainForInbox,
  sanitizeInboxLocalPart,
} from "./domains";

export interface InboxRow {
  id: string;
  address: string;
  expires_at: string;
  created_at: string;
  allowed_senders: string[];
  label: string | null;
  callback_url: string | null;
  notify_email: string | null;
  notify_mode: string | null;
  api_key_hint: string | null;
  domain_id?: string | null;
}

export interface MessageRow {
  id: string;
  inbox_id: string;
  provider_id: string;
  from_addr: string;
  subject: string;
  text_preview: string | null;
  html_preview: string | null;
  otp: string | null;
  links_json: string[];
  received_at: string;
  raw_r2_key: string | null;
  direction?: string;
  thread_id?: string | null;
  in_reply_to?: string | null;
  to_addrs?: string[] | unknown;
  rfc_message_id?: string | null;
}

export async function createInbox(
  env: Env,
  options?: {
    ttlMinutes?: number;
    expectFrom?: string | string[];
    allowedSenders?: string | string[];
    label?: string;
    callbackUrl?: string | null;
    notifyEmail?: string | null;
    notifyMode?: string | null;
    apiKeyHint?: string;
    teamId?: string | null;
    username?: string;
    domainId?: string;
  }
): Promise<
  | InboxRow
  | { error: "domain_not_found" | "domain_not_verified" | "username_requires_domain" }
> {
  const sql = getDb(env);
  const ttl = options?.ttlMinutes ?? (Number(env.DEFAULT_TTL_MINUTES) || 30);
  const allowed = normalizeAllowedSenders(
    options?.allowedSenders ?? options?.expectFrom
  );
  const label = options?.label?.trim().slice(0, 128) || null;
  const callbackUrl = options?.callbackUrl ?? null;
  const notifyEmail = options?.notifyEmail ?? null;
  const notifyMode = notifyEmail
    ? (options?.notifyMode ?? "verification")
    : (options?.notifyMode ?? "off");
  const apiKeyHint = options?.apiKeyHint?.slice(0, 16) ?? null;
  const id = nanoid(12);

  let address: string;
  let domainId: string | null = null;

  if (options?.domainId) {
    const domain = await getDomainForInbox(env, options.domainId, {
      teamId: options.teamId ?? null,
      apiKeyHint: apiKeyHint ?? "",
    });
    if (!domain) return { error: "domain_not_found" };
    if (domain.status !== "verified") return { error: "domain_not_verified" };
    const local = sanitizeInboxLocalPart(options.username, `inbox-${id}`);
    address = `${local}@${domain.name}`;
    domainId = domain.id;
  } else {
    if (options?.username?.trim()) {
      return { error: "username_requires_domain" };
    }
    address = `${`inbox-${id}`}@${env.INBOX_DOMAIN}`;
  }

  const expiresAt = new Date(Date.now() + ttl * 60_000).toISOString();

  await sql`
    INSERT INTO inboxes (
      id, address, expires_at, allowed_senders, label, callback_url,
      notify_email, notify_mode, api_key_hint, domain_id
    )
    VALUES (
      ${id}, ${address}, ${expiresAt}, ${allowed}, ${label}, ${callbackUrl},
      ${notifyEmail}, ${notifyMode}, ${apiKeyHint}, ${domainId}
    )
  `;

  return {
    id,
    address,
    expires_at: expiresAt,
    created_at: new Date().toISOString(),
    allowed_senders: allowed,
    label,
    callback_url: callbackUrl,
    notify_email: notifyEmail,
    notify_mode: notifyMode,
    api_key_hint: apiKeyHint,
    domain_id: domainId,
  };
}

export function isCreateInboxError(
  result: Awaited<ReturnType<typeof createInbox>>
): result is {
  error: "domain_not_found" | "domain_not_verified" | "username_requires_domain";
} {
  return "error" in result;
}

/** QA: find run inbox (debug after test failure) */
export async function listInboxes(
  env: Env,
  options?: {
    label?: string;
    labelPrefix?: string;
    limit?: number;
    apiKeyHint?: string;
  }
): Promise<InboxRow[]> {
  const sql = getDb(env);
  const limit = Math.min(options?.limit ?? 20, 50);
  const label = options?.label?.trim();
  const labelPrefix = options?.labelPrefix?.trim().slice(0, 64);
  const hint = options?.apiKeyHint;

  if (labelPrefix && labelPrefix.length >= 3) {
    const pattern = `${labelPrefix}%`;
    const rows = hint
      ? ((await sql`
          SELECT id, address, expires_at, created_at, allowed_senders, label, callback_url, notify_email, notify_mode, api_key_hint, domain_id
          FROM inboxes
          WHERE label LIKE ${pattern}
            AND expires_at > NOW()
            AND (api_key_hint IS NULL OR api_key_hint = ${hint})
          ORDER BY created_at DESC
          LIMIT ${limit}
        `) as InboxRow[])
      : ((await sql`
          SELECT id, address, expires_at, created_at, allowed_senders, label, callback_url, notify_email, notify_mode, api_key_hint, domain_id
          FROM inboxes
          WHERE label LIKE ${pattern}
            AND expires_at > NOW()
          ORDER BY created_at DESC
          LIMIT ${limit}
        `) as InboxRow[]);
    return rows.map(mapInboxRow);
  }

  if (label && hint) {
    const rows = (await sql`
      SELECT id, address, expires_at, created_at, allowed_senders, label, callback_url, notify_email, notify_mode, api_key_hint, domain_id
      FROM inboxes
      WHERE label = ${label}
        AND expires_at > NOW()
        AND (api_key_hint IS NULL OR api_key_hint = ${hint})
      ORDER BY created_at DESC
      LIMIT ${limit}
    `) as InboxRow[];
    return rows.map(mapInboxRow);
  }

  if (label) {
    const rows = (await sql`
      SELECT id, address, expires_at, created_at, allowed_senders, label, callback_url, notify_email, notify_mode, api_key_hint, domain_id
      FROM inboxes
      WHERE label = ${label}
        AND expires_at > NOW()
      ORDER BY created_at DESC
      LIMIT ${limit}
    `) as InboxRow[];
    return rows.map(mapInboxRow);
  }

  if (hint) {
    const rows = (await sql`
      SELECT id, address, expires_at, created_at, allowed_senders, label, callback_url, notify_email, notify_mode, api_key_hint, domain_id
      FROM inboxes
      WHERE expires_at > NOW()
        AND (api_key_hint IS NULL OR api_key_hint = ${hint})
      ORDER BY created_at DESC
      LIMIT ${limit}
    `) as InboxRow[];
    return rows.map(mapInboxRow);
  }

  const rows = (await sql`
    SELECT id, address, expires_at, created_at, allowed_senders, label, callback_url, notify_email, notify_mode, api_key_hint, domain_id
    FROM inboxes
    WHERE expires_at > NOW()
    ORDER BY created_at DESC
    LIMIT ${limit}
  `) as InboxRow[];
  return rows.map(mapInboxRow);
}

export async function getInbox(
  env: Env,
  id: string,
  options?: { apiKeyHint?: string }
): Promise<InboxRow | null> {
  const sql = getDb(env);
  const rows = (await sql`
    SELECT id, address, expires_at, created_at, allowed_senders, label, callback_url, notify_email, notify_mode, api_key_hint, domain_id
    FROM inboxes
    WHERE id = ${id}
      AND expires_at > NOW()
    LIMIT 1
  `) as InboxRow[];
  const row = rows[0] ? mapInboxRow(rows[0]) : null;
  if (!row) return null;
  if (!inboxAccessible(row, options?.apiKeyHint)) return null;
  return row;
}

/** Legacy inbox without hint — visible to any key; with hint — owner only */
export function inboxAccessible(
  row: InboxRow,
  apiKeyHint: string | undefined
): boolean {
  if (!row.api_key_hint) return true;
  if (!apiKeyHint) return false;
  return row.api_key_hint === apiKeyHint;
}

export async function findInboxByAddress(
  env: Env,
  address: string
): Promise<InboxRow | null> {
  const sql = getDb(env);
  const normalized = address.trim().toLowerCase();
  const rows = (await sql`
    SELECT id, address, expires_at, created_at, allowed_senders, label, callback_url, notify_email, notify_mode, api_key_hint, domain_id
    FROM inboxes
    WHERE LOWER(address) = ${normalized}
      AND expires_at > NOW()
    LIMIT 1
  `) as InboxRow[];
  return rows[0] ? mapInboxRow(rows[0]) : null;
}

function mapInboxRow(row: InboxRow): InboxRow {
  const allowed = row.allowed_senders;
  return {
    ...row,
    allowed_senders: Array.isArray(allowed) ? allowed : [],
    label: row.label ?? null,
    callback_url: row.callback_url ?? null,
    notify_email: row.notify_email ?? null,
    notify_mode: row.notify_mode ?? "off",
    api_key_hint: row.api_key_hint ?? null,
    domain_id: row.domain_id ?? null,
  };
}

export async function deleteInbox(
  env: Env,
  id: string,
  options?: { apiKeyHint?: string }
): Promise<boolean> {
  const inbox = await getInbox(env, id, options);
  if (!inbox) return false;
  await purgeRawMimeForInboxes(env, [id]);
  await purgeAttachmentR2ForInboxes(env, [id]);
  const sql = getDb(env);
  const rows = await sql`DELETE FROM inboxes WHERE id = ${id} RETURNING id`;
  return rows.length > 0;
}

/** QA: delete all inboxes with label LIKE prefix% (own api_key_hint only) */
export async function deleteInboxesByLabelPrefix(
  env: Env,
  labelPrefix: string,
  apiKeyHint: string
): Promise<string[]> {
  const prefix = labelPrefix.trim().slice(0, 64);
  if (prefix.length < 3) return [];

  const sql = getDb(env);
  const pattern = `${prefix}%`;
  const targets = (await sql`
    SELECT id FROM inboxes
    WHERE label LIKE ${pattern}
      AND (api_key_hint IS NULL OR api_key_hint = ${apiKeyHint})
  `) as { id: string }[];
  const ids = targets.map((r) => r.id);
  if (ids.length) {
    await purgeRawMimeForInboxes(env, ids);
    await purgeAttachmentR2ForInboxes(env, ids);
  }
  const rows = await sql`
    DELETE FROM inboxes
    WHERE label LIKE ${pattern}
      AND (api_key_hint IS NULL OR api_key_hint = ${apiKeyHint})
    RETURNING id
  `;
  return rows.map((r) => String((r as { id: string }).id));
}

export async function listMessages(
  env: Env,
  inboxId: string,
  options?: { subjectContains?: string }
): Promise<MessageRow[]> {
  const sql = getDb(env);
  const needle = options?.subjectContains?.trim().toLowerCase();
  const rows = (await sql`
    SELECT id, inbox_id, provider_id, from_addr, subject,
           text_preview, html_preview, otp, links_json, received_at,
           raw_r2_key, direction, thread_id, in_reply_to, to_addrs, rfc_message_id
    FROM messages
    WHERE inbox_id = ${inboxId}
    ORDER BY received_at DESC
  `) as MessageRow[];

  if (!needle) return rows;
  return rows.filter((m) => m.subject.toLowerCase().includes(needle));
}

export async function getMessage(
  env: Env,
  inboxId: string,
  messageId: string
): Promise<MessageRow | null> {
  const sql = getDb(env);
  const rows = (await sql`
    SELECT id, inbox_id, provider_id, from_addr, subject,
           text_preview, html_preview, otp, links_json, received_at,
           raw_r2_key, direction, thread_id, in_reply_to, to_addrs, rfc_message_id
    FROM messages
    WHERE inbox_id = ${inboxId} AND id = ${messageId}
    LIMIT 1
  `) as MessageRow[];
  return rows[0] ?? null;
}

export async function insertMessage(
  env: Env,
  input: {
    id?: string;
    inboxId: string;
    providerId: string;
    from: string;
    subject: string;
    textPreview: string | null;
    htmlPreview: string | null;
    otp: string | null;
    links: string[];
    rawR2Key?: string | null;
    direction?: "inbound" | "outbound";
    threadId?: string | null;
    inReplyTo?: string | null;
    toAddrs?: string[];
    rfcMessageId?: string | null;
  }
): Promise<MessageRow | null> {
  const sql = getDb(env);
  const id = input.id ?? nanoid(16);
  const direction = input.direction ?? "inbound";
  const threadId = input.threadId ?? id;
  const toAddrs = input.toAddrs ?? [];

  try {
    await sql`
      INSERT INTO messages (
        id, inbox_id, provider_id, from_addr, subject,
        text_preview, html_preview, otp, links_json, raw_r2_key,
        direction, thread_id, in_reply_to, to_addrs, rfc_message_id
      )
      VALUES (
        ${id}, ${input.inboxId}, ${input.providerId}, ${input.from},
        ${input.subject}, ${input.textPreview}, ${input.htmlPreview},
        ${input.otp}, ${JSON.stringify(input.links)}, ${input.rawR2Key ?? null},
        ${direction}, ${threadId}, ${input.inReplyTo ?? null},
        ${JSON.stringify(toAddrs)}, ${input.rfcMessageId ?? null}
      )
    `;
  } catch {
    return null;
  }

  const rows = (await sql`
    SELECT id, inbox_id, provider_id, from_addr, subject,
           text_preview, html_preview, otp, links_json, received_at,
           raw_r2_key, direction, thread_id, in_reply_to, to_addrs, rfc_message_id
    FROM messages
    WHERE id = ${id}
    LIMIT 1
  `) as MessageRow[];
  return rows[0] ?? null;
}

export async function countActiveInboxesForHint(
  env: Env,
  apiKeyHint: string
): Promise<number> {
  const sql = getDb(env);
  const rows = (await sql`
    SELECT COUNT(*)::int AS n
    FROM inboxes
    WHERE expires_at > NOW()
      AND api_key_hint = ${apiKeyHint}
  `) as { n: number }[];
  return rows[0]?.n ?? 0;
}

/** Inbox quota for entire team (all team key_hints) */
export async function countActiveInboxesForTeam(
  env: Env,
  teamId: string
): Promise<number> {
  const sql = getDb(env);
  const rows = (await sql`
    SELECT COUNT(*)::int AS n
    FROM inboxes
    WHERE expires_at > NOW()
      AND api_key_hint IN (
        SELECT key_hint FROM api_keys WHERE team_id = ${teamId}
      )
  `) as { n: number }[];
  return rows[0]?.n ?? 0;
}

/** Match In-Reply-To / References against stored messages (inbound threading) */
export async function findMessageForThreading(
  env: Env,
  inboxId: string,
  refIds: string[]
): Promise<MessageRow | null> {
  if (!refIds.length) return null;
  const sql = getDb(env);
  const variants = new Set<string>();
  for (const ref of refIds) {
    const t = ref.trim();
    variants.add(t);
    if (t.startsWith("<") && t.endsWith(">")) {
      variants.add(t.slice(1, -1));
    } else if (t.includes("@")) {
      variants.add(`<${t}>`);
    }
  }
  const ids = [...variants];

  const rows = (await sql`
    SELECT id, inbox_id, provider_id, from_addr, subject,
           text_preview, html_preview, otp, links_json, received_at,
           raw_r2_key, direction, thread_id, in_reply_to, to_addrs, rfc_message_id
    FROM messages
    WHERE inbox_id = ${inboxId}
      AND (
        rfc_message_id = ANY(${ids}::text[])
        OR provider_id = ANY(${ids}::text[])
      )
    ORDER BY received_at DESC
    LIMIT 1
  `) as MessageRow[];
  return rows[0] ?? null;
}

export async function purgeExpired(
  env: Env
): Promise<{ inboxes: number; rawDeleted: number; attDeleted: number }> {
  const sql = getDb(env);
  const expiring = (await sql`
    SELECT id FROM inboxes WHERE expires_at <= NOW()
  `) as { id: string }[];
  const inboxIds = expiring.map((r) => r.id);
  const rawDeleted = await purgeRawMimeForInboxes(env, inboxIds);
  const attDeleted = await purgeAttachmentR2ForInboxes(env, inboxIds);
  const deleted = await sql`
    DELETE FROM inboxes
    WHERE expires_at <= NOW()
    RETURNING id
  `;
  return { inboxes: deleted.length, rawDeleted, attDeleted };
}
