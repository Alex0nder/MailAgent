# MCP OAuth (remote)

MailAgent MCP supports **OAuth 2.0 client_credentials**, **authorization_code (OIDC IdP)**, and direct Bearer API key.

MCP clients (Cursor, Claude Desktop, custom agents) can:

1. **Directly** — `Authorization: Bearer mak_…` (API key)
2. **Via OAuth** — exchange API key for short-lived `mat_…` access token (stateless JWT, no KV)
3. **Via IdP login** — Auth0/Google browser login → `mat_` token ([MCP-OAUTH-IDP.md](./MCP-OAUTH-IDP.md))

## Discovery (RFC 8414 / 9728)

```bash
curl -sS https://api.webmailagent.com/.well-known/oauth-authorization-server | jq .
curl -sS https://api.webmailagent.com/.well-known/oauth-protected-resource/mcp | jq .
curl -sS https://api.webmailagent.com/mcp/auth | jq .
```

## Dynamic Client Registration (RFC 7591)

MCP clients with DCR support can register a separate key under team:

```bash
curl -sS -X POST https://api.webmailagent.com/v1/oauth/register \
  -H "Authorization: Bearer $MAILAGENT_TEAM_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"client_name":"cursor-mcp"}'

# optional — scoped key for CI/agent:
# -d '{"client_name":"cursor-mcp","scope":{"labelPrefix":"agent-","readOnly":true}}'
```

Optional `scope` field — [SCOPED-API-KEYS.md](./SCOPED-API-KEYS.md) · [site](https://webmailagent.com/docs/scoped-keys.html).

Response (201, `client_secret` shown once):

```json
{
  "client_id": "mac_abc123",
  "client_secret": "ma_…",
  "client_name": "cursor-mcp",
  "grant_types": ["client_credentials"],
  "token_endpoint": "https://api.webmailagent.com/v1/oauth/token",
  "registration_client_uri": "https://api.webmailagent.com/v1/oauth/clients/abc123"
}
```

Metadata without secret:

```bash
curl -sS https://api.webmailagent.com/v1/oauth/clients/abc123 \
  -H "Authorization: Bearer $MAILAGENT_TEAM_API_KEY"
```

Requirements:

- Bearer — **team API key** from dashboard / `npm run issue:key:db`
- Legacy keys (`API_KEY` env) → `403 team_required`

Discovery includes `registration_endpoint` in `/.well-known/oauth-authorization-server`.

## Token exchange

```bash
curl -sS -X POST https://api.webmailagent.com/v1/oauth/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=client_credentials&client_secret=$MAILAGENT_API_KEY"
```

Response:

```json
{
  "access_token": "mat_…",
  "token_type": "Bearer",
  "expires_in": 3600
}
```

Basic auth (client_id arbitrary, password = API key):

```bash
curl -sS -X POST https://api.webmailagent.com/v1/oauth/token \
  -u "mailagent:$MAILAGENT_API_KEY" \
  -d "grant_type=client_credentials"
```

## MCP with access token

```bash
curl -sS -X POST https://api.webmailagent.com/mcp \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

## 401 → discovery

Without token MCP returns:

```
WWW-Authenticate: Bearer resource_metadata="https://api.webmailagent.com/.well-known/oauth-protected-resource/mcp"
```

## Cursor / remote MCP config

**Option A — API key directly** (simpler):

```json
{
  "mcpServers": {
    "mailagent": {
      "url": "https://api.webmailagent.com/mcp",
      "headers": {
        "Authorization": "Bearer mak_YOUR_KEY"
      }
    }
  }
}
```

**Option B — OAuth** (client calls token endpoint):

Some MCP clients read `/.well-known/oauth-protected-resource/mcp` and do client_credentials with your API key as `client_secret`.

## SDK

```typescript
import { MailAgent } from "@mailagent/agent";

const mail = new MailAgent({ baseUrl, apiKey });
const { access_token, expires_in } = await mail.fetchMcpAccessToken();
await mail.callMcpTool("mailagent_verify_signup", { service: "github" }, null, access_token);
```

## TTL

Wrangler var `MCP_OAUTH_TOKEN_TTL_SEC` (default `3600`, max `86400`). Tokens stored in KV `RATE_LIMIT`.

## Security

- `mat_` tokens bound to team/plan of issuing API key
- Revoke API key in dashboard → old `mat_` expire by TTL
- For CI/agents prefer scoped key — [SCOPED-API-KEYS.md](./SCOPED-API-KEYS.md) · [QA-ONBOARDING.md](./QA-ONBOARDING.md)

See [agents.html](https://webmailagent.com/docs/agents.html#mcp-oauth).
