import type { Context, Next } from "hono";
import type { Env } from "../env";
import type { ApiVariables } from "./api-context";
import { bearerToken } from "./api-key-hint";
import { PLAN_LIMITS } from "./plans";
import { resolveAuth } from "../services/api-key-store";

/** Bearer: ключ из Neon api_keys или wrangler API_KEY(S) */
export async function requireApiKey(
  c: Context<{ Bindings: Env; Variables: ApiVariables }>,
  next: Next
) {
  const auth = await resolveAuth(c.env, bearerToken(c.req.header("Authorization")));
  if (!auth) {
    return c.json({ error: "unauthorized" }, 401);
  }
  const limits = PLAN_LIMITS[auth.plan];
  c.set("apiKeyHint", auth.hint);
  c.set("apiPlan", auth.plan);
  c.set("rateLimitPerMinute", limits.rateLimitPerMinute);
  c.set("maxActiveInboxes", limits.maxActiveInboxes);
  c.set("teamId", auth.teamId);
  c.set("apiKeyId", auth.apiKeyId);
  await next();
}
