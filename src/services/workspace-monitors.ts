/** CRUD + scheduler for workspace monitors (P4.22). */
import { nanoid } from "nanoid";
import type { Env } from "../env";
import { getDb } from "../db/client";
import { parseCallbackUrl } from "../lib/callback-url";
import type { WorkspaceRuleKind } from "./workspace-rule-engine";
import { WORKSPACE_RULE_KINDS } from "./workspace-rule-engine";
import type { WorkspaceReminderAuth } from "./workspace-reminders";
import { workspaceOwnerKey } from "./workspace-reminders";

export type WorkspaceMonitorInput = {
  name?: string;
  enabled?: boolean;
  scheduleHours?: number;
  gmailAccountId?: string;
  calendarAccountId?: string;
  digestWebhookUrl?: string | null;
  digestEmail?: string | null;
  ruleKinds?: string[];
};

type MonitorRow = {
  id: string;
  owner_key: string;
  team_id: string | null;
  api_key_hint: string;
  name: string;
  enabled: boolean;
  schedule_hours: number;
  gmail_account_id: string | null;
  calendar_account_id: string | null;
  digest_webhook_url: string | null;
  digest_email: string | null;
  rule_kinds: string[];
  last_run_at: string | null;
  next_run_at: string | null;
  last_status: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
};

export type WorkspaceMonitor = ReturnType<typeof formatMonitor>;

function formatMonitor(row: MonitorRow) {
  return {
    id: row.id,
    name: row.name,
    enabled: row.enabled,
    scheduleHours: row.schedule_hours,
    gmailAccountId: row.gmail_account_id,
    calendarAccountId: row.calendar_account_id,
    digestWebhookUrl: row.digest_webhook_url,
    digestEmail: row.digest_email,
    ruleKinds: row.rule_kinds ?? [],
    lastRunAt: row.last_run_at,
    nextRunAt: row.next_run_at,
    lastStatus: row.last_status,
    lastError: row.last_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function clampScheduleHours(value: number): number {
  return Math.min(168, Math.max(1, Math.trunc(value)));
}

function cleanRuleKinds(values?: string[]): WorkspaceRuleKind[] {
  const allowed = new Set(WORKSPACE_RULE_KINDS);
  return Array.from(
    new Set((values ?? WORKSPACE_RULE_KINDS).map((value) => value.trim() as WorkspaceRuleKind))
  ).filter((kind) => allowed.has(kind));
}

function cleanWebhook(value?: string | null): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  return parseCallbackUrl(trimmed);
}

function cleanEmail(value?: string | null): string | null | "invalid" {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed) ? trimmed.toLowerCase() : "invalid";
}

export async function listWorkspaceMonitors(
  env: Env,
  auth: WorkspaceReminderAuth
): Promise<WorkspaceMonitor[]> {
  const sql = getDb(env);
  const rows = (await sql`
    SELECT id, owner_key, team_id, api_key_hint, name, enabled, schedule_hours,
           gmail_account_id, calendar_account_id, digest_webhook_url, digest_email,
           rule_kinds, last_run_at, next_run_at, last_status, last_error,
           created_at, updated_at
    FROM workspace_monitors
    WHERE owner_key = ${workspaceOwnerKey(auth)}
    ORDER BY created_at DESC
  `) as MonitorRow[];
  return rows.map(formatMonitor);
}

export async function getWorkspaceMonitorRow(
  env: Env,
  auth: WorkspaceReminderAuth,
  monitorId: string
): Promise<MonitorRow | null> {
  const sql = getDb(env);
  const rows = (await sql`
    SELECT id, owner_key, team_id, api_key_hint, name, enabled, schedule_hours,
           gmail_account_id, calendar_account_id, digest_webhook_url, digest_email,
           rule_kinds, last_run_at, next_run_at, last_status, last_error,
           created_at, updated_at
    FROM workspace_monitors
    WHERE id = ${monitorId} AND owner_key = ${workspaceOwnerKey(auth)}
    LIMIT 1
  `) as MonitorRow[];
  return rows[0] ?? null;
}

export async function getWorkspaceMonitor(
  env: Env,
  auth: WorkspaceReminderAuth,
  monitorId: string
): Promise<WorkspaceMonitor | null> {
  const sql = getDb(env);
  const rows = (await sql`
    SELECT id, owner_key, team_id, api_key_hint, name, enabled, schedule_hours,
           gmail_account_id, calendar_account_id, digest_webhook_url, digest_email,
           rule_kinds, last_run_at, next_run_at, last_status, last_error,
           created_at, updated_at
    FROM workspace_monitors
    WHERE id = ${monitorId} AND owner_key = ${workspaceOwnerKey(auth)}
    LIMIT 1
  `) as MonitorRow[];
  return rows[0] ? formatMonitor(rows[0]) : null;
}

export async function createWorkspaceMonitor(
  env: Env,
  auth: WorkspaceReminderAuth,
  input: WorkspaceMonitorInput
): Promise<
  | { ok: true; monitor: WorkspaceMonitor }
  | { ok: false; status: 400; error: string }
