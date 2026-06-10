/** List agent runs (label agent-*) */
import type { Env } from "../env";
import { parseRunIdFromLabel } from "../lib/agent-recipes";
import { getDb } from "../db/client";
import type { InboxRow } from "./inbox";

export interface AgentRunSummary {
  runId: string;
  inboxCount: number;
  latestAt: string;
  inboxes: {
    id: string;
    address: string;
    label: string | null;
    expiresAt: string;
    createdAt: string;
  }[];
}

export async function listAgentRuns(
  env: Env,
  apiKeyHint: string,
  options?: { limit?: number; runId?: string; label?: string }
): Promise<AgentRunSummary[]> {
  const sql = getDb(env);
  const limit = Math.min(options?.limit ?? 30, 100);
  const runFilter = options?.runId?.trim();
  const labelFilter = options?.label?.trim();

  const labelPattern = labelFilter
    ? `${labelFilter}%`
    : runFilter
      ? `agent-${runFilter}%`
      : "agent-%";

  const rows = (await sql`
    SELECT id, address, expires_at, created_at, allowed_senders, label, callback_url, api_key_hint
    FROM inboxes
    WHERE expires_at > NOW()
      AND label LIKE ${labelPattern}
      AND (api_key_hint IS NULL OR api_key_hint = ${apiKeyHint})
    ORDER BY created_at DESC
    LIMIT ${limit}
  `) as InboxRow[];

  const grouped = new Map<string, AgentRunSummary>();

  for (const row of rows) {
    const runId = labelFilter
      ? row.label ?? row.id
      : parseRunIdFromLabel(row.label);
    if (!runId) continue;
    if (runFilter && runId !== runFilter) continue;

    const entry = grouped.get(runId) ?? {
      runId,
      inboxCount: 0,
      latestAt: row.created_at,
      inboxes: [],
    };

    entry.inboxes.push({
      id: row.id,
      address: row.address,
      label: row.label,
      expiresAt: row.expires_at,
      createdAt: row.created_at,
    });
    entry.inboxCount += 1;
    if (row.created_at > entry.latestAt) entry.latestAt = row.created_at;
    grouped.set(runId, entry);
  }

  return [...grouped.values()].sort((a, b) =>
    b.latestAt.localeCompare(a.latestAt)
  );
}
