/** Ключи и команды в Neon (Phase 3) */
import { nanoid } from "nanoid";
import type { Env } from "../env";
import { getDb } from "../db/client";
import { apiKeyHashFromToken, apiKeyHintFromToken } from "../lib/api-key-hint";
import { normalizePlan, type PlanId } from "../lib/plans";
import { allowedApiKeys } from "../lib/api-keys";

export interface ResolvedAuth {
  hint: string;
  plan: PlanId;
  teamId: string | null;
  apiKeyId: string | null;
  label: string | null;
}

export async function resolveAuth(
  env: Env,
  token: string | null
): Promise<ResolvedAuth | null> {
  if (!token) return null;

  const hint = await apiKeyHintFromToken(token);
  const hash = await apiKeyHashFromToken(token);

  const row = await lookupKeyByHash(env, hash);
  if (row) {
    const plan = normalizePlan(row.team_plan);
    return {
      hint,
      plan,
      teamId: row.team_id,
      apiKeyId: row.id,
      label: row.label,
    };
  }

  const envKeys = allowedApiKeys(env);
  if (envKeys.length > 0 && envKeys.includes(token)) {
    return {
      hint,
      plan: "legacy",
      teamId: null,
      apiKeyId: null,
      label: null,
    };
  }

  return null;
}

async function lookupKeyByHash(env: Env, hash: string) {
  const sql = getDb(env);
  const rows = (await sql`
    SELECT k.id, k.team_id, k.label, t.plan AS team_plan
    FROM api_keys k
    JOIN teams t ON t.id = k.team_id
    WHERE k.key_hash = ${hash}
    LIMIT 1
  `) as {
    id: string;
    team_id: string;
    label: string | null;
    team_plan: string;
  }[];
  return rows[0] ?? null;
}

export async function registerApiKey(
  env: Env,
  input: { token: string; teamName: string; label?: string; plan?: PlanId }
): Promise<{ teamId: string; apiKeyId: string; hint: string }> {
  const sql = getDb(env);
  const teamId = nanoid(10);
  const apiKeyId = nanoid(10);
  const hash = await apiKeyHashFromToken(input.token);
  const hint = await apiKeyHintFromToken(input.token);
  const plan = input.plan ?? "free";

  await sql`
    INSERT INTO teams (id, name, plan)
    VALUES (${teamId}, ${input.teamName}, ${plan})
  `;
  await sql`
    INSERT INTO api_keys (id, team_id, key_hash, key_hint, label)
    VALUES (${apiKeyId}, ${teamId}, ${hash}, ${hint}, ${input.label ?? null})
  `;

  return { teamId, apiKeyId, hint };
}

export async function setTeamPlan(
  env: Env,
  teamId: string,
  plan: PlanId,
  stripe?: { customerId?: string; subscriptionId?: string | null }
): Promise<void> {
  const sql = getDb(env);
  await sql`
    UPDATE teams
    SET plan = ${plan},
        stripe_customer_id = COALESCE(${stripe?.customerId ?? null}, stripe_customer_id),
        stripe_subscription_id = ${stripe?.subscriptionId ?? null}
    WHERE id = ${teamId}
  `;
}

export async function findTeamByStripeSubscription(
  env: Env,
  subscriptionId: string
): Promise<{ id: string } | null> {
  const sql = getDb(env);
  const rows = (await sql`
    SELECT id FROM teams
    WHERE stripe_subscription_id = ${subscriptionId}
    LIMIT 1
  `) as { id: string }[];
  return rows[0] ?? null;
}
