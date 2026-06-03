/** OAuth 2.0 token + RFC 8414 / 9728 / 7591 (DCR) для remote MCP */
import { Hono } from "hono";
import type { Env } from "../env";
import type { ApiVariables } from "../lib/api-context";
import { requireApiKey } from "../lib/auth";
import { rateLimit } from "../lib/rate-limit";
import { generateApiKeyToken } from "../lib/generate-api-key";
import { addTeamKey, listTeamKeys, resolveAuth } from "../services/api-key-store";
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
    registration_endpoint: `${origin}/v1/oauth/register`,
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

export const oauthTokenRoutes = new Hono<{ Bindings: Env; Variables: ApiVariables }>();

/** RFC 7591 Dynamic Client Registration — новый MCP client key для team */
oauthTokenRoutes.post("/register", requireApiKey, rateLimit, async (c) => {
  const teamId = c.get("teamId");
  if (!teamId) {
    return c.json(
      {
        error: "team_required",
        hint: "DCR requires DB team key (npm run issue:key:db)",
      },
      403
    );
  }

  let body: {
    client_name?: string;
    redirect_uris?: string[];
    grant_types?: string[];
    token_endpoint_auth_method?: string;
  } = {};
  try {
    body = await c.req.json();
  } catch {
    body = {};
  }

  const clientName = (body.client_name ?? "mcp-client").trim().slice(0, 64) || "mcp-client";
  const token = generateApiKeyToken();
  const { apiKeyId, hint } = await addTeamKey(c.env, teamId, {
    token,
    label: `mcp:${clientName}`.slice(0, 64),
  });

  const origin = publicOrigin(c);
  const issuedAt = Math.floor(Date.now() / 1000);

  return c.json(
    {
      client_id: `mac_${apiKeyId}`,
      client_secret: token,
      client_id_issued_at: issuedAt,
      client_secret_expires_at: 0,
      client_name: clientName,
      grant_types: body.grant_types ?? ["client_credentials"],
      token_endpoint_auth_method: body.token_endpoint_auth_method ?? "client_secret_post",
      redirect_uris: body.redirect_uris ?? [],
      token_endpoint: `${origin}/v1/oauth/token`,
      registration_client_uri: `${origin}/v1/oauth/clients/${apiKeyId}`,
      key_hint: hint,
      scopes: ["mcp:tools"],
      warning: "Store client_secret now; it will not be shown again.",
    },
    201
  );
});

/** GET /v1/oauth/clients/:id — metadata без secret (Bearer team key) */
oauthTokenRoutes.get("/clients/:id", requireApiKey, rateLimit, async (c) => {
  const teamId = c.get("teamId");
  if (!teamId) {
    return c.json({ error: "team_required" }, 403);
  }
  const apiKeyId = c.req.param("id");
  const keys = await listTeamKeys(c.env, teamId);
  const key = keys.find((k) => k.id === apiKeyId);
  if (!key) return c.json({ error: "client_not_found" }, 404);

  const origin = publicOrigin(c);
  return c.json({
    client_id: `mac_${key.id}`,
    client_name: key.label?.replace(/^mcp:/, "") ?? key.label,
    key_hint: key.key_hint,
    created_at: key.created_at,
    token_endpoint: `${origin}/v1/oauth/token`,
  });
});

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
  // client_id (mac_*) informational; auth via client_secret (API key)

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
