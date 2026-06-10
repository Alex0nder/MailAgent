# API Core

Специализированное ядро: REST API MailAgent.

## Как устроен REST API

- **Framework:** Hono on Cloudflare Workers (`src/index.ts`).
- **Base URL prod:** `https://api.webmailagent.com`
- **Discovery:** `GET /v1` — endpoints, presets, MCP tool names.
- **OpenAPI:** `GET /v1/openapi.json` — schema from `src/openapi/spec.ts`.
- **Auth:** `Authorization: Bearer <token>` on `/v1/*` (except public meta).
  - API key (`ma_…` in DB or legacy `API_KEY`)
  - OAuth access token `mat_…`
- **Rate limit:** per plan via KV (`src/lib/rate-limit.ts`).
- **Tenant isolation:** `apiKeyHint` + `teamId` on all inbox operations.

## Endpoints (полный список по route modules)

### Public / meta
| Method | Path |
|--------|------|
| GET | `/health` |
| GET | `/v1` |
| GET | `/v1/openapi.json` |
| GET | `/.well-known/oauth-authorization-server` |
| GET | `/.well-known/oauth-protected-resource/mcp` |

### Webhooks (own auth)
| Method | Path |
|--------|------|
| POST | `/webhooks/resend` |
| POST | `/webhooks/resend/team/:teamId` |
| POST | `/webhooks/stripe` |

### Inboxes (`/v1/inboxes`)
| Method | Path |
|--------|------|
| POST | `/open` |
| GET/POST/DELETE | `/` |
| GET/DELETE | `/:id` |
| POST | `/:id/simulate` |
| POST | `/:id/send` |
| POST | `/:id/messages/:messageId/reply` |
| GET | `/:id/threads`, `/:id/threads/:threadId/messages` |
| GET | `/:id/search` |
| GET | `/:id/diagnose` |
| GET | `/:id/callbacks` |
| GET | `/:id/messages`, `/:id/messages/:messageId/raw` |
| GET | `/:id/messages/:messageId/attachments`, `…/:attachmentId` |
| GET | `/:id/extract`, `/:id/extract/presets` |
| POST | `/:id/messages/:messageId/extract` |
| GET | `/:id/events`, `/:id/wait` |

### Agent hub (`/v1/agent`)
| Method | Path |
|--------|------|
| GET | `/` |
| GET | `/recipes`, `/recipes/:service` |
| GET | `/runs`, `/runs/:runId`, `/runs/:runId/session` |
| PATCH | `/runs/:runId/session` |
| POST | `/verify` |

### Team (`/v1/team`)
| Method | Path |
|--------|------|
| GET | `/` |
| POST/DELETE | `/keys`, `/keys/:id` |
| GET/PUT/DELETE | `/dedicated-resend` |

### Domains (`/v1/domains`)
| Method | Path |
|--------|------|
| GET/POST | `/` |
| GET/POST/DELETE | `/:id`, `/:id/verify` |

### Other `/v1`
| Method | Path | Module |
|--------|------|--------|
| GET | `/stats` | stats |
| GET | `/me` | me |
| POST | `/billing/checkout`, `/billing/portal` | billing |
| GET | `/console/summary`, `/console/threads`, `/console/inboxes/:id` | console |
| GET | `/audit` | audit |
| GET/POST | `/oauth/*` | oauth |

### MCP HTTP
| Method | Path |
|--------|------|
| GET/POST/DELETE | `/mcp` |
| GET | `/mcp/auth` |

## Контракты

### OpenAPI
- Source: `src/openapi/spec.ts`
- Served at `GET /v1/openapi.json`
- Documents request/response schemas for inboxes, messages, verification, attachments.

### Contract tests (CI)
Scripts in `scripts/contract-qa*.mjs` — hit prod/staging API with `simulate`, no DB.

| Script | Scope |
|--------|-------|
| `contract-qa.mjs` | inbox, simulate, extract |
| `contract-qa-agent.mjs` | agent.ts, MCP hub |
| `contract-qa-attachments.mjs` | attachments, raw MIME |
| `contract-qa-team-keys.mjs` | team keys, dashboard |
| `contract-qa-billing.mjs` | Stripe routes |
| `contract-qa-callback.mjs` | callbackUrl |
| `contract-qa-domains.mjs` | custom domains |
| `contract-qa-search.mjs` | message search |
| `contract-qa-session.mjs` | agent run sessions |
| `contract-qa-outbound.mjs` | send/reply |
| `contract-qa-oidc.mjs` | OIDC |
| `contract-qa-console.mjs` | console API |
| `contract-qa-audit.mjs` | audit log |

Run: `npm run test:contract:all` or per-script (see AGENTS.md matrix).

### SDK packages
- `@mailagent/agent` — REST client (`packages/mailagent-agent/`)
- `@mailagent/qa` — Playwright/Cypress helpers
- `@mailagent/mcp` — MCP tools mirror REST

### Error codes (common)
- `401 unauthorized`
- `404 not_found` (inbox/message or cross-tenant)
- `408 timeout` (wait/open)
- `429` rate limit / `inbox_limit_reached`
- `400` validation (callback URL, domain errors)

## Key files

- `src/routes/*.ts` — route handlers
- `src/openapi/spec.ts` — OpenAPI schema
- `src/lib/auth.ts` — requireApiKey
- `src/services/api-key-store.ts` — key resolution
- `scripts/lib/contract-api.mjs` — contract test helper
