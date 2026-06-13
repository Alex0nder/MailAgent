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

export async function countNotifyQuotaEvents24h(
  env: Env,
  scope: { teamId: string | null; apiKeyHint: string }
): Promise<number> {
  const sql = getDb(env);
  try {
    const rows = scope.teamId
      ? ((await sql`
          SELECT COUNT(*)::int AS n
          FROM notify_quota_events
          WHERE team_id = ${scope.teamId}
            AND created_at > NOW() - INTERVAL '24 hours'
        `) as { n: number }[])
      : ((await sql`
          SELECT COUNT(*)::int AS n
          FROM notify_quota_events
          WHERE team_id IS NULL
            AND api_key_hint = ${scope.apiKeyHint}
            AND created_at > NOW() - INTERVAL '24 hours'
        `) as { n: number }[]);
    return rows[0]?.n ?? 0;
  } catch (e) {
    if (isMissingNotifyQuotaTable(e)) return 0;
    throw e;
  }
}

export async function recordNotifyQuotaEvent(
  env: Env,
  input: {
    teamId: string | null;
    apiKeyHint: string;
    inboxId: string;
    notifyEmail: string;
  }
): Promise<void> {
  const sql = getDb(env);
  const id = nanoid(12);
  try {
    await sql`
      INSERT INTO notify_quota_events (
        id, team_id, api_key_hint, inbox_id, notify_email
      )
      VALUES (
        ${id}, ${input.teamId}, ${input.apiKeyHint}, ${input.inboxId}, ${input.notifyEmail}
      )
    `;
  } catch (e) {
    if (isMissingNotifyQuotaTable(e)) return;
    throw e;
  }
}

function isMissingNotifyQuotaTable(e: unknown): boolean {
  if (typeof e !== "object" || e === null) return false;
  const err = e as { code?: string; message?: string };
  return (
    err.code === "42P01" ||
    Boolean(err.message?.includes("notify_quota_events"))
  );
}
