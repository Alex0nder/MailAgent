# MCP OAuth (remote)

MailAgent MCP поддерживает **OAuth 2.0 client_credentials** и прямой Bearer API key.

MCP-клиенты (Cursor, Claude Desktop, custom agents) могут:

1. **Напрямую** — `Authorization: Bearer mak_…` (API key)
2. **Через OAuth** — обменять API key на short-lived `mat_…` access token

## Discovery (RFC 8414 / 9728)

```bash
curl -sS https://api.webmailagent.com/.well-known/oauth-authorization-server | jq .
curl -sS https://api.webmailagent.com/.well-known/oauth-protected-resource/mcp | jq .
curl -sS https://api.webmailagent.com/mcp/auth | jq .
```

## Token exchange

```bash
curl -sS -X POST https://api.webmailagent.com/v1/oauth/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=client_credentials&client_secret=$MAILAGENT_API_KEY"
```

Ответ:

```json
{
  "access_token": "mat_…",
  "token_type": "Bearer",
  "expires_in": 3600
}
```

Basic auth (client_id произвольный, password = API key):

```bash
curl -sS -X POST https://api.webmailagent.com/v1/oauth/token \
  -u "mailagent:$MAILAGENT_API_KEY" \
  -d "grant_type=client_credentials"
```

## MCP с access token

```bash
curl -sS -X POST https://api.webmailagent.com/mcp \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

## 401 → discovery

Без токена MCP возвращает:

```
WWW-Authenticate: Bearer resource_metadata="https://api.webmailagent.com/.well-known/oauth-protected-resource/mcp"
```

## Cursor / remote MCP config

**Вариант A — API key напрямую** (проще):

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

**Вариант B — OAuth** (клиент сам ходит на token endpoint):

Некоторые MCP-клиенты читают `/.well-known/oauth-protected-resource/mcp` и делают client_credentials с вашим API key как `client_secret`.

## SDK

```typescript
import { MailAgent } from "@mailagent/agent";

const mail = new MailAgent({ baseUrl, apiKey });
const { access_token, expires_in } = await mail.fetchMcpAccessToken();
await mail.callMcpTool("mailagent_verify_signup", { service: "github" }, null, access_token);
```

## TTL

Wrangler var `MCP_OAUTH_TOKEN_TTL_SEC` (default `3600`, max `86400`). Токены хранятся в KV `RATE_LIMIT`.

## Безопасность

- `mat_` токены привязаны к team/plan того API key, которым выданы
- Отзыв API key в dashboard → старые `mat_` истекают по TTL
- Для CI/agents предпочитайте отдельный ключ ([QA-ONBOARDING.md](./QA-ONBOARDING.md))

См. [agents.html](https://webmailagent.com/docs/agents.html#mcp-oauth).
