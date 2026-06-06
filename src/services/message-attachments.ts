/** Resend attachments: metadata in Neon, optional R2 cache */
import { nanoid } from "nanoid";
import { Resend } from "resend";
import type { Env } from "../env";
import { getDb } from "../db/client";
import { getMessage } from "./inbox";
import { deleteRawR2Keys, rawMimeEnabled } from "./raw-mime-r2";

function createResendClient(env: Env) {
  return new Resend(env.RESEND_API_KEY);
}

const DEFAULT_STORE_MAX = 2 * 1024 * 1024;

export type AttachmentRow = {
  id: string;
  message_id: string;
  provider_id: string;
  filename: string;
  content_type: string | null;
  size_bytes: number | null;
  content_disposition: string | null;
  content_id: string | null;
  r2_key: string | null;
  created_at: string;
};

function storeMaxBytes(env: Env): number {
  const raw = env.ATTACHMENT_MAX_STORE_BYTES;
  const n = raw ? Number(raw) : DEFAULT_STORE_MAX;
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_STORE_MAX;
}

export function attachmentR2Key(
  inboxId: string,
  messageId: string,
  attachmentId: string
): string {
  return `${inboxId}/${messageId}/att/${attachmentId}`;
}

type ResendAttMeta = {
  id?: string;
  filename?: string;
  content_type?: string;
  size?: number;
  content_disposition?: string;
  content_id?: string | null;
};

/** Save attachment metadata on ingest (from receiving.get) */
export async function saveAttachmentsFromEmail(
  env: Env,
  inboxId: string,
  messageId: string,
  providerEmailId: string,
  email: unknown
): Promise<AttachmentRow[]> {
  const items = readAttachmentMeta(email);
  if (!items.length) return [];

  const sql = getDb(env);
  const saved: AttachmentRow[] = [];

  for (const item of items) {
    if (!item.id) continue;
    const id = nanoid(12);
    let r2Key: string | null = null;

    if (rawMimeEnabled(env) && item.size && item.size <= storeMaxBytes(env)) {
      r2Key = await cacheAttachmentFromResend(
        env,
        inboxId,
        messageId,
        id,
        providerEmailId,
        item.id,
        item.content_type ?? "application/octet-stream"
      );
    }

    try {
      await sql`
        INSERT INTO message_attachments (
          id, message_id, provider_id, filename, content_type,
          size_bytes, content_disposition, content_id, r2_key
        )
        VALUES (
          ${id}, ${messageId}, ${item.id}, ${item.filename ?? "attachment"},
          ${item.content_type ?? null}, ${item.size ?? null},
          ${item.content_disposition ?? null}, ${item.content_id ?? null},
          ${r2Key}
        )
      `;
    } catch {
      continue;
    }

    const rows = (await sql`
      SELECT id, message_id, provider_id, filename, content_type,
             size_bytes, content_disposition, content_id, r2_key, created_at
      FROM message_attachments WHERE id = ${id} LIMIT 1
    `) as AttachmentRow[];
    if (rows[0]) saved.push(rows[0]);
  }

  return saved;
}

export async function attachmentCountsForMessages(
  env: Env,
  messageIds: string[]
): Promise<Record<string, number>> {
  if (!messageIds.length) return {};
  const sql = getDb(env);
  const rows = (await sql`
    SELECT message_id, COUNT(*)::int AS c
    FROM message_attachments
    WHERE message_id = ANY(${messageIds}::text[])
    GROUP BY message_id
  `) as { message_id: string; c: number }[];
  const out: Record<string, number> = {};
  for (const r of rows) out[r.message_id] = r.c;
  return out;
}

export async function countAttachmentsForMessage(
  env: Env,
  messageId: string
): Promise<number> {
  const sql = getDb(env);
  const rows = (await sql`
    SELECT COUNT(*)::int AS c FROM message_attachments WHERE message_id = ${messageId}
  `) as { c: number }[];
  return rows[0]?.c ?? 0;
}

