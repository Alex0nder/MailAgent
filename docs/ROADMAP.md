# MailAgent roadmap

**v0.5**

## Agent ✅

| Remote MCP `/mcp` | ✅ |
| Streamable HTTP (Mcp-Session-Id + SSE GET) | ✅ |
| OAuth client_credentials (`mat_` tokens) | ✅ |
| Dynamic Client Registration (RFC 7591) | ✅ |
| OIDC IdP (Auth0/Google authorization_code) | ✅ |
| Progress notifications on wait | ✅ |
| RFC 8414 / 9728 discovery | ✅ |
| `runId` tracing | ✅ |
| `GET /v1/agent/runs` + UI | ✅ |
| `npm run smoke:agent` | ✅ |
| `@mailagent/agent` SDK | ✅ |

## QA ✅

P0–P2 закрыты — см. [QA-ROADMAP.md](./QA-ROADMAP.md).

## Publish ✅

| Пакет | Версия |
|-------|--------|
| `@mailagent/mcp` | 0.2.0 |
| `@mailagent/qa` | 0.1.6 |
| `@mailagent/agent` | 0.1.2 |

```bash
npm install @mailagent/mcp @mailagent/qa @mailagent/agent
```

Повторный release: [PUBLISH.md](./PUBLISH.md) · CI: workflow **Publish npm packages** + `NPM_TOKEN`.

## CI ✅

Deploy на push `main`: [CI.md](./CI.md) — `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, опционально `MAILAGENT_API_KEY` для smoke.

## Дальше

- ~~MCP progress notifications during long `wait`~~ ✅
- ~~Dynamic Client Registration (DCR)~~ ✅
- ~~Third-party IdP OAuth (Auth0/Google login for MCP)~~ ✅ — [MCP-OAUTH-IDP.md](./MCP-OAUTH-IDP.md)
- Scoped API keys per tenant
- R2 для raw MIME