> {
  const name = input.name?.trim();
  if (!name) return { ok: false, status: 400, error: "name_required" };
  const gmailAccountId = input.gmailAccountId?.trim() || null;
  const calendarAccountId = input.calendarAccountId?.trim() || null;
  if (!gmailAccountId && !calendarAccountId) {
    return { ok: false, status: 400, error: "gmail_or_calendar_account_required" };
  }
  const webhook = input.digestWebhookUrl === undefined ? null : cleanWebhook(input.digestWebhookUrl);
  if (input.digestWebhookUrl?.trim() && !webhook) {
    return { ok: false, status: 400, error: "invalid_digest_webhook_url" };
  }
  const email = input.digestEmail === undefined ? null : cleanEmail(input.digestEmail);
  if (email === "invalid") return { ok: false, status: 400, error: "invalid_digest_email" };
  if (!webhook && !email) {
    return { ok: false, status: 400, error: "digest_webhook_or_email_required" };
  }

  const id = `wmon_${nanoid(16)}`;
  const scheduleHours = clampScheduleHours(Number(input.scheduleHours ?? 24));
  const ruleKinds = cleanRuleKinds(input.ruleKinds);
  const sql = getDb(env);
  const rows = (await sql`
    INSERT INTO workspace_monitors (
      id, owner_key, team_id, api_key_hint, name, enabled, schedule_hours,
      gmail_account_id, calendar_account_id, digest_webhook_url, digest_email,
      rule_kinds, next_run_at
    ) VALUES (
      ${id}, ${workspaceOwnerKey(auth)}, ${auth.teamId}, ${auth.apiKeyHint}, ${name},
      ${input.enabled !== false}, ${scheduleHours}, ${gmailAccountId}, ${calendarAccountId},
      ${webhook}, ${email}, ${ruleKinds}, NOW()
    )
    RETURNING id, owner_key, team_id, api_key_hint, name, enabled, schedule_hours,
              gmail_account_id, calendar_account_id, digest_webhook_url, digest_email,
              rule_kinds, last_run_at, next_run_at, last_status, last_error,
              created_at, updated_at
  `) as MonitorRow[];
  return { ok: true, monitor: formatMonitor(rows[0]!) };
}

export async function deleteWorkspaceMonitor(
  env: Env,
  auth: WorkspaceReminderAuth,
  monitorId: string
): Promise<boolean> {
  const sql = getDb(env);
  const rows = (await sql`
    DELETE FROM workspace_monitors
    WHERE id = ${monitorId} AND owner_key = ${workspaceOwnerKey(auth)}
    RETURNING id
  `) as { id: string }[];
  return Boolean(rows[0]);
}

export async function listDueWorkspaceMonitors(env: Env, limit = 20): Promise<MonitorRow[]> {
  const sql = getDb(env);
  return (await sql`
    SELECT id, owner_key, team_id, api_key_hint, name, enabled, schedule_hours,
           gmail_account_id, calendar_account_id, digest_webhook_url, digest_email,
           rule_kinds, last_run_at, next_run_at, last_status, last_error,
           created_at, updated_at
    FROM workspace_monitors
    WHERE enabled = TRUE
      AND (next_run_at IS NULL OR next_run_at <= NOW())
    ORDER BY next_run_at NULLS FIRST, created_at ASC
    LIMIT ${limit}
  `) as MonitorRow[];
}

export async function markWorkspaceMonitorRun(
  env: Env,
  monitorId: string,
  update: {
    status: string;
    error?: string | null;
    scheduleHours: number;
  }
) {
  const sql = getDb(env);
  const nextRun = new Date(Date.now() + update.scheduleHours * 3_600_000).toISOString();
  await sql`
    UPDATE workspace_monitors
    SET last_run_at = NOW(),
        next_run_at = ${nextRun},
        last_status = ${update.status},
        last_error = ${update.error ?? null},
        updated_at = NOW()
    WHERE id = ${monitorId}
  `;
}

export async function recordWorkspaceMonitorRun(
  env: Env,
  input: {
    monitorId: string;
    ownerKey: string;
    status: string;
    summary: Record<string, unknown>;
    deliveredVia: string | null;
    deliveryOk: boolean | null;
  }
) {
  const sql = getDb(env);
  const id = `wmrun_${nanoid(16)}`;
  await sql`
    INSERT INTO workspace_monitor_runs (
      id, monitor_id, owner_key, status, summary, delivered_via, delivery_ok
    ) VALUES (
      ${id}, ${input.monitorId}, ${input.ownerKey}, ${input.status},
      ${JSON.stringify(input.summary)}::jsonb, ${input.deliveredVia}, ${input.deliveryOk}
    )
  `;
  return id;
}

export async function listWorkspaceMonitorRuns(
  env: Env,
  auth: WorkspaceReminderAuth,
  monitorId: string,
  limit = 20
) {
  const sql = getDb(env);
  const rows = (await sql`
    SELECT id, monitor_id, owner_key, status, summary, delivered_via, delivery_ok, created_at
    FROM workspace_monitor_runs
    WHERE monitor_id = ${monitorId} AND owner_key = ${workspaceOwnerKey(auth)}
    ORDER BY created_at DESC
    LIMIT ${Math.min(Math.max(limit, 1), 50)}
  `) as Array<{
    id: string;
    monitor_id: string;
    status: string;
    summary: unknown;
    delivered_via: string | null;
    delivery_ok: boolean | null;
    created_at: string;
  }>;
  return rows.map((row) => ({
    id: row.id,
    monitorId: row.monitor_id,
    status: row.status,
    summary: row.summary,
    deliveredVia: row.delivered_via,
    deliveryOk: row.delivery_ok,
    createdAt: row.created_at,
  }));
}

export type MonitorRowAuth = Pick<MonitorRow, "team_id" | "api_key_hint" | "owner_key">;

export function monitorAuth(row: MonitorRowAuth): WorkspaceReminderAuth {
  return { teamId: row.team_id, apiKeyHint: row.api_key_hint };
}

export { formatMonitor, type MonitorRow };
