# MailAgent roadmap

**v0.5**

## Agent ✅

| Remote MCP `/mcp` | ✅ |
| Streamable HTTP (Mcp-Session-Id + SSE GET) | ✅ |
| OAuth client_credentials (`mat_` tokens) | ✅ |
| Dynamic Client Registration (RFC 7591) | ✅ |
| Progress notifications on wait | ✅ |
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
npm run publish:check
npm run publish:all
```

Или CI: secret `NPM_TOKEN` → workflow **Publish npm packages** / git tag `v*`.  
См. [PUBLISH.md](./PUBLISH.md).

## CI ✅

Deploy на push `main`: [CI.md](./CI.md) — `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, опционально `MAILAGENT_API_KEY` для smoke.

## Дальше

- ~~MCP progress notifications during long `wait`~~ ✅
- ~~Dynamic Client Registration (DCR)~~ ✅
- Third-party IdP OAuth (Auth0/Google login for MCP — сейчас API key → mat_ token)
