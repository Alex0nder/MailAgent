/** Write and read callbackUrl delivery log */
import { nanoid } from "nanoid";
import type { Env } from "../env";
import { getDb } from "../db/client";

export interface CallbackDeliveryRow {
  id: string;
  inbox_id: string;
  message_id: string | null;
  callback_url: string;
  status_code: number | null;
  ok: boolean;
  error_text: string | null;
  duration_ms: number | null;
  created_at: string;
}

export async function recordCallbackDelivery(
  env: Env,
  input: {
    inboxId: string;
    messageId?: string;
    callbackUrl: string;
    statusCode: number | null;
    ok: boolean;
    errorText?: string | null;
    durationMs: number;
  }
): Promise<void> {
  const sql = getDb(env);
  const id = nanoid(12);
  await sql`
    INSERT INTO callback_deliveries (
      id, inbox_id, message_id, callback_url,
      status_code, ok, error_text, duration_ms
    )
    VALUES (
      ${id}, ${input.inboxId}, ${input.messageId ?? null}, ${input.callbackUrl},
      ${input.statusCode}, ${input.ok}, ${input.errorText ?? null}, ${input.durationMs}
    )
  `;
}

export async function listCallbackDeliveries(
  env: Env,
  inboxId: string,
  limit = 20
): Promise<CallbackDeliveryRow[]> {
  const sql = getDb(env);
  const cap = Math.min(limit, 50);
  return (await sql`
    SELECT id, inbox_id, message_id, callback_url,
           status_code, ok, error_text, duration_ms, created_at
    FROM callback_deliveries
    WHERE inbox_id = ${inboxId}
    ORDER BY created_at DESC
    LIMIT ${cap}
  `) as CallbackDeliveryRow[];
}
