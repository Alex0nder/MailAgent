/** Write and read notifyEmail delivery log */
import { nanoid } from "nanoid";
import type { Env } from "../env";
import { getDb } from "../db/client";

export interface NotifyDeliveryRow {
  id: string;
  inbox_id: string;
  message_id: string | null;
  notify_email: string;
  resend_id: string | null;
  ok: boolean;
  error_text: string | null;
  duration_ms: number | null;
  created_at: string;
}

export async function recordNotifyDelivery(
  env: Env,
  input: {
    inboxId: string;
    messageId?: string;
    notifyEmail: string;
    resendId?: string | null;
    ok: boolean;
    errorText?: string | null;
    durationMs: number;
  }
): Promise<void> {
  const sql = getDb(env);
  const id = nanoid(12);
  await sql`
    INSERT INTO notify_deliveries (
      id, inbox_id, message_id, notify_email,
      resend_id, ok, error_text, duration_ms
    )
    VALUES (
      ${id}, ${input.inboxId}, ${input.messageId ?? null}, ${input.notifyEmail},
      ${input.resendId ?? null}, ${input.ok}, ${input.errorText ?? null}, ${input.durationMs}
    )
  `;
}

export async function listNotifyDeliveries(
  env: Env,
  inboxId: string,
  limit = 20
): Promise<NotifyDeliveryRow[]> {
  const sql = getDb(env);
  const cap = Math.min(limit, 50);
  return (await sql`
    SELECT id, inbox_id, message_id, notify_email,
           resend_id, ok, error_text, duration_ms, created_at
    FROM notify_deliveries
    WHERE inbox_id = ${inboxId}
    ORDER BY created_at DESC
    LIMIT ${cap}
  `) as NotifyDeliveryRow[];
}
