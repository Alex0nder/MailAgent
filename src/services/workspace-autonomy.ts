/** Workspace Agent autonomy policy and idempotent execution persistence. */
import { nanoid } from "nanoid";
import type { Env } from "../env";
import { getDb } from "../db/client";
import { type WorkspaceReminderAuth, workspaceOwnerKey } from "./workspace-reminders";

export type WorkspaceAutonomyMode = "draft_only" | "auto_send_safe" | "full_auto";
export type WorkspaceConfidence = "low" | "medium" | "high";

export type WorkspaceAutonomyPolicyInput = {
  mode?: string;
  allowedRecipientDomains?: string[];
  minConfidence?: string;
  maxSendsPerHour?: number;
};

type PolicyRow = {
  mode: WorkspaceAutonomyMode;
  allowed_recipient_domains: string[];
  min_confidence: WorkspaceConfidence;
  max_sends_per_hour: number;
  created_at: string;
  updated_at: string;
};

type ExecutionRow = {
  id: string;
  idempotency_key: string;
  reminder_id: string | null;
  inbox_id: string;
  message_id: string;
  status: "pending" | "sent" | "denied" | "failed";
  denial_code: string | null;
  request: unknown;
  result: unknown;
  created_at: string;
  updated_at: string;
};

const MODES = new Set<WorkspaceAutonomyMode>(["draft_only", "auto_send_safe", "full_auto"]);
const CONFIDENCE = new Set<WorkspaceConfidence>(["low", "medium", "high"]);

function defaultPolicy() {
  return {
    mode: "draft_only" as const,
    allowedRecipientDomains: [] as string[],
    minConfidence: "high" as const,
    maxSendsPerHour: 5,
    persisted: false,
    createdAt: null,
    updatedAt: null,
  };
}

