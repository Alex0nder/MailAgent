/** MCP Streamable HTTP: сессии в KV (reuse RATE_LIMIT binding) */
import type { Env } from "../env";
import { nanoid } from "nanoid";

const PREFIX = "mcp:sess:";
const TTL_SEC = 86_400;

export type McpSession = {
  apiKeyHint: string;
  teamId: string | null;
  createdAt: string;
};

function kv(env: Env): KVNamespace | undefined {
  return env.RATE_LIMIT;
}

export async function createMcpSession(
  env: Env,
  auth: { apiKeyHint: string; teamId: string | null }
): Promise<string | null> {
  const store = kv(env);
  if (!store) return null;

  const id = `mcp_${nanoid(24)}`;
  const data: McpSession = {
    apiKeyHint: auth.apiKeyHint,
    teamId: auth.teamId,
    createdAt: new Date().toISOString(),
  };
  await store.put(PREFIX + id, JSON.stringify(data), { expirationTtl: TTL_SEC });
  return id;
}

export async function getMcpSession(
  env: Env,
  sessionId: string
): Promise<McpSession | null> {
  const store = kv(env);
  if (!store || !sessionId) return null;
  const raw = await store.get(PREFIX + sessionId);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as McpSession;
  } catch {
    return null;
  }
}

export async function validateMcpSession(
  env: Env,
  sessionId: string,
  apiKeyHint: string
): Promise<boolean> {
  const session = await getMcpSession(env, sessionId);
  return session?.apiKeyHint === apiKeyHint;
}

export async function deleteMcpSession(
  env: Env,
  sessionId: string
): Promise<void> {
  const store = kv(env);
  if (!store || !sessionId) return;
  await store.delete(PREFIX + sessionId);
}
