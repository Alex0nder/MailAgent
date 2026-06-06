/** Aggregates for GET /v1/stats */
import { neon } from "@neondatabase/serverless";
import type { Env } from "../env";

export async function getUsageStats(env: Env) {
  const sql = neon(env.DATABASE_URL);

  const [inboxes] = await sql`
    SELECT
      COUNT(*) FILTER (WHERE expires_at > NOW())::int AS active,
      COUNT(*) FILTER (WHERE expires_at <= NOW())::int AS expired
    FROM inboxes
  `;

  const [messages] = await sql`
    SELECT COUNT(*)::int AS last_24h
    FROM messages
    WHERE received_at > NOW() - INTERVAL '24 hours'
  `;

  const row = inboxes as { active: number; expired: number };
  const msg = messages as { last_24h: number };

  return {
    inboxes: { active: row?.active ?? 0, expired: row?.expired ?? 0 },
    messages: { last24h: msg?.last_24h ?? 0 },
  };
}
