/** KV: requests per minute limit per api_key_hint (hosted) */
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

  await kv.put(key, String(used), { expirationTtl: 120 });
  await next();
}
