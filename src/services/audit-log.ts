/** Team / key-scoped audit log (enterprise prep) */
import { nanoid } from "nanoid";
import type { Env } from "../env";
import { getDb } from "../db/client";

export type AuditAction =
  | "inbox.created"
  | "inbox.bulk_deleted"
  | "team.key.created"
  | "team.key.revoked"
  | "domain.created"
  | "domain.deleted"
  | "billing.checkout"
  | "inbox.sent"
  | "inbox.replied";

export type AuditContext = {
  teamId: string | null;
  apiKeyHint: string;
  apiKeyId: string | null;
};

export type AuditEventInput = {
  action: AuditAction;
  resourceType?: string;
  resourceId?: string;
  meta?: Record<string, unknown>;
};

export async function recordAuditEvent(
  env: Env,
  ctx: AuditContext,
  event: AuditEventInput
): Promise<void> {
  const sql = getDb(env);
  const metaJson = event.meta ? JSON.stringify(event.meta) : null;
  await sql`
    INSERT INTO audit_events (
      id, team_id, api_key_hint, api_key_id,
      action, resource_type, resource_id, meta
    )
    VALUES (
      ${nanoid()},
      ${ctx.teamId},
      ${ctx.apiKeyHint},
      ${ctx.apiKeyId},
      ${event.action},
      ${event.resourceType ?? null},
      ${event.resourceId ?? null},
      ${metaJson}::jsonb
    )
  `;
}

/** Fire-and-forget — на Workers нужен executionCtx.waitUntil */
export function auditFire(
  env: Env,
  ctx: AuditContext,
  event: AuditEventInput,
  executionCtx?: Pick<ExecutionContext, "waitUntil">
): void {
  const task = recordAuditEvent(env, ctx, event).catch((err) => {
    console.error("audit_log_failed", event.action, err);
  });
  if (executionCtx) {
    executionCtx.waitUntil(task);
  } else {
    void task;
  }
}

/** Route helper — всегда передаёт executionCtx.waitUntil на Workers */
export function auditRoute(
  c: {
    env: Env;
    executionCtx: Pick<ExecutionContext, "waitUntil">;
    get: (key: "teamId" | "apiKeyHint" | "apiKeyId") => string | null;
  },
  event: AuditEventInput,
  overrides?: Partial<AuditContext>
): void {
  auditFire(
    c.env,
    {
      teamId: overrides?.teamId ?? c.get("teamId"),
      apiKeyHint: overrides?.apiKeyHint ?? c.get("apiKeyHint") ?? "",
      apiKeyId: overrides?.apiKeyId ?? c.get("apiKeyId"),
    },
    event,
    c.executionCtx
  );
}

export type AuditEventRow = {
  id: string;
  team_id: string | null;
  api_key_hint: string;
  api_key_id: string | null;
  action: string;
  resource_type: string | null;
  resource_id: string | null;
  meta: unknown;
  created_at: string;
};

export async function listAuditEvents(
  env: Env,
  scope: { teamId: string | null; apiKeyHint: string },
  options?: { limit?: number }
): Promise<ReturnType<typeof formatAuditEvent>[]> {
  const sql = getDb(env);
  const limit = Math.min(options?.limit ?? 50, 100);

  const rows = scope.teamId
    ? ((await sql`
        SELECT id, team_id, api_key_hint, api_key_id, action,
               resource_type, resource_id, meta, created_at
        FROM audit_events
        WHERE team_id = ${scope.teamId}
        ORDER BY created_at DESC
        LIMIT ${limit}
      `) as AuditEventRow[])
    : ((await sql`
        SELECT id, team_id, api_key_hint, api_key_id, action,
               resource_type, resource_id, meta, created_at
        FROM audit_events
        WHERE team_id IS NULL AND api_key_hint = ${scope.apiKeyHint}
        ORDER BY created_at DESC
        LIMIT ${limit}
      `) as AuditEventRow[]);

  return rows.map(formatAuditEvent);
}

export function auditRetentionDays(env: Env): number {
  const raw = Number(env.AUDIT_RETENTION_DAYS ?? 90);
  if (!Number.isFinite(raw) || raw < 1) return 90;
  return Math.min(Math.floor(raw), 365);
}

export async function purgeExpiredAuditEvents(
  env: Env
): Promise<{ deleted: number }> {
  const days = auditRetentionDays(env);
  const sql = getDb(env);
  const deleted = await sql`
    DELETE FROM audit_events
    WHERE created_at < NOW() - (${days} * INTERVAL '1 day')
    RETURNING id
  `;
  return { deleted: deleted.length };
}

function formatAuditEvent(row: AuditEventRow) {
  return {
    id: row.id,
    action: row.action,
    resourceType: row.resource_type,
    resourceId: row.resource_id,
    apiKeyHint: row.api_key_hint,
    meta: row.meta,
    createdAt: row.created_at,
  };
}
