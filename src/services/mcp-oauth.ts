/** OAuth access tokens для remote MCP (client_credentials → mat_ token) */
import { nanoid } from "nanoid";
import type { Env } from "../env";
import type { ResolvedAuth } from "./api-key-store";
import { apiKeyHashFromToken } from "../lib/api-key-hint";
import { normalizePlan, type PlanId } from "../lib/plans";

const KV_PREFIX = "oauth:mat:";
const TOKEN_PREFIX = "mat_";
const DEFAULT_TTL_SEC = 3600;

type StoredMcpToken = {
  hint: string;
  plan: PlanId;
  teamId: string | null;
  apiKeyId: string | null;
  label: string | null;
  scopeLabelPrefix: string | null;
  scopeReadOnly: boolean;
};

function kv(env: Env): KVNamespace | undefined {
  return env.RATE_LIMIT;
}

async function tokenDigest(token: string): Promise<string> {
  return apiKeyHashFromToken(token);
}

function ttlSec(env: Env): number {
  const raw = env.MCP_OAUTH_TOKEN_TTL_SEC;
  const n = raw ? Number(raw) : DEFAULT_TTL_SEC;
  if (!Number.isFinite(n)) return DEFAULT_TTL_SEC;
  return Math.min(86_400, Math.max(300, Math.floor(n)));
}

export function isMcpAccessToken(token: string): boolean {
  return token.startsWith(TOKEN_PREFIX);
}

/** Выдать short-lived Bearer для MCP-клиентов (OAuth client_credentials) */
export async function issueMcpAccessToken(
  env: Env,
  auth: ResolvedAuth
): Promise<{ access_token: string; token_type: "Bearer"; expires_in: number } | null> {
  const store = kv(env);
  if (!store) return null;

  const access_token = `${TOKEN_PREFIX}${nanoid(40)}`;
  const payload: StoredMcpToken = {
    hint: auth.hint,
    plan: auth.plan,
    teamId: auth.teamId,
    apiKeyId: auth.apiKeyId,
    label: auth.label,
    scopeLabelPrefix: auth.scope.labelPrefix,
    scopeReadOnly: auth.scope.readOnly,
  };
  const expires_in = ttlSec(env);
  await store.put(KV_PREFIX + (await tokenDigest(access_token)), JSON.stringify(payload), {
    expirationTtl: expires_in + 60,
  });

  return { access_token, token_type: "Bearer", expires_in };
}

/** Разрешить mat_ token из KV */
export async function resolveMcpAccessToken(
  env: Env,
  token: string
): Promise<ResolvedAuth | null> {
  if (!isMcpAccessToken(token)) return null;
  const store = kv(env);
  if (!store) return null;

  const raw = await store.get(KV_PREFIX + (await tokenDigest(token)));
  if (!raw) return null;

  try {
    const data = JSON.parse(raw) as StoredMcpToken;
    return {
      hint: data.hint,
      plan: normalizePlan(data.plan),
      teamId: data.teamId,
      apiKeyId: data.apiKeyId,
      label: data.label,
      scope: {
        labelPrefix: data.scopeLabelPrefix ?? null,
        readOnly: Boolean(data.scopeReadOnly),
      },
    };
  } catch {
    return null;
  }
}
