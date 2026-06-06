/** MCP Streamable HTTP sessions — JWT (stateless) or legacy KV */
import type { Env } from "../env";
import { nanoid } from "nanoid";
import {
  isJwtMatBody,
  signMcpSessionJwt,
  verifyMcpSessionJwt,
} from "../lib/mcp-jwt";
import { mcpSigningSecret } from "../lib/mcp-signing-secret";

const PREFIX = "mcp_";
const KV_PREFIX = "mcp:sess:";
const TTL_SEC = 86_400;

export type McpSession = {
  apiKeyHint: string;
  teamId: string | null;
  createdAt: string;
};

function kv(env: Env): KVNamespace | undefined {
  return env.RATE_LIMIT;
}

function sessionBody(sessionId: string): string {
  return sessionId.startsWith(PREFIX) ? sessionId.slice(PREFIX.length) : sessionId;
}

export async function createMcpSession(
  env: Env,
  auth: { apiKeyHint: string; teamId: string | null }
): Promise<string | null> {
  const secret = mcpSigningSecret(env);
  if (secret) {
    const jwt = await signMcpSessionJwt(secret, auth, TTL_SEC);
    return `${PREFIX}${jwt}`;
  }

  const store = kv(env);
  if (!store) return null;

  const id = `${PREFIX}${nanoid(24)}`;
  const data: McpSession = {
    apiKeyHint: auth.apiKeyHint,
    teamId: auth.teamId,
    createdAt: new Date().toISOString(),
  };
  try {
    await store.put(KV_PREFIX + id, JSON.stringify(data), { expirationTtl: TTL_SEC });
  } catch {
    return null;
  }
  return id;
}

async function resolveSessionRecord(
  env: Env,
  sessionId: string
): Promise<McpSession | null> {
  if (!sessionId) return null;

  const body = sessionBody(sessionId);
  const secret = mcpSigningSecret(env);
  if (secret && isJwtMatBody(body)) {
    return verifyMcpSessionJwt(secret, body);
  }

  const store = kv(env);
  if (!store) return null;
  const raw = await store.get(KV_PREFIX + sessionId);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as McpSession;
  } catch {
    return null;
  }
}

export async function getMcpSession(
  env: Env,
  sessionId: string
): Promise<McpSession | null> {
  return resolveSessionRecord(env, sessionId);
}

export async function validateMcpSession(
  env: Env,
  sessionId: string,
  apiKeyHint: string
): Promise<boolean> {
  const session = await resolveSessionRecord(env, sessionId);
  return session?.apiKeyHint === apiKeyHint;
}

export async function deleteMcpSession(
  env: Env,
  sessionId: string
): Promise<void> {
  const body = sessionBody(sessionId);
  if (mcpSigningSecret(env) && isJwtMatBody(body)) return;

  const store = kv(env);
  if (!store || !sessionId) return;
  await store.delete(KV_PREFIX + sessionId);
}
