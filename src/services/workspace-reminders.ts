/** Workspace Agent persistent reminders / follow-ups. */
import { nanoid } from "nanoid";
import type { Env } from "../env";
import { getDb } from "../db/client";

export type WorkspaceReminderAuth = {
  teamId: string | null;
  apiKeyHint: string;
};

export type WorkspaceReminderInput = {
  title?: string;
  dueAt?: string;
  dueHint?: string;
  source?: string;
  sourceThreadId?: string;
  sourceMessageId?: string;
  meta?: Record<string, unknown>;
};

export type WorkspaceReminderStatus = "open" | "completed";

type WorkspaceReminderRow = {
  id: string;
  team_id: string | null;
  api_key_hint: string;
  title: string;
  due_at: string | null;
  due_hint: string | null;
  source: string | null;
  source_thread_id: string | null;
  source_message_id: string | null;
  status: WorkspaceReminderStatus;
  meta: unknown;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
};

export function workspaceOwnerKey(auth: WorkspaceReminderAuth): string {
  return auth.teamId?.trim() || auth.apiKeyHint;
}

function cleanString(value?: string, max = 256): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

function cleanDueAt(value?: string): string | null | "invalid" {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) return "invalid";
  return date.toISOString();
}

function formatWorkspaceReminder(row: WorkspaceReminderRow) {
  const meta =
    row.meta && typeof row.meta === "object" && !Array.isArray(row.meta)
      ? (row.meta as Record<string, unknown>)
      : {};
  return {
    id: row.id,
    title: row.title,
    dueAt: row.due_at,
    dueHint: row.due_hint,
    source: row.source,
    sourceThreadId: row.source_thread_id,
    sourceMessageId: row.source_message_id,
    status: row.status,
    meta,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
  };
}

export async function createWorkspaceReminder(
  env: Env,
  auth: WorkspaceReminderAuth,
  input: WorkspaceReminderInput
): Promise<
  | { ok: true; reminder: ReturnType<typeof formatWorkspaceReminder> }
  | { ok: false; status: 400; error: "title_required" | "invalid_due_at" }
> {
  const title = cleanString(input.title, 240);
  if (!title) return { ok: false, status: 400, error: "title_required" };
  const dueAt = cleanDueAt(input.dueAt);
  if (dueAt === "invalid") return { ok: false, status: 400, error: "invalid_due_at" };

  const sql = getDb(env);
  const id = `wr_${nanoid(16)}`;
  const ownerKey = workspaceOwnerKey(auth);
  const rows = (await sql`
    INSERT INTO workspace_reminders (
      id, owner_key, team_id, api_key_hint, title, due_at, due_hint,
      source, source_thread_id, source_message_id, meta
    )
    VALUES (
      ${id},
      ${ownerKey},
      ${auth.teamId},
      ${auth.apiKeyHint},
      ${title},
      ${dueAt},
      ${cleanString(input.dueHint, 160)},
      ${cleanString(input.source, 64)},
      ${cleanString(input.sourceThreadId, 160)},
      ${cleanString(input.sourceMessageId, 160)},
      ${JSON.stringify(input.meta ?? {})}::jsonb
    )
    RETURNING id, team_id, api_key_hint, title, due_at, due_hint, source,
              source_thread_id, source_message_id, status, meta,
              created_at, updated_at, completed_at
  `) as WorkspaceReminderRow[];

  return { ok: true, reminder: formatWorkspaceReminder(rows[0]) };
}

export async function listWorkspaceReminders(
  env: Env,
  auth: WorkspaceReminderAuth,
  options: { status?: "open" | "completed" | "all"; limit?: number } = {}
) {
  const sql = getDb(env);
  const ownerKey = workspaceOwnerKey(auth);
  const limit = Math.min(Math.max(1, Number(options.limit ?? 50)), 100);
  const status = options.status ?? "open";
  const rows =
    status === "all"
      ? ((await sql`
          SELECT id, team_id, api_key_hint, title, due_at, due_hint, source,
                 source_thread_id, source_message_id, status, meta,
                 created_at, updated_at, completed_at
          FROM workspace_reminders
          WHERE owner_key = ${ownerKey}
          ORDER BY status ASC, due_at NULLS LAST, created_at DESC
          LIMIT ${limit}
        `) as WorkspaceReminderRow[])
      : ((await sql`
          SELECT id, team_id, api_key_hint, title, due_at, due_hint, source,
                 source_thread_id, source_message_id, status, meta,
                 created_at, updated_at, completed_at
          FROM workspace_reminders
          WHERE owner_key = ${ownerKey} AND status = ${status}
          ORDER BY due_at NULLS LAST, created_at DESC
          LIMIT ${limit}
        `) as WorkspaceReminderRow[]);

  return rows.map(formatWorkspaceReminder);
}

export async function completeWorkspaceReminder(
  env: Env,
  auth: WorkspaceReminderAuth,
  id: string
): Promise<
  | { ok: true; reminder: ReturnType<typeof formatWorkspaceReminder> }
  | { ok: false; status: 400 | 404; error: "id_required" | "reminder_not_found" }
> {
  const cleanId = cleanString(id, 80);
  if (!cleanId) return { ok: false, status: 400, error: "id_required" };
  const sql = getDb(env);
  const ownerKey = workspaceOwnerKey(auth);
  const rows = (await sql`
    UPDATE workspace_reminders
    SET status = 'completed',
        completed_at = COALESCE(completed_at, NOW()),
        updated_at = NOW()
    WHERE id = ${cleanId} AND owner_key = ${ownerKey}
    RETURNING id, team_id, api_key_hint, title, due_at, due_hint, source,
              source_thread_id, source_message_id, status, meta,
              created_at, updated_at, completed_at
  `) as WorkspaceReminderRow[];
  const row = rows[0];
  if (!row) return { ok: false, status: 404, error: "reminder_not_found" };
  return { ok: true, reminder: formatWorkspaceReminder(row) };
}
