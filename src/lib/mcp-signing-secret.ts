/** Shared HMAC secret for stateless mat_ tokens and mcp_ session JWTs */
import type { Env } from "../env";

export function mcpSigningSecret(env: Env): string | null {
  const fromEnv = env.MCP_OAUTH_JWT_SECRET?.trim();
  if (fromEnv) return fromEnv;
  const apiKey = env.API_KEY?.trim();
  if (apiKey) return apiKey;
  return null;
}
