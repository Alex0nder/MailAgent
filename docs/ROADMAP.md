# MailAgent roadmap

**v0.5**

## Agent ✅

| Remote MCP `/mcp` | ✅ |
| Streamable HTTP (Mcp-Session-Id + SSE GET) | ✅ |
| OAuth client_credentials (`mat_` tokens) | ✅ |
| RFC 8414 / 9728 discovery | ✅ |
| `runId` tracing | ✅ |
| `GET /v1/agent/runs` + UI | ✅ |
| `npm run smoke:agent` | ✅ |
| `@mailagent/agent` SDK | ✅ |

## QA ✅

P0–P2 закрыты — см. [QA-ROADMAP.md](./QA-ROADMAP.md).

## Publish ⏳

```bash
npm login
npm run publish:mcp
npm run publish:qa    # @mailagent/qa@0.1.6
npm run publish:agent # @mailagent/agent@0.1.2
```

## Дальше

- MCP progress notifications during long `wait`
- Third-party IdP OAuth (Auth0/Google login for MCP — сейчас API key → mat_ token)
- Dynamic Client Registration (DCR)
