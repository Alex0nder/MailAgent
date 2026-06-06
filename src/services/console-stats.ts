/** Scoped usage meters for hosted console (team / API key hint) */
import type { Env } from "../env";
import { getDb } from "../db/client";
import { countDomainsForScope } from "./domains";
import type { PlanId } from "../lib/plans";
import { countActiveInboxesForHint, countActiveInboxesForTeam } from "./inbox";
import { countTeamKeys } from "./api-key-store";

export type UsageScope = {
  teamId: string | null;
  apiKeyHint: string;
  plan: PlanId;
};

export async function getScopedUsage(env: Env, scope: UsageScope) {
  const sql = getDb(env);
  const activeInboxes = scope.teamId
    ? await countActiveInboxesForTeam(env, scope.teamId)
    : await countActiveInboxesForHint(env, scope.apiKeyHint);

  const customDomains = await countDomainsForScope(env, {
    teamId: scope.teamId,
    apiKeyHint: scope.apiKeyHint,
    plan: scope.plan,
  });
  const teamKeys = scope.teamId
    ? await countTeamKeys(env, scope.teamId)
    : 0;

  const messagesLast24h = scope.teamId
    ? await countMessages24hForTeam(env, scope.teamId)
    : await countMessages24hForHint(env, scope.apiKeyHint);

  return {
    activeInboxes,
    customDomains,
    teamKeys,
    messagesLast24h,
  };
}

async function countMessages24hForTeam(env: Env, teamId: string): Promise<number> {
  const sql = getDb(env);
  const rows = (await sql`
    SELECT COUNT(*)::int AS n
    FROM messages m
    INNER JOIN inboxes i ON i.id = m.inbox_id
    WHERE m.received_at > NOW() - INTERVAL '24 hours'
      AND i.api_key_hint IN (
        SELECT key_hint FROM api_keys WHERE team_id = ${teamId}
      )
  `) as { n: number }[];
  return rows[0]?.n ?? 0;
}

async function countMessages24hForHint(env: Env, hint: string): Promise<number> {
  const sql = getDb(env);
  const rows = (await sql`
    SELECT COUNT(*)::int AS n
    FROM messages m
    INNER JOIN inboxes i ON i.id = m.inbox_id
    WHERE m.received_at > NOW() - INTERVAL '24 hours'
      AND (i.api_key_hint IS NULL OR i.api_key_hint = ${hint})
  `) as { n: number }[];
  return rows[0]?.n ?? 0;
}
