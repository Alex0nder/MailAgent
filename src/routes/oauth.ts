/** OAuth 2.0 token + RFC 8414 / 9728 metadata для remote MCP */
import { Hono } from "hono";
import type { Env } from "../env";
import { resolveAuth } from "../services/api-key-store";
import { issueMcpAccessToken } from "../services/mcp-oauth";

function publicOrigin(c: { req: { url: string } }): string {
  const url = new URL(c.req.url);
  if (url.hostname === "127.0.0.1" || url.hostname === "localhost") {
    return url.origin;
  }
  if (url.hostname.includes("workers.dev")) {
    return url.origin;
  }
  return "https://api.webmailagent.com";
}

export const wellKnownRoutes = new Hono<{ Bindings: Env }>();

wellKnownRoutes.get("/.well-known/oauth-authorization-server", (c) => {
  const origin = publicOrigin(c);
  return c.json({
    issuer: origin,
    token_endpoint: `${origin}/v1/oauth/token`,
    grant_types_supported: ["client_credentials"],
    token_endpoint_auth_methods_supported: [
      "client_secret_post",
      "client_secret_basic",
    ],
    scopes_supported: ["mcp:tools"],
  });
});

wellKnownRoutes.get("/.well-known/oauth-protected-resource/mcp", (c) => {
  const origin = publicOrigin(c);
  return c.json({
    resource: `${origin}/mcp`,
    authorization_servers: [origin],
    bearer_methods_supported: ["header"],
    scopes_supported: ["mcp:tools"],
    resource_documentation: "https://webmailagent.com/docs/agents.html#mcp-oauth",
  });
});

wellKnownRoutes.get("/.well-known/oauth-protected-resource", (c) => {
  const origin = publicOrigin(c);
  const resource = c.req.query("resource") ?? `${origin}/mcp`;
  return c.json({
    resource,
    authorization_servers: [origin],
    bearer_methods_supported: ["header"],
    scopes_supported: ["mcp:tools"],
  });
});

export const oauthTokenRoutes = new Hono<{ Bindings: Env }>();

/** POST /v1/oauth/token — client_credentials, API key = client_secret */
oauthTokenRoutes.post("/token", async (c) => {
  const contentType = c.req.header("Content-Type") ?? "";
  let grantType = "";
  let clientSecret = "";

  if (contentType.includes("application/json")) {
    let body: Record<string, string> = {};
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "invalid_request" }, 400);
    }
    grantType = body.grant_type ?? "";
    clientSecret = body.client_secret ?? "";
  } else {
    const raw = await c.req.text();
    const params = new URLSearchParams(raw);
    grantType = params.get("grant_type") ?? "";
    clientSecret = params.get("client_secret") ?? "";
  }

  const basic = parseBasicAuth(c.req.header("Authorization"));
  if (basic?.password && !clientSecret) {
    clientSecret = basic.password;
  }

  if (grantType !== "client_credentials") {
    return c.json(
      { error: "unsupported_grant_type", error_description: "Use client_credentials" },
      400
    );
  }

  if (!clientSecret) {
    return c.json(
      { error: "invalid_client", error_description: "client_secret (API key) required" },
      401
    );
  }

  const auth = await resolveAuth(c.env, clientSecret);
  if (!auth) {
    return c.json({ error: "invalid_client" }, 401);
  }

  const token = await issueMcpAccessToken(c.env, auth);
  if (!token) {
    return c.json(
      {
        error: "server_error",
        error_description: "OAuth tokens require RATE_LIMIT KV binding",
      },
      503
    );
  }

  return c.json(token);
});

function parseBasicAuth(header: string | undefined): { user: string; password: string } | null {
  if (!header?.startsWith("Basic ")) return null;
  try {
    const decoded = atob(header.slice(6).trim());
    const i = decoded.indexOf(":");
    if (i < 0) return { user: decoded, password: "" };
    return { user: decoded.slice(0, i), password: decoded.slice(i + 1) };
  } catch {
    return null;
  }
}
