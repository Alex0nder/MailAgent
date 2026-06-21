/** Idempotent persistence for approval-gated Gmail/Calendar writes (P3). */
import { nanoid } from "nanoid";
import type { Env } from "../env";
import { getDb } from "../db/client";
import { type WorkspaceReminderAuth, workspaceOwnerKey } from "./workspace-reminders";

export type WorkspaceWriteKind = "gmail_draft" | "calendar_create" | "calendar_update";
export type WorkspaceWriteStatus = "pending" | "executed" | "denied" | "failed";

type WriteExecutionRow = {
  id: string;
  kind: WorkspaceWriteKind;
  idempotency_key: string;
  account_id: string;
  status: WorkspaceWriteStatus;
  denial_code: string | null;
  request: unknown;
  result: unknown;
  created_at: string;
  updated_at: string;
};

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function formatWriteExecution(row: WriteExecutionRow) {
  return {
    id: row.id,
    kind: row.kind,
    idempotencyKey: row.idempotency_key,
    accountId: row.account_id,
    status: row.status,
    denialCode: row.denial_code,
    request: objectValue(row.request),
    result: objectValue(row.result),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function claimWorkspaceWriteExecution(
  env: Env,
  auth: WorkspaceReminderAuth,
  input: {
    kind: WorkspaceWriteKind;
    idempotencyKey: string;
    accountId: string;
    request: Record<string, unknown>;
  }
) {
  const sql = getDb(env);
  const ownerKey = workspaceOwnerKey(auth);
  const id = `wxw_${nanoid(16)}`;
  const rows = (await sql`
    INSERT INTO workspace_write_executions (
      id, owner_key, team_id, api_key_hint, kind, idempotency_key, account_id, request
    )
    VALUES (
      ${id}, ${ownerKey}, ${auth.teamId}, ${auth.apiKeyHint}, ${input.kind},
      ${input.idempotencyKey}, ${input.accountId}, ${JSON.stringify(input.request)}::jsonb
    )
    ON CONFLICT (owner_key, idempotency_key) DO NOTHING
    RETURNING id, kind, idempotency_key, account_id, status, denial_code, request, result,
              created_at, updated_at
  `) as WriteExecutionRow[];
  if (rows[0]) return { claimed: true as const, execution: formatWriteExecution(rows[0]) };
  const existing = (await sql`
    SELECT id, kind, idempotency_key, account_id, status, denial_code, request, result,
           created_at, updated_at
    FROM workspace_write_executions
    WHERE owner_key = ${ownerKey} AND idempotency_key = ${input.idempotencyKey}
    LIMIT 1
  `) as WriteExecutionRow[];
  return { claimed: false as const, execution: formatWriteExecution(existing[0]!) };
}

export async function finishWorkspaceWriteExecution(
  env: Env,
  auth: WorkspaceReminderAuth,
  id: string,
  update: {
    status: Exclude<WorkspaceWriteStatus, "pending">;
    denialCode?: string;
    result?: Record<string, unknown>;
  }
) {
  const sql = getDb(env);
  const rows = (await sql`
    UPDATE workspace_write_executions
    SET status = ${update.status},
        denial_code = ${update.denialCode ?? null},
        result = ${JSON.stringify(update.result ?? {})}::jsonb,
        updated_at = NOW()
    WHERE id = ${id} AND owner_key = ${workspaceOwnerKey(auth)}
    RETURNING id, kind, idempotency_key, account_id, status, denial_code, request, result,
              created_at, updated_at
  `) as WriteExecutionRow[];
  return rows[0] ? formatWriteExecution(rows[0]) : null;
}
