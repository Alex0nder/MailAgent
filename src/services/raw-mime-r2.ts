/** Сохранение raw MIME из Resend в R2 + cleanup при удалении inbox */
import type { Env } from "../env";
import { getDb } from "../db/client";

const DEFAULT_MAX_BYTES = 15 * 1024 * 1024;

function maxBytes(env: Env): number {
  const raw = env.RAW_MIME_MAX_BYTES;
  const n = raw ? Number(raw) : DEFAULT_MAX_BYTES;
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_MAX_BYTES;
}

export function rawMimeR2Key(inboxId: string, messageId: string): string {
  return `${inboxId}/${messageId}.eml`;
}

export function rawMimeEnabled(env: Env): boolean {
  return Boolean(env.RAW_MIME);
}

/** Скачать signed URL Resend и положить в R2; null если binding нет или ошибка */
export async function storeRawMimeFromUrl(
  env: Env,
  inboxId: string,
  messageId: string,
  downloadUrl: string
): Promise<string | null> {
  const bucket = env.RAW_MIME;
  if (!bucket) return null;

  const res = await fetch(downloadUrl);
  if (!res.ok) {
    console.warn("raw mime fetch failed", res.status, inboxId, messageId);
    return null;
  }

  const buf = await res.arrayBuffer();
  if (buf.byteLength > maxBytes(env)) {
    console.warn("raw mime too large", buf.byteLength, inboxId, messageId);
    return null;
  }

  const key = rawMimeR2Key(inboxId, messageId);
  await bucket.put(key, buf, {
    httpMetadata: { contentType: "message/rfc822" },
    customMetadata: { inboxId, messageId },
  });
  return key;
}

export async function getRawMimeObject(
  env: Env,
  rawR2Key: string
): Promise<R2ObjectBody | null> {
  const bucket = env.RAW_MIME;
  if (!bucket) return null;
  const obj = await bucket.get(rawR2Key);
  return obj ?? null;
}

export async function listRawR2KeysForInboxes(
  env: Env,
  inboxIds: string[]
): Promise<string[]> {
  if (!inboxIds.length) return [];
  const sql = getDb(env);
  const rows = (await sql`
    SELECT raw_r2_key
    FROM messages
    WHERE inbox_id = ANY(${inboxIds}::text[])
      AND raw_r2_key IS NOT NULL
  `) as { raw_r2_key: string }[];
  return rows.map((r) => r.raw_r2_key);
}

export async function deleteRawR2Keys(
  env: Env,
  keys: string[]
): Promise<number> {
  const bucket = env.RAW_MIME;
  if (!bucket || !keys.length) return 0;
  const unique = [...new Set(keys)];
  await Promise.all(unique.map((key) => bucket.delete(key)));
  return unique.length;
}

/** Удалить R2-объекты для inbox перед CASCADE delete */
export async function purgeRawMimeForInboxes(
  env: Env,
  inboxIds: string[]
): Promise<number> {
  const keys = await listRawR2KeysForInboxes(env, inboxIds);
  return deleteRawR2Keys(env, keys);
}
