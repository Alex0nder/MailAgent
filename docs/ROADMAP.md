# MailAgent roadmap

**v0.3.1**

## Agent ✅

| Remote MCP `/mcp` | ✅ |
| `runId` tracing | ✅ |
| `GET /v1/agent/runs` + UI | ✅ |
| `npm run smoke:agent` | ✅ |

## Publish ⏳

```bash
npm login
npm run publish:mcp
npm run publish:qa
```

## Дальше

- MCP Streamable HTTP (SSE sessions)
- `@mailagent/agent` thin SDK
- OAuth on remote MCP
