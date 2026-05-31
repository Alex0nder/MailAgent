# MailAgent roadmap

**v0.3.1** — remote MCP + agent tracing

## Agent ✅

| Remote MCP `POST /mcp` | ✅ JSON-RPC + Bearer |
| `runId` → label tracing | ✅ |
| verify + recipes + stdio MCP | ✅ |

## Publish ⏳

`npm run publish:mcp` / `publish:qa` (npm login)

## Дальше

- MCP Streamable HTTP / SSE session
- Agent run dashboard (filter `label=agent-*`)
- OAuth on remote MCP (optional)