export async function listAttachments(
  env: Env,
  messageId: string
): Promise<AttachmentRow[]> {
  const sql = getDb(env);
  return (await sql`
    SELECT id, message_id, provider_id, filename, content_type,
           size_bytes, content_disposition, content_id, r2_key, created_at
    FROM message_attachments
    WHERE message_id = ${messageId}
    ORDER BY created_at ASC
  `) as AttachmentRow[];
}

export async function getAttachment(
  env: Env,
  messageId: string,
  attachmentId: string
): Promise<AttachmentRow | null> {
  const sql = getDb(env);
  const rows = (await sql`
    SELECT id, message_id, provider_id, filename, content_type,
           size_bytes, content_disposition, content_id, r2_key, created_at
    FROM message_attachments
    WHERE message_id = ${messageId} AND id = ${attachmentId}
    LIMIT 1
  `) as AttachmentRow[];
  return rows[0] ?? null;
}

export type AttachmentDownloadMeta = {
  id: string;
  filename: string;
  contentType: string;
  sizeBytes: number | null;
  cached: boolean;
  downloadUrl?: string;
  expiresAt?: string;
};

/** Metadata + fresh signed URL from Resend (1h) */
export async function fetchAttachmentDownloadMeta(
  env: Env,
  providerEmailId: string,
  row: AttachmentRow
): Promise<AttachmentDownloadMeta | { error: string }> {
  const resend = createResendClient(env);
  const { data, error } = await resend.emails.receiving.attachments.get({
    emailId: providerEmailId,
    id: row.provider_id,
  });

  if (error || !data) {
    return { error: error?.message ?? "attachment_fetch_failed" };
  }

  const d = data as {
    download_url?: string;
    expires_at?: string;
    filename?: string;
    content_type?: string;
    size?: number;
  };

  return {
    id: row.id,
    filename: d.filename ?? row.filename,
    contentType: d.content_type ?? row.content_type ?? "application/octet-stream",
    sizeBytes: d.size ?? row.size_bytes,
    cached: Boolean(row.r2_key),
    ...(d.download_url ? { downloadUrl: d.download_url } : {}),
    ...(d.expires_at ? { expiresAt: d.expires_at } : {}),
  };
}

export async function attachmentHttpResponse(
  env: Env,
  inboxId: string,
  messageId: string,
  attachmentId: string,
  acceptJson: boolean
): Promise<Response> {
  const message = await getMessage(env, inboxId, messageId);
  if (!message) {
    return Response.json({ error: "message_not_found" }, { status: 404 });
  }

  const row = await getAttachment(env, messageId, attachmentId);
  if (!row) {
    return Response.json({ error: "attachment_not_found" }, { status: 404 });
  }

  const cached = await attachmentFromR2(
    env,
    row,
    acceptJson,
    inboxId,
    messageId,
    attachmentId
  );
  if (cached) return cached;

  if (
    isSimulatedProviderId(message.provider_id) ||
    isSimulatedProviderId(row.provider_id)
  ) {
    const meta = metaFromRow(row);
    if (acceptJson) {
      return Response.json({
        ...meta,
        messageId,
        inboxId,
        downloadPath: `/v1/inboxes/${inboxId}/messages/${messageId}/attachments/${attachmentId}`,
      });
    }
    return Response.json({ error: "download_unavailable" }, { status: 404 });
  }

  const meta = await fetchAttachmentDownloadMeta(
    env,
    message.provider_id,
    row
  );
  if ("error" in meta) {
    return Response.json({ error: meta.error }, { status: 502 });
  }

  if (acceptJson) {
    return Response.json({
      ...meta,
      messageId,
      inboxId,
      downloadPath: `/v1/inboxes/${inboxId}/messages/${messageId}/attachments/${attachmentId}`,
    });
  }

  if (row.r2_key && rawMimeEnabled(env)) {
    const fromR2 = await attachmentFromR2(
      env,
      row,
      false,
      inboxId,
      messageId,
      attachmentId
    );
    if (fromR2) return fromR2;
  }

  if (!meta.downloadUrl) {
    return Response.json({ error: "download_unavailable" }, { status: 404 });
  }

  const res = await fetch(meta.downloadUrl);
  if (!res.ok) {
    return Response.json({ error: "download_failed" }, { status: 502 });
  }

  const headers = new Headers();
  headers.set("Content-Type", meta.contentType);
  headers.set(
    "Content-Disposition",
    `inline; filename="${sanitizeFilename(meta.filename)}"`
  );
  return new Response(res.body, { headers });
}

