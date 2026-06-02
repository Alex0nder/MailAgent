# MailAgent roadmap

**v0.4**

## Agent ✅

| Remote MCP `/mcp` | ✅ |
| Streamable HTTP (Mcp-Session-Id + SSE GET) | ✅ |
| `GET /mcp/auth` (Bearer API key meta) | ✅ |
| `runId` tracing | ✅ |
| `GET /v1/agent/runs` + UI | ✅ |
| `npm run smoke:agent` | ✅ |
| `@mailagent/agent` SDK | ✅ |

## QA ✅

P0–P2 core закрыты — см. [QA-ROADMAP.md](./QA-ROADMAP.md).

## Publish ⏳

```bash
npm login
npm run publish:mcp
npm run publish:qa    # @mailagent/qa@0.1.5
npm run publish:agent # @mailagent/agent@0.1.1
```

## Дальше

- OAuth on remote MCP (third-party IdP; сейчас Bearer API key)
- MCP server-initiated notifications (progress during long wait)
- Slack / PR comment integrations (QA P2 backlog)
