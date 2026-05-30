/** KV: лимит запросов в минуту на api_key_hint (hosted) */
import type { Context, Next } from "hono";
import type { Env } from "../env";
import type { ApiVariables } from "./api-context";

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
  const limit = Math.max(1, Number(c.env.RATE_LIMIT_PER_MINUTE) || 120);
  const bucket = Math.floor(Date.now() / 60_000);
  const key = `rl:${hint}:${bucket}`;
  const raw = await kv.get(key);
  const count = raw ? Number(raw) : 0;

  if (count >= limit) {
    const secIntoMinute = Math.floor((Date.now() / 1000) % 60);
    return c.json(
      {
        error: "rate_limit_exceeded",
        limitPerMinute: limit,
        retryAfterSeconds: 60 - secIntoMinute,
      },
      429
    );
  }

  await kv.put(key, String(count + 1), { expirationTtl: 120 });
  await next();
}
