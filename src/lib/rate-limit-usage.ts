/** Read current per-key rate limit bucket from KV (dashboard /v1/me). */
import type { Env } from "../env";

export type RateLimitUsage = {
  limitPerMinute: number;
  used: number;
  remaining: number;
  resetsInSeconds: number;
};

export async function getRateLimitUsage(
  env: Env,
  apiKeyHint: string,
  limitPerMinute: number
): Promise<RateLimitUsage | null> {
  const kv = env.RATE_LIMIT;
  if (!kv) return null;

  const limit = Math.max(1, limitPerMinute);
  const bucket = Math.floor(Date.now() / 60_000);
  const key = `rl:${apiKeyHint}:${bucket}`;
  const raw = await kv.get(key);
  const used = raw ? Number(raw) : 0;
  const secIntoMinute = Math.floor((Date.now() / 1000) % 60);

  return {
    limitPerMinute: limit,
    used,
    remaining: Math.max(0, limit - used),
    resetsInSeconds: 60 - secIntoMinute,
  };
}
