# Project Map — MailAgent

Карта репозитория на 2026-06-10. ~3295 файлов всего (включая lockfiles/node_modules в подпакетах); ~289 значимых ts/md/sql/mjs/json без root node_modules.

## Корневые файлы

| File | Role |
|------|------|
| `README.md` | Product overview, API table, MCP quick start |
| `AGENTS.md` | Agent autonomy, test matrix, MCP tools list |
| `SETUP.md` | Manual setup (Neon, Resend, deploy) |
| `package.json` | Scripts, dependencies |
| `wrangler.jsonc` | Cloudflare Worker config |
| `.dev.vars.example` | Local secrets template |
| `LICENSE` | MIT |

## Основные модули (`src/`)

### Entry & infra
| Path | Role |
|------|------|
| `src/index.ts` | Worker entry: fetch, queue, cron |
| `src/env.ts` | Bindings interface |
| `src/db/client.ts` | Neon client |

### Routes (`src/routes/`)
`inboxes.ts` · `webhooks.ts` · `agent.ts` · `mcp-http.ts` · `oauth.ts` · `team.ts` · `domains.ts` · `billing.ts` · `console.ts` · `audit.ts` · `stats.ts` · `me.ts` · `health.ts` · `api-meta.ts` · `openapi.ts`

### Services (`src/services/`) — 25+ files
Core: `inbox.ts`, `resend-mail.ts`, `extract.ts`, `wait.ts`, `simulate-inbound.ts`, `callback.ts`, `message-verify.ts`, `inbox-diagnose.ts`, `api-key-store.ts`

Extended: `outbound-mail.ts`, `domains.ts`, `billing.ts`, `raw-mime-r2.ts`, `message-attachments.ts`, `message-search.ts`, `structured-extract.ts`, `thread-resolve.ts`, `agent-verify.ts`, `agent-run-session.ts`, `audit-log.ts`, `team-resend.ts`, `mcp-oauth.ts`, `oidc-oauth.ts`, console-* services

### Lib (`src/lib/`)
`auth.ts`, `plans.ts`, `rate-limit.ts`, `sender-allowlist.ts`, `scope-guard.ts`, `service-presets.ts`, `mcp-jwt.ts`, `key-scope.ts`, etc.

### Other src
| Path | Role |
|------|------|
| `src/queue/consumer.ts` | Queue batch handler |
| `src/durable-objects/inbox-wait.ts` | SSE Durable Object |
| `src/mcp/manifest.ts` | 23 MCP tool definitions |
| `src/mcp/handlers.ts` | MCP tool dispatch |
| `src/openapi/spec.ts` | OpenAPI 3.0 schema |

## MCP package (`mcp/`)

| Path | Role |
|------|------|
| `mcp/src/index.ts` | stdio MCP server |
| `mcp/src/client.ts` | REST API client |
| `mcp/src/cli.ts` | CLI (`open`, `inbox create`, `wait`) |
| `mcp/src/sse.ts` | SSE wait client |
| `mcp/src/service-presets.ts` | Service presets (duplicate of src/lib) |

## npm packages (`packages/`)

| Package | Path | Purpose |
|---------|------|---------|
| `@mailagent/qa` | `packages/mailagent-qa/` | Playwright/Cypress helpers |
| `@mailagent/agent` | `packages/mailagent-agent/` | REST verify SDK |

## Migrations (`migrations/`)

16 SQL files: `001_init.sql` … `016_team_dedicated_resend.sql`

## Документация (`docs/`)

42 markdown files. Key:
- **QA:** QA.md, QA-TROUBLESHOOTING.md, QA-SIMULATE.md, QA-CALLBACK.md, AUTOTESTS.md
- **Ops:** CI.md, OPERATOR.md, HOSTING-CLOUDFLARE.md
- **Agent:** AGENT-SKILLS.md, CODEX.md, MCP-OAUTH.md, INTEGRATE.md
- **Platform:** V1-PLATFORM.md, TEAMS.md, BILLING.md, SCOPED-API-KEYS.md
- **Security:** PENTEST-PREP.md, SOC2.md

Mirrored HTML: `public/docs/*.html`

## Skills

| Path | Role |
|------|------|
| `skills/mailagent/SKILL.md` | Canonical Agent Skill |
| `.cursor/skills/mailagent-mcp/SKILL.md` | Cursor sync copy |
| `examples/codex/plugin/skills/mailagent/SKILL.md` | Codex plugin copy |

## Examples (`examples/`)

- `playwright/` — E2E specs + configs
- `qa-pilot-starter/` — Playwright starter kit
- `qa-pilot-cypress-starter/` — Cypress starter
- `codex/` — Codex plugin scaffold
- `github-actions/` — CI workflow samples
- `vitest/` — unit test example
- `docker-compose.mailpit.yml` — local SMTP alternative

## Scripts (`scripts/`)

~50 `.mjs` files:
- **Doctor:** `doctor.mjs`, `doctor-qa.mjs`, `doctor-security.mjs`, `doctor-billing.mjs`, `doctor-oidc.mjs`, `doctor-operator.mjs`
- **Contract:** `contract-qa*.mjs` (12+ variants)
- **Smoke:** `smoke-prod.mjs`, `smoke-qa.mjs`, `smoke-agent.mjs`
- **Setup:** `setup-check.mjs`, `migrate.mjs`, `issue-api-key.mjs`
- **Publish:** `publish-check.mjs`, `sync-agent-skill.mjs`
- **Wizards:** `wizard-qa-pilot.mjs`, `wizard-stripe.mjs`, `wizard-auth0-oidc.mjs`

## Tests

No unified `tests/` folder. Testing via:
- `scripts/contract-qa*.mjs` — API contracts
- `scripts/test-prod.mjs` — full prod gate
- `examples/playwright/*.spec.*` — Playwright
- `scripts/test-*.ts` — unit-style scripts

## Public static (`public/`)

Landing, dashboard, debug UI, docs HTML, assets.

## CI (`.github/workflows/`)

| Workflow | Purpose |
|----------|---------|
| `deploy-worker.yml` | Deploy + prod gate |
| `qa-smoke.yml` | PR checks |
| `test-prod-full.yml` | Manual full test |
| `security-baseline.yml` | Security doctor |
| `publish-packages.yml` | npm publish |
| `hol-plugin-scanner.yml` | Codex catalog |

## Интеграции

| Service | Usage |
|---------|-------|
| Cloudflare Workers | Runtime |
| Cloudflare Queues | Email ingest async |
| Cloudflare Durable Objects | SSE |
| Cloudflare R2 | Raw MIME |
| Cloudflare KV | Rate limit |
| Cloudflare Workers AI | Search, structured extract |
| Neon Postgres | Primary DB |
| Resend | Inbound + outbound email |
| Stripe | Billing (optional) |
| Auth0/OIDC | MCP browser login (optional) |
| GitHub Actions | CI/CD |
| npm | Package distribution |

## Discovery entry points

```bash
curl -s https://api.webmailagent.com/v1 | jq .
curl -s -H "Authorization: Bearer $KEY" https://api.webmailagent.com/v1/agent | jq .
curl -s https://api.webmailagent.com/v1/openapi.json | jq .
```
