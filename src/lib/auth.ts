import type { Context, Next } from "hono";
import type { Env } from "../env";
import type { ApiVariables } from "./api-context";
import { bearerToken } from "./api-key-hint";
import { PLAN_LIMITS } from "./plans";
import { resolveAuth } from "../services/api-key-store";
import type { ResolvedAuth } from "../services/api-key-store";

function applyAuthContext(
  c: Context<{ Bindings: Env; Variables: ApiVariables }>,
  auth: ResolvedAuth
) {
  const limits = PLAN_LIMITS[auth.plan];
  c.set("apiKeyHint", auth.hint);
  c.set("apiPlan", auth.plan);
  c.set("rateLimitPerMinute", limits.rateLimitPerMinute);
  c.set("maxActiveInboxes", limits.maxActiveInboxes);
  c.set("teamId", auth.teamId);
  c.set("apiKeyId", auth.apiKeyId);
}

/** Bearer: API key или OAuth mat_ access token */
export async function requireApiKey(
  c: Context<{ Bindings: Env; Variables: ApiVariables }>,
  next: Next
) {
  const auth = await resolveAuth(c.env, bearerToken(c.req.header("Authorization")));
  if (!auth) {
    return c.json({ error: "unauthorized" }, 401);
  }
  applyAuthContext(c, auth);
  await next();
}

/** MCP: 401 с WWW-Authenticate → OAuth discovery (RFC 9728) */
export async function requireMcpAuth(
  c: Context<{ Bindings: Env; Variables: ApiVariables }>,
  next: Next
) {
  const auth = await resolveAuth(c.env, bearerToken(c.req.header("Authorization")));
  if (!auth) {
    const origin = publicOrigin(c.req.url);
    c.header(
      "WWW-Authenticate",
      `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource/mcp"`
    );
    return c.json({ error: "unauthorized", oauth: `${origin}/.well-known/oauth-authorization-server` }, 401);
  }
  applyAuthContext(c, auth);
  await next();
}

function publicOrigin(url: string): string {
  const u = new URL(url);
  if (u.hostname === "127.0.0.1" || u.hostname === "localhost" || u.hostname.includes("workers.dev")) {
    return u.origin;
  }
  return "https://api.webmailagent.com";
}
