import { nanoid } from "nanoid";
import { purgeRawMimeForInboxes } from "./raw-mime-r2";
import { purgeAttachmentR2ForInboxes } from "./message-attachments";
import type { Env } from "../env";
import { getDb } from "../db/client";
import { normalizeAllowedSenders } from "../lib/sender-allowlist";

export interface InboxRow {
  id: string;
  address: string;
  expires_at: string;
  created_at: string;
  allowed_senders: string[];
  label: string | null;
  callback_url: string | null;
  api_key_hint: string | null;
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
}

export async function createInbox(
  env: Env,
  options?: {
    ttlMinutes?: number;
    expectFrom?: string | string[];
    allowedSenders?: string | string[];
    label?: string;
    callbackUrl?: string | null;
    apiKeyHint?: string;
  }
): Promise<InboxRow> {
  const sql = getDb(env);
  const ttl = options?.ttlMinutes ?? (Number(env.DEFAULT_TTL_MINUTES) || 30);
  const allowed = normalizeAllowedSenders(
    options?.allowedSenders ?? options?.expectFrom
  );
  const label = options?.label?.trim().slice(0, 128) || null;
  const callbackUrl = options?.callbackUrl ?? null;
  const apiKeyHint = options?.apiKeyHint?.slice(0, 16) ?? null;
  const id = nanoid(12);
  const local = `inbox-${id}`;
  const address = `${local}@${env.INBOX_DOMAIN}`;
  const expiresAt = new Date(Date.now() + ttl * 60_000).toISOString();

  await sql`
    INSERT INTO inboxes (id, address, expires_at, allowed_senders, label, callback_url, api_key_hint)
    VALUES (${id}, ${address}, ${expiresAt}, ${allowed}, ${label}, ${callbackUrl}, ${apiKeyHint})
  `;

  return {
    id,
    address,
    expires_at: expiresAt,
    created_at: new Date().toISOString(),
    allowed_senders: allowed,
    label,
    callback_url: callbackUrl,
    api_key_hint: apiKeyHint,
  };
}

/** QA: найти inbox прогона (отладка после падения теста) */
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
          SELECT id, address, expires_at, created_at, allowed_senders, label, callback_url, api_key_hint
          FROM inboxes
          WHERE label LIKE ${pattern}
            AND expires_at > NOW()
            AND (api_key_hint IS NULL OR api_key_hint = ${hint})
          ORDER BY created_at DESC
          LIMIT ${limit}
        `) as InboxRow[])
      : ((await sql`
          SELECT id, address, expires_at, created_at, allowed_senders, label, callback_url, api_key_hint
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
      SELECT id, address, expires_at, created_at, allowed_senders, label, callback_url, api_key_hint
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
      SELECT id, address, expires_at, created_at, allowed_senders, label, callback_url, api_key_hint
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
      SELECT id, address, expires_at, created_at, allowed_senders, label, callback_url, api_key_hint
      FROM inboxes
      WHERE expires_at > NOW()
        AND (api_key_hint IS NULL OR api_key_hint = ${hint})
      ORDER BY created_at DESC
      LIMIT ${limit}
    `) as InboxRow[];
    return rows.map(mapInboxRow);
  }

  const rows = (await sql`
    SELECT id, address, expires_at, created_at, allowed_senders, label, callback_url, api_key_hint
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
    SELECT id, address, expires_at, created_at, allowed_senders, label, callback_url, api_key_hint
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

/** Legacy inbox без hint — видны любому ключу; с hint — только владельцу */
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
    SELECT id, address, expires_at, created_at, allowed_senders, label, callback_url, api_key_hint
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
    api_key_hint: row.api_key_hint ?? null,
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

/** QA: удалить все inbox с label LIKE prefix% (только свой api_key_hint) */
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
           raw_r2_key
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
           raw_r2_key
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
  }
): Promise<MessageRow | null> {
  const sql = getDb(env);
  const id = input.id ?? nanoid(16);

  try {
    await sql`
      INSERT INTO messages (
        id, inbox_id, provider_id, from_addr, subject,
        text_preview, html_preview, otp, links_json, raw_r2_key
      )
      VALUES (
        ${id}, ${input.inboxId}, ${input.providerId}, ${input.from},
        ${input.subject}, ${input.textPreview}, ${input.htmlPreview},
        ${input.otp}, ${JSON.stringify(input.links)}, ${input.rawR2Key ?? null}
      )
    `;
  } catch {
    return null;
  }

  const rows = (await sql`
    SELECT id, inbox_id, provider_id, from_addr, subject,
           text_preview, html_preview, otp, links_json, received_at,
           raw_r2_key
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

/** Квота inbox на всю команду (все key_hint команды) */
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
