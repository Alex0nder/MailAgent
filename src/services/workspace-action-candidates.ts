/** Durable Today queue: proposed actions discovered by workspace monitors. */
import { nanoid } from "nanoid";
import type { Env } from "../env";
import { getDb } from "../db/client";
import type { WorkspaceRuleMatch } from "./workspace-rule-engine";
import { type WorkspaceReminderAuth, workspaceOwnerKey } from "./workspace-reminders";

export type WorkspaceCandidateStatus = "new" | "approved" | "dismissed" | "completed" | "blocked";
export type WorkspaceCandidateDecision = "approved" | "dismissed";

type CandidateRow = {
  id: string;
  source_type: string;
  source_id: string;
  account_id: string | null;
  monitor_id: string | null;
  kind: string;
  title: string;
  summary: string | null;
  suggested_action: string;
  confidence: string;
  status: WorkspaceCandidateStatus;
  meta: unknown;
  decided_at: string | null;
  created_at: string;
  updated_at: string;
};

export type GmailRuleCandidateInput = {
  accountId: string;
  monitorId?: string;
  threadId: string;
  subject?: string | null;
  snippet?: string | null;
  from?: string | null;
  match: WorkspaceRuleMatch;
};

function clean(value: string | null | undefined, max: number): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

function formatCandidate(row: CandidateRow) {
  return {
    id: row.id,
    sourceType: row.source_type,
    sourceId: row.source_id,
    accountId: row.account_id,
    monitorId: row.monitor_id,
    kind: row.kind,
    title: row.title,
    summary: row.summary,
    suggestedAction: row.suggested_action,
    confidence: row.confidence,
    status: row.status,
    meta:
      row.meta && typeof row.meta === "object" && !Array.isArray(row.meta)
        ? (row.meta as Record<string, unknown>)
        : {},
    decidedAt: row.decided_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function upsertGmailRuleCandidates(
  env: Env,
  auth: WorkspaceReminderAuth,
  inputs: GmailRuleCandidateInput[]
) {
  if (!inputs.length) return [];
  const sql = getDb(env);
  const ownerKey = workspaceOwnerKey(auth);
  const results = [];

  for (const input of inputs) {
    const sourceKey = `gmail:${input.accountId}:${input.threadId}:${input.match.kind}`;
    const title = clean(input.subject, 300) ?? "Untitled Gmail thread";
    const summary = clean(input.snippet, 1200);
    const rows = (await sql`
      INSERT INTO workspace_action_candidates (
        id, owner_key, team_id, api_key_hint, source_key, source_type, source_id,
        account_id, monitor_id, kind, title, summary, suggested_action, confidence, meta
      ) VALUES (
        ${`wac_${nanoid(16)}`}, ${ownerKey}, ${auth.teamId}, ${auth.apiKeyHint},
        ${sourceKey}, 'gmail_thread', ${input.threadId}, ${input.accountId},
        ${clean(input.monitorId, 120)}, ${input.match.kind}, ${title}, ${summary},
        ${input.match.suggestedAction}, ${input.match.confidence},
        ${JSON.stringify({ from: clean(input.from, 320), reason: input.match.reason })}::jsonb
      )
      ON CONFLICT (owner_key, source_key) DO UPDATE SET
        monitor_id = COALESCE(EXCLUDED.monitor_id, workspace_action_candidates.monitor_id),
        title = EXCLUDED.title,
        summary = EXCLUDED.summary,
        suggested_action = EXCLUDED.suggested_action,
        confidence = EXCLUDED.confidence,
        meta = EXCLUDED.meta,
        updated_at = NOW()
      RETURNING id, source_type, source_id, account_id, monitor_id, kind, title,
                summary, suggested_action, confidence, status, meta, decided_at,
                created_at, updated_at
    `) as CandidateRow[];
    if (rows[0]) results.push(formatCandidate(rows[0]));
  }

  return results;
}

export async function listWorkspaceActionCandidates(
  env: Env,
  auth: WorkspaceReminderAuth,
  options: { status?: WorkspaceCandidateStatus | "open" | "all"; limit?: number } = {}
) {
  const sql = getDb(env);
  const ownerKey = workspaceOwnerKey(auth);
  const limit = Math.min(Math.max(Number(options.limit ?? 50), 1), 100);
  const status = options.status ?? "open";
  const rows = status === "all"
    ? ((await sql`
        SELECT id, source_type, source_id, account_id, monitor_id, kind, title,
               summary, suggested_action, confidence, status, meta, decided_at,
               created_at, updated_at
        FROM workspace_action_candidates
        WHERE owner_key = ${ownerKey}
        ORDER BY updated_at DESC, id DESC
        LIMIT ${limit}
      `) as CandidateRow[])
    : status === "open"
      ? ((await sql`
          SELECT id, source_type, source_id, account_id, monitor_id, kind, title,
                 summary, suggested_action, confidence, status, meta, decided_at,
                 created_at, updated_at
          FROM workspace_action_candidates
          WHERE owner_key = ${ownerKey} AND status IN ('new', 'approved')
          ORDER BY CASE status WHEN 'new' THEN 0 ELSE 1 END, updated_at DESC, id DESC
          LIMIT ${limit}
        `) as CandidateRow[])
      : ((await sql`
          SELECT id, source_type, source_id, account_id, monitor_id, kind, title,
                 summary, suggested_action, confidence, status, meta, decided_at,
                 created_at, updated_at
          FROM workspace_action_candidates
          WHERE owner_key = ${ownerKey} AND status = ${status}
          ORDER BY updated_at DESC, id DESC
          LIMIT ${limit}
        `) as CandidateRow[]);
  return rows.map(formatCandidate);
}

export async function decideWorkspaceActionCandidate(
  env: Env,
  auth: WorkspaceReminderAuth,
  candidateId: string,
  decision: string
): Promise<
  | { ok: true; candidate: ReturnType<typeof formatCandidate> }
  | { ok: false; status: 400 | 404; error: "invalid_decision" | "candidate_not_found" }
> {
  if (decision !== "approved" && decision !== "dismissed") {
    return { ok: false, status: 400, error: "invalid_decision" };
  }
  const sql = getDb(env);
  const rows = (await sql`
    UPDATE workspace_action_candidates
    SET status = ${decision}, decided_at = NOW(), updated_at = NOW()
    WHERE id = ${candidateId} AND owner_key = ${workspaceOwnerKey(auth)}
    RETURNING id, source_type, source_id, account_id, monitor_id, kind, title,
              summary, suggested_action, confidence, status, meta, decided_at,
              created_at, updated_at
  `) as CandidateRow[];
  if (!rows[0]) return { ok: false, status: 404, error: "candidate_not_found" };
  return { ok: true, candidate: formatCandidate(rows[0]) };
}
