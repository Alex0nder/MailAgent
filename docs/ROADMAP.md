# MailAgent roadmap

**v0.5**

## Agent ✅

| Remote MCP `/mcp` | ✅ |
| Streamable HTTP (Mcp-Session-Id + SSE GET) | ✅ |
| OAuth client_credentials (`mat_` tokens) | ✅ |
| Dynamic Client Registration (RFC 7591) | ✅ |
| OIDC IdP (Auth0/Google authorization_code) | ✅ |
| Scoped API keys (labelPrefix, readOnly) | ✅ |
| Raw MIME in R2 (.eml archive) | ✅ |
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

## v0.6 Agent

| MCP `mailagent_list_messages` | ✅ |
| MCP `mailagent_get_raw_message` | ✅ |
| Verify response `hasRaw` + `rawUrl` | ✅ |
| `@mailagent/agent` getProfile, listMessages, getRawMessageMeta | ✅ |

## v0.7 Attachments

| REST list/download attachments | ✅ |
| MCP `mailagent_list_attachments` / `mailagent_get_attachment` | ✅ |
| R2 cache for small attachments (≤2MB) | ✅ |
| Verify `hasAttachments` + `attachmentCount` | ✅ |

## Дальше (v0.7+)

- ~~MCP progress notifications during long `wait`~~ ✅
- ~~Dynamic Client Registration (DCR)~~ ✅
- ~~Third-party IdP OAuth (Auth0/Google login for MCP)~~ ✅ — [MCP-OAUTH-IDP.md](./MCP-OAUTH-IDP.md)
- ~~Scoped API keys per tenant~~ ✅ — [SCOPED-API-KEYS.md](./SCOPED-API-KEYS.md)
- ~~R2 для raw MIME~~ ✅ — [RAW-MIME-R2.md](./RAW-MIME-R2.md)
- ~~Attachments API~~ ✅ — [ATTACHMENTS.md](./ATTACHMENTS.md)
- Agent session memory / multi-step run state
- OIDC on prod (Auth0 secrets)
