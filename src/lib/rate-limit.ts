/** KV rate limit — sampled writes to stay within free-tier KV put quota */
import type { Context, Next } from "hono";
import type { Env } from "../env";
import type { ApiVariables } from "./api-context";

function rateLimitHeaders(limit: number, used: number, bucket: number) {
  const resetSec = Math.ceil(((bucket + 1) * 60_000) / 1000);
  return {
    "X-RateLimit-Limit": String(limit),
    "X-RateLimit-Remaining": String(Math.max(0, limit - used)),
    "X-RateLimit-Reset": String(resetSec),
  };
}

function kvWriteEvery(env: Env): number {
  const n = Number(env.RATE_LIMIT_KV_WRITE_EVERY);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 10;
}

function shouldPersistCount(used: number, limit: number, writeEvery: number): boolean {
  if (used >= limit) return true;
  if (used === 1) return true;
  if (used >= limit - 5) return true;
  return used % writeEvery === 0;
}

export async function rateLimit(
  c: Context<{ Bindings: Env; Variables: ApiVariables }>,
  next: Next
) {
  const kv = c.env.RATE_LIMIT;
  if (!kv) {
    await next();
    return;
  }

  const hint = c.get("apiKeyHint");
  const limit = Math.max(1, c.get("rateLimitPerMinute"));
  const bucket = Math.floor(Date.now() / 60_000);
  const key = `rl:${hint}:${bucket}`;
  const raw = await kv.get(key);
  const count = raw ? Number(raw) : 0;

  if (count >= limit) {
    const secIntoMinute = Math.floor((Date.now() / 1000) % 60);
    const retryAfter = 60 - secIntoMinute;
    for (const [k, v] of Object.entries(rateLimitHeaders(limit, limit, bucket))) {
      c.header(k, v);
    }
    c.header("Retry-After", String(retryAfter));
    return c.json(
      {
        error: "rate_limit_exceeded",
        limitPerMinute: limit,
        retryAfterSeconds: retryAfter,
      },
      429
    );
  }

  const used = count + 1;
  for (const [k, v] of Object.entries(rateLimitHeaders(limit, used, bucket))) {
    c.header(k, v);
  }

  const writeEvery = kvWriteEvery(c.env);
  if (shouldPersistCount(used, limit, writeEvery)) {
    const put = kv.put(key, String(used), { expirationTtl: 120 });
    c.executionCtx.waitUntil(put);
  }

  await next();
}
