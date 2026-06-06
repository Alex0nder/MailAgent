/** Scoped recent email threads for hosted console */
import type { Env } from "../env";
import { getDb } from "../db/client";

export type ConsoleThreadRow = {
  inbox_id: string;
  inbox_address: string;
  thread_id: string;
  subject: string | null;
  message_count: number;
  last_message_at: string;
  last_direction: string;
};

export type ConsoleThread = {
  inboxId: string;
  inboxAddress: string;
  threadId: string;
  subject: string | null;
  messageCount: number;
  lastMessageAt: string;
  lastDirection: "inbound" | "outbound";
  threadsUrl: string;
};

function formatThread(row: ConsoleThreadRow): ConsoleThread {
  return {
    inboxId: row.inbox_id,
    inboxAddress: row.inbox_address,
    threadId: row.thread_id,
    subject: row.subject,
    messageCount: row.message_count,
    lastMessageAt: row.last_message_at,
    lastDirection: row.last_direction === "outbound" ? "outbound" : "inbound",
    threadsUrl: `/v1/inboxes/${row.inbox_id}/threads/${row.thread_id}/messages`,
  };
}

export async function listRecentThreadsForScope(
  env: Env,
  scope: { teamId: string | null; apiKeyHint: string },
  options?: { limit?: number }
): Promise<ConsoleThread[]> {
  const sql = getDb(env);
  const limit = Math.min(options?.limit ?? 15, 50);

  const rows = scope.teamId
    ? ((await sql`
        SELECT
          i.id AS inbox_id,
          i.address AS inbox_address,
          COALESCE(m.thread_id, m.id) AS thread_id,
          MAX(m.subject) AS subject,
          COUNT(*)::int AS message_count,
          MAX(m.received_at) AS last_message_at,
          (ARRAY_AGG(m.direction ORDER BY m.received_at DESC))[1] AS last_direction
        FROM messages m
        INNER JOIN inboxes i ON i.id = m.inbox_id
        WHERE i.expires_at > NOW()
          AND i.api_key_hint IN (
            SELECT key_hint FROM api_keys WHERE team_id = ${scope.teamId}
          )
        GROUP BY i.id, i.address, COALESCE(m.thread_id, m.id)
        ORDER BY last_message_at DESC
        LIMIT ${limit}
      `) as ConsoleThreadRow[])
    : ((await sql`
        SELECT
          i.id AS inbox_id,
          i.address AS inbox_address,
          COALESCE(m.thread_id, m.id) AS thread_id,
          MAX(m.subject) AS subject,
          COUNT(*)::int AS message_count,
          MAX(m.received_at) AS last_message_at,
          (ARRAY_AGG(m.direction ORDER BY m.received_at DESC))[1] AS last_direction
        FROM messages m
        INNER JOIN inboxes i ON i.id = m.inbox_id
        WHERE i.expires_at > NOW()
          AND (i.api_key_hint IS NULL OR i.api_key_hint = ${scope.apiKeyHint})
        GROUP BY i.id, i.address, COALESCE(m.thread_id, m.id)
        ORDER BY last_message_at DESC
        LIMIT ${limit}
      `) as ConsoleThreadRow[]);

  return rows.map(formatThread);
}