export async function listAttachmentR2KeysForInboxes(
  env: Env,
  inboxIds: string[]
): Promise<string[]> {
  if (!inboxIds.length) return [];
  const sql = getDb(env);
  const rows = (await sql`
    SELECT ma.r2_key
    FROM message_attachments ma
    JOIN messages m ON m.id = ma.message_id
    WHERE m.inbox_id = ANY(${inboxIds}::text[])
      AND ma.r2_key IS NOT NULL
  `) as { r2_key: string }[];
  return rows.map((r) => r.r2_key);
}

export async function purgeAttachmentR2ForInboxes(
  env: Env,
  inboxIds: string[]
): Promise<number> {
  const keys = await listAttachmentR2KeysForInboxes(env, inboxIds);
  return deleteRawR2Keys(env, keys);
}

function readAttachmentMeta(email: unknown): ResendAttMeta[] {
  if (!email || typeof email !== "object") return [];
  const att = (email as { attachments?: ResendAttMeta[] }).attachments;
  return Array.isArray(att) ? att : [];
}

async function cacheAttachmentFromResend(
  env: Env,
  inboxId: string,
  messageId: string,
  attachmentId: string,
  providerEmailId: string,
  providerAttachmentId: string,
  contentType: string
): Promise<string | null> {
  const resend = createResendClient(env);
  const { data, error } = await resend.emails.receiving.attachments.get({
    emailId: providerEmailId,
    id: providerAttachmentId,
  });
  if (error || !data) return null;

  const url = (data as { download_url?: string }).download_url;
  if (!url || !url.startsWith("http")) return null;

  const res = await fetch(url);
  if (!res.ok) return null;

  const buf = await res.arrayBuffer();
  if (buf.byteLength > storeMaxBytes(env)) return null;

  const key = attachmentR2Key(inboxId, messageId, attachmentId);
  await env.RAW_MIME!.put(key, buf, {
    httpMetadata: { contentType },
    customMetadata: { inboxId, messageId, attachmentId },
  });
  return key;
}

function sanitizeFilename(name: string): string {
  return name.replace(/[^\w.\-]+/g, "_").slice(0, 120) || "attachment";
}

function isSimulatedProviderId(id: string): boolean {
  return id.startsWith("sim_");
}

function metaFromRow(row: AttachmentRow): AttachmentDownloadMeta {
  return {
    id: row.id,
    filename: row.filename,
    contentType: row.content_type ?? "application/octet-stream",
    sizeBytes: row.size_bytes,
    cached: Boolean(row.r2_key),
  };
}

async function attachmentFromR2(
  env: Env,
  row: AttachmentRow,
  acceptJson: boolean,
  inboxId: string,
  messageId: string,
  attachmentId: string
): Promise<Response | null> {
  if (!row.r2_key || !rawMimeEnabled(env)) return null;
  const obj = await env.RAW_MIME!.get(row.r2_key);
  if (!obj) return null;

  const meta = metaFromRow(row);
  if (acceptJson) {
    return Response.json({
      ...meta,
      messageId,
      inboxId,
      downloadPath: `/v1/inboxes/${inboxId}/messages/${messageId}/attachments/${attachmentId}`,
    });
  }

  const headers = new Headers();
  headers.set("Content-Type", meta.contentType);
  headers.set(
    "Content-Disposition",
    `inline; filename="${sanitizeFilename(meta.filename)}"`
  );
  return new Response(obj.body, { headers });
}

export function formatAttachment(row: AttachmentRow, inboxId: string, messageId: string) {
  return {
    id: row.id,
    filename: row.filename,
    contentType: row.content_type,
    sizeBytes: row.size_bytes,
    contentDisposition: row.content_disposition,
    contentId: row.content_id,
    cached: Boolean(row.r2_key),
    downloadUrl: `/v1/inboxes/${inboxId}/messages/${messageId}/attachments/${row.id}`,
  };
}
