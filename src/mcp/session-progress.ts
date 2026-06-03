/** Очередь progress events для GET SSE session channel */
import type { Env } from "../env";

const PREFIX = "mcp:prog:";

function kv(env: Env): KVNamespace | undefined {
  return env.RATE_LIMIT;
}

export async function pushSessionProgress(
  env: Env,
  sessionId: string,
  item: unknown
): Promise<void> {
  const store = kv(env);
  if (!store || !sessionId) return;

  const key = PREFIX + sessionId;
  const raw = await store.get(key);
  const arr: unknown[] = raw ? (JSON.parse(raw) as unknown[]) : [];
  arr.push(item);
  while (arr.length > 30) arr.shift();
  await store.put(key, JSON.stringify(arr), { expirationTtl: 300 });
}

export async function drainSessionProgress(
  env: Env,
  sessionId: string
): Promise<unknown[]> {
  const store = kv(env);
  if (!store || !sessionId) return [];

  const key = PREFIX + sessionId;
  const raw = await store.get(key);
  if (!raw) return [];
  await store.delete(key);
  try {
    return JSON.parse(raw) as unknown[];
  } catch {
    return [];
  }
}