function formatPolicy(row: PolicyRow) {
  return {
    mode: row.mode,
    allowedRecipientDomains: row.allowed_recipient_domains ?? [],
    minConfidence: row.min_confidence,
    maxSendsPerHour: row.max_sends_per_hour,
    persisted: true,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function formatExecution(row: ExecutionRow) {
  return {
    id: row.id,
    idempotencyKey: row.idempotency_key,
    reminderId: row.reminder_id,
    inboxId: row.inbox_id,
    messageId: row.message_id,
    status: row.status,
    denialCode: row.denial_code,
    request: objectValue(row.request),
    result: objectValue(row.result),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function cleanDomains(values?: string[]): string[] {
  return Array.from(
    new Set(
      (values ?? [])
        .map((value) => value.trim().toLowerCase().replace(/^@/, ""))
        .filter((value) => /^[a-z0-9.-]+\.[a-z]{2,}$/.test(value))
    )
  ).slice(0, 50);
}

export async function getWorkspaceAutonomyPolicy(env: Env, auth: WorkspaceReminderAuth) {
  const sql = getDb(env);
  const rows = (await sql`
    SELECT mode, allowed_recipient_domains, min_confidence, max_sends_per_hour,
           created_at, updated_at
    FROM workspace_autonomy_policies
    WHERE owner_key = ${workspaceOwnerKey(auth)}
    LIMIT 1
  `) as PolicyRow[];
  return rows[0] ? formatPolicy(rows[0]) : defaultPolicy();
}

export async function setWorkspaceAutonomyPolicy(
  env: Env,
  auth: WorkspaceReminderAuth,
  input: WorkspaceAutonomyPolicyInput
): Promise<
  | { ok: true; policy: Awaited<ReturnType<typeof getWorkspaceAutonomyPolicy>> }
  | {
      ok: false;
      status: 400;
      error:
        | "invalid_mode"
        | "invalid_confidence"
        | "invalid_max_sends_per_hour"
        | "invalid_recipient_domain"
        | "recipient_allowlist_required";
    }
> {
  const mode = input.mode?.trim() as WorkspaceAutonomyMode | undefined;
  if (!mode || !MODES.has(mode)) return { ok: false, status: 400, error: "invalid_mode" };
  const minConfidence = (input.minConfidence?.trim() || "high") as WorkspaceConfidence;
  if (!CONFIDENCE.has(minConfidence)) {
    return { ok: false, status: 400, error: "invalid_confidence" };
  }
  const maxSendsPerHour = Number(input.maxSendsPerHour ?? 5);
  if (!Number.isInteger(maxSendsPerHour) || maxSendsPerHour < 1 || maxSendsPerHour > 100) {
    return { ok: false, status: 400, error: "invalid_max_sends_per_hour" };
  }
  const rawDomains = input.allowedRecipientDomains ?? [];
  if (
    rawDomains.some(
      (value) => !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(value.trim().replace(/^@/, ""))
    )
  ) {
    return { ok: false, status: 400, error: "invalid_recipient_domain" };
  }
  const domains = cleanDomains(rawDomains);
  if (mode === "auto_send_safe" && domains.length === 0) {
    return { ok: false, status: 400, error: "recipient_allowlist_required" };
  }
  const sql = getDb(env);
  const rows = (await sql`
    INSERT INTO workspace_autonomy_policies (
      owner_key, team_id, api_key_hint, mode, allowed_recipient_domains,
      min_confidence, max_sends_per_hour
    )
    VALUES (
      ${workspaceOwnerKey(auth)}, ${auth.teamId}, ${auth.apiKeyHint}, ${mode},
      ${domains}, ${minConfidence}, ${maxSendsPerHour}
    )
    ON CONFLICT (owner_key) DO UPDATE SET
      team_id = EXCLUDED.team_id,
      api_key_hint = EXCLUDED.api_key_hint,
      mode = EXCLUDED.mode,
      allowed_recipient_domains = EXCLUDED.allowed_recipient_domains,
      min_confidence = EXCLUDED.min_confidence,
      max_sends_per_hour = EXCLUDED.max_sends_per_hour,
      updated_at = NOW()
    RETURNING mode, allowed_recipient_domains, min_confidence, max_sends_per_hour,
              created_at, updated_at
  `) as PolicyRow[];
  return { ok: true, policy: formatPolicy(rows[0]!) };
}

export type WorkspaceExecutionClaimInput = {
  idempotencyKey: string;
  reminderId?: string;
  inboxId: string;
  messageId: string;
  request: Record<string, unknown>;
};

export async function claimWorkspaceExecution(
  env: Env,
  auth: WorkspaceReminderAuth,
  input: WorkspaceExecutionClaimInput
) {
  const sql = getDb(env);
  const ownerKey = workspaceOwnerKey(auth);
  const id = `wx_${nanoid(16)}`;
  const rows = (await sql`
    INSERT INTO workspace_executions (
      id, owner_key, team_id, api_key_hint, idempotency_key, reminder_id,
      inbox_id, message_id, request
    )
    VALUES (
      ${id}, ${ownerKey}, ${auth.teamId}, ${auth.apiKeyHint}, ${input.idempotencyKey},
      ${input.reminderId ?? null}, ${input.inboxId}, ${input.messageId},
      ${JSON.stringify(input.request)}::jsonb
    )
    ON CONFLICT (owner_key, idempotency_key) DO NOTHING
    RETURNING id, idempotency_key, reminder_id, inbox_id, message_id, status,
              denial_code, request, result, created_at, updated_at
  `) as ExecutionRow[];
  if (rows[0]) return { claimed: true as const, execution: formatExecution(rows[0]) };
  const existing = (await sql`
    SELECT id, idempotency_key, reminder_id, inbox_id, message_id, status,
           denial_code, request, result, created_at, updated_at
    FROM workspace_executions
    WHERE owner_key = ${ownerKey} AND idempotency_key = ${input.idempotencyKey}
    LIMIT 1
  `) as ExecutionRow[];
  return { claimed: false as const, execution: formatExecution(existing[0]!) };
}

export async function finishWorkspaceExecution(
  env: Env,
  auth: WorkspaceReminderAuth,
  id: string,
  update: {
    status: "sent" | "denied" | "failed";
    denialCode?: string;
    result?: Record<string, unknown>;
  }
) {
  const sql = getDb(env);
  const rows = (await sql`
    UPDATE workspace_executions
    SET status = ${update.status},
        denial_code = ${update.denialCode ?? null},
        result = ${JSON.stringify(update.result ?? {})}::jsonb,
        updated_at = NOW()
    WHERE id = ${id} AND owner_key = ${workspaceOwnerKey(auth)}
    RETURNING id, idempotency_key, reminder_id, inbox_id, message_id, status,
              denial_code, request, result, created_at, updated_at
  `) as ExecutionRow[];
  return rows[0] ? formatExecution(rows[0]) : null;
}

export async function countRecentWorkspaceExecutions(env: Env, auth: WorkspaceReminderAuth) {
  const sql = getDb(env);
  const rows = (await sql`
    SELECT COUNT(*)::int AS count
    FROM workspace_executions
    WHERE owner_key = ${workspaceOwnerKey(auth)}
      AND status IN ('pending', 'sent')
      AND created_at >= NOW() - INTERVAL '1 hour'
  `) as { count: number }[];
  return rows[0]?.count ?? 0;
}
