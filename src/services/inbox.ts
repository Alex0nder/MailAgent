import { nanoid } from "nanoid";
import type { Env } from "../env";
import { getDb } from "../db/client";
import { normalizeAllowedSenders } from "../lib/sender-allowlist";

export interface InboxRow {
  id: string;
  address: string;
  expires_at: string;
  created_at: string;
  allowed_senders: string[];
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
}

export async function createInbox(
  env: Env,
  options?: {
    ttlMinutes?: number;
    expectFrom?: string | string[];
    allowedSenders?: string | string[];
  }
): Promise<InboxRow> {
  const sql = getDb(env);
  const ttl = options?.ttlMinutes ?? (Number(env.DEFAULT_TTL_MINUTES) || 30);
  const allowed = normalizeAllowedSenders(
    options?.allowedSenders ?? options?.expectFrom
  );
  const id = nanoid(12);
  const local = `inbox-${id}`;
  const address = `${local}@${env.INBOX_DOMAIN}`;
  const expiresAt = new Date(Date.now() + ttl * 60_000).toISOString();

  await sql`
    INSERT INTO inboxes (id, address, expires_at, allowed_senders)
    VALUES (${id}, ${address}, ${expiresAt}, ${allowed})
  `;

  return {
    id,
    address,
    expires_at: expiresAt,
    created_at: new Date().toISOString(),
    allowed_senders: allowed,
  };
}

export async function getInbox(env: Env, id: string): Promise<InboxRow | null> {
  const sql = getDb(env);
  const rows = (await sql`
    SELECT id, address, expires_at, created_at, allowed_senders
    FROM inboxes
    WHERE id = ${id}
      AND expires_at > NOW()
    LIMIT 1
  `) as InboxRow[];
  return rows[0] ? mapInboxRow(rows[0]) : null;
}

export async function findInboxByAddress(
  env: Env,
  address: string
): Promise<InboxRow | null> {
  const sql = getDb(env);
  const normalized = address.trim().toLowerCase();
  const rows = (await sql`
    SELECT id, address, expires_at, created_at, allowed_senders
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
  };
}

export async function deleteInbox(env: Env, id: string): Promise<boolean> {
  const sql = getDb(env);
  const rows = await sql`DELETE FROM inboxes WHERE id = ${id} RETURNING id`;
  return rows.length > 0;
}

export async function listMessages(
  env: Env,
  inboxId: string
): Promise<MessageRow[]> {
  const sql = getDb(env);
  return (await sql`
    SELECT id, inbox_id, provider_id, from_addr, subject,
           text_preview, html_preview, otp, links_json, received_at
    FROM messages
    WHERE inbox_id = ${inboxId}
    ORDER BY received_at DESC
  `) as MessageRow[];
}

export async function insertMessage(
  env: Env,
  input: {
    inboxId: string;
    providerId: string;
    from: string;
    subject: string;
    textPreview: string | null;
    htmlPreview: string | null;
    otp: string | null;
    links: string[];
  }
): Promise<MessageRow | null> {
  const sql = getDb(env);
  const id = nanoid(16);

  try {
    await sql`
      INSERT INTO messages (
        id, inbox_id, provider_id, from_addr, subject,
        text_preview, html_preview, otp, links_json
      )
      VALUES (
        ${id}, ${input.inboxId}, ${input.providerId}, ${input.from},
        ${input.subject}, ${input.textPreview}, ${input.htmlPreview},
        ${input.otp}, ${JSON.stringify(input.links)}
      )
    `;
  } catch {
    return null;
  }

  const rows = (await sql`
    SELECT id, inbox_id, provider_id, from_addr, subject,
           text_preview, html_preview, otp, links_json, received_at
    FROM messages
    WHERE id = ${id}
    LIMIT 1
  `) as MessageRow[];
  return rows[0] ?? null;
}

export async function purgeExpired(env: Env): Promise<{ inboxes: number }> {
  const sql = getDb(env);
  const deleted = await sql`
    DELETE FROM inboxes
    WHERE expires_at <= NOW()
    RETURNING id
  `;
  return { inboxes: deleted.length };
}
