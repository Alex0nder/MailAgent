/** Workspace Agent action log: what the agent drafted, completed, or blocked on. */
import { nanoid } from "nanoid";
import type { Env } from "../env";
import { getDb } from "../db/client";
import { type WorkspaceReminderAuth, workspaceOwnerKey } from "./workspace-reminders";

export type WorkspaceActionType =
  | "draft_prepared"
  | "waiting"
  | "completed"
  | "blocked"
  | "note";

export type WorkspaceActionStatus = "done" | "waiting" | "blocked";

export type WorkspaceActionInput = {
  reminderId?: string;
  threadId?: string;
  messageId?: string;
  actionType?: string;
  title?: string;
  note?: string;
  status?: string;
  meta?: Record<string, unknown>;
};

type WorkspaceActionRow = {
  id: string;
  reminder_id: string | null;
  thread_id: string | null;
  message_id: string | null;
  action_type: WorkspaceActionType;
  title: string;
  note: string | null;
  status: WorkspaceActionStatus;
  meta: unknown;
  created_at: string;
};

const ACTION_TYPES = new Set<WorkspaceActionType>([
  "draft_prepared",
  "waiting",
  "completed",
  "blocked",
  "note",
]);

const STATUSES = new Set<WorkspaceActionStatus>(["done", "waiting", "blocked"]);

function cleanString(value?: string, max = 256): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

function cleanActionType(value?: string): WorkspaceActionType | "invalid" {
  const clean = cleanString(value, 64) as WorkspaceActionType | null;
  if (!clean) return "note";
  return ACTION_TYPES.has(clean) ? clean : "invalid";
}

function cleanStatus(
  value: string | undefined,
  actionType: WorkspaceActionType
): WorkspaceActionStatus | "invalid" {
  const clean = cleanString(value, 64) as WorkspaceActionStatus | null;
  if (clean) return STATUSES.has(clean) ? clean : "invalid";
  if (actionType === "waiting") return "waiting";
  if (actionType === "blocked") return "blocked";
  return "done";
}

function formatWorkspaceAction(row: WorkspaceActionRow) {
  const meta =
    row.meta && typeof row.meta === "object" && !Array.isArray(row.meta)
      ? (row.meta as Record<string, unknown>)
      : {};
  return {
    id: row.id,
    reminderId: row.reminder_id,
    threadId: row.thread_id,
    messageId: row.message_id,
    actionType: row.action_type,
    title: row.title,
    note: row.note,
    status: row.status,
    meta,
    createdAt: row.created_at,
  };
}

export async function logWorkspaceAction(
  env: Env,
  auth: WorkspaceReminderAuth,
  input: WorkspaceActionInput
): Promise<
  | { ok: true; action: ReturnType<typeof formatWorkspaceAction> }
  | {
      ok: false;
      status: 400;
      error: "title_required" | "invalid_action_type" | "invalid_status";
    }
> {
  const title = cleanString(input.title, 240);
  if (!title) return { ok: false, status: 400, error: "title_required" };
  const actionType = cleanActionType(input.actionType);
  if (actionType === "invalid") {
    return { ok: false, status: 400, error: "invalid_action_type" };
  }
  const status = cleanStatus(input.status, actionType);
  if (status === "invalid") {
    return { ok: false, status: 400, error: "invalid_status" };
  }
  const sql = getDb(env);
  const id = `wa_${nanoid(16)}`;
  const rows = (await sql`
    INSERT INTO workspace_actions (
      id, owner_key, team_id, api_key_hint, reminder_id, thread_id, message_id,
      action_type, title, note, status, meta
    )
    VALUES (
      ${id},
      ${workspaceOwnerKey(auth)},
      ${auth.teamId},
      ${auth.apiKeyHint},
      ${cleanString(input.reminderId, 120)},
      ${cleanString(input.threadId, 160)},
      ${cleanString(input.messageId, 160)},
      ${actionType},
      ${title},
      ${cleanString(input.note, 2000)},
      ${status},
      ${JSON.stringify(input.meta ?? {})}::jsonb
    )
    RETURNING id, reminder_id, thread_id, message_id, action_type, title,
              note, status, meta, created_at
  `) as WorkspaceActionRow[];
  return { ok: true, action: formatWorkspaceAction(rows[0]!) };
}

export async function listWorkspaceActions(
  env: Env,
  auth: WorkspaceReminderAuth,
  options: { reminderId?: string; threadId?: string; limit?: number } = {}
) {
  const sql = getDb(env);
  const ownerKey = workspaceOwnerKey(auth);
  const limit = Math.min(Math.max(1, Number(options.limit ?? 50)), 100);
  const reminderId = cleanString(options.reminderId, 120);
  const threadId = cleanString(options.threadId, 160);
  const rows = reminderId
    ? ((await sql`
        SELECT id, reminder_id, thread_id, message_id, action_type, title,
               note, status, meta, created_at
        FROM workspace_actions
        WHERE owner_key = ${ownerKey} AND reminder_id = ${reminderId}
        ORDER BY created_at DESC
        LIMIT ${limit}
      `) as WorkspaceActionRow[])
    : threadId
      ? ((await sql`
          SELECT id, reminder_id, thread_id, message_id, action_type, title,
                 note, status, meta, created_at
          FROM workspace_actions
          WHERE owner_key = ${ownerKey} AND thread_id = ${threadId}
          ORDER BY created_at DESC
          LIMIT ${limit}
        `) as WorkspaceActionRow[])
      : ((await sql`
          SELECT id, reminder_id, thread_id, message_id, action_type, title,
                 note, status, meta, created_at
          FROM workspace_actions
          WHERE owner_key = ${ownerKey}
          ORDER BY created_at DESC
          LIMIT ${limit}
        `) as WorkspaceActionRow[]);

  return rows.map(formatWorkspaceAction);
}
