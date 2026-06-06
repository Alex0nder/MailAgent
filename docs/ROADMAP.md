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

P0–P2 done — see [QA-ROADMAP.md](./QA-ROADMAP.md).

## Publish ✅

| Package | Version (npm) |
|-------|----------------|
| `@mailagent/mcp` | 0.2.4 |
| `@mailagent/qa` | 0.1.13 |
| `@mailagent/agent` | 0.1.9 |

```bash
npm install @mailagent/mcp @mailagent/qa @mailagent/agent
```

Re-release: [PUBLISH.md](./PUBLISH.md) · CI: workflow **Publish npm packages** (OIDC Trusted Publishing, tag `v*`).

## CI ✅

Deploy on push `main`: [CI.md](./CI.md) — `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, **`MAILAGENT_API_KEY`** (prod gate).

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

## Next (QA / Developer track)

### v0.8 QA relief ✅

| `@mailagent/qa` 0.1.8+ debug + attachments + messageIndex | ✅ |
| Debug UI `?inbox=` + tables | ✅ |
| `npm run smoke:qa` | ✅ |
| [QA-TROUBLESHOOTING.md](./QA-TROUBLESHOOTING.md) | ✅ |
| [QA-LOCAL-SMTP.md](./QA-LOCAL-SMTP.md) + Mailpit compose | ✅ |
| `parse-otp-message` fallback in extract | ✅ |
| Wait Nth message (`messageIndex`) | ✅ |
| Richer 408 + callback `verification` | ✅ |
| `npm run doctor` | ✅ |

### v0.9 ✅

| `waitForCallback` in `@mailagent/qa` | ✅ |
| `getVerification(inboxId, messageId?)` | ✅ |
| Doctor Resend API ping | ✅ |
| CI: `smoke:qa` after deploy | ✅ |
| `GET /v1/agent` mcpTools = manifest | ✅ |
| [QA-RELEASE.md](./QA-RELEASE.md) | ✅ |
| Publish `@mailagent/qa@0.1.9` | ✅ |

### v0.9+ ✅

| PR CI smoke on `qa/*` (`.github/workflows/qa-smoke.yml`) | ✅ |
| Contract + `messageIndex` + callback (`test:contract:qa:callback`) | ✅ |
| Playwright `mailagent-callback.fixture.ts` | ✅ |

### v0.10 ✅

| `@mailagent/agent@0.1.5` — `messageIndex` in verify | ✅ |
| Simulate `--with-attachment`, contract attachments | ✅ |
| Playwright `attachment.spec.example.ts` | ✅ |
| Contract on deploy (optional secrets) | ✅ |
| Publish `@mailagent/agent@0.1.5` | manual (`npm run publish:agent`, org login) |

### v0.11 Codex (plugin + MCP)

| [CODEX.md](./CODEX.md) — plan and setup | ✅ |
| `examples/codex/config.toml.example` (stdio + remote) | ✅ |
| Codex plugin scaffold (`examples/codex/plugin/`) | ✅ |
| Skill `mailagent` for Codex | ✅ |
| `npm run smoke:codex` + `verify:codex` in CI | ✅ |
| Remote OAuth preset | ✅ |
| `AGENTS.md` | ✅ |
| Playwright globalSetup | ✅ |
| Codex CLI manual test | manual |
| Marketplace publish | planned |

### v0.12 Diagnose (QA + agents)

| `GET /v1/inboxes/:id/diagnose` | ✅ |
| MCP `mailagent_diagnose_inbox` | ✅ |
| `@mailagent/qa` getDebugContext → diagnose API | ✅ |
| Debug UI troubleshooting panel | ✅ |
| `npm run doctor:qa` | ✅ |
| Vitest example (`examples/vitest/`) | ✅ |

### v0.13 Jest + publish prep

| Jest example (`examples/jest/`) | ✅ |
| `smoke-codex` local fallback before npm publish | ✅ |
| Publish `@mailagent/mcp@0.2.1` | manual |
| Publish `@mailagent/qa@0.1.10` | manual |

### v0.14 Simulate (QA without DATABASE_URL)

| `POST /v1/inboxes/:id/simulate` | ✅ |
| MCP `mailagent_simulate_message` | ✅ |
| Debug UI "Simulate OTP email" | ✅ |
| `@mailagent/qa` / `@mailagent/agent` simulate + diagnose | ✅ |
| smoke:qa simulate → extract | ✅ |

### v0.15 Contract without DATABASE_URL

| `contract-qa*` via `POST …/simulate` | ✅ |
| CI deploy/qa-smoke: `MAILAGENT_API_KEY` only | ✅ |
| `examples/github-actions/contract-qa.yml` | ✅ |
| `scripts/lib/contract-api.mjs` | ✅ |

### v0.16 Simulate-first QA

| `@mailagent/qa` `simulateAndVerify()` | ✅ |
| Playwright simulate example + fixture | ✅ |
| `examples/github-actions/qa-simulate-only.yml` | ✅ |
| OpenAPI `/diagnose` + `/simulate` | ✅ |
| [QA-SIMULATE.md](./QA-SIMULATE.md) | ✅ |

### v0.17 Outbound + threads (AgentMail parity start)

| `POST /v1/inboxes/:id/send` | ✅ |
| `POST …/messages/:id/reply` | ✅ |
| `GET …/threads`, `GET …/threads/:id/messages` | ✅ |
| MCP `mailagent_send_message`, `mailagent_list_threads` | ✅ |
| Migration `011_outbound_threads.sql` | ✅ |
| [V1-PLATFORM.md](./V1-PLATFORM.md) — full v1.0 plan | ✅ |

### v0.18 Inbound threading

| Parse In-Reply-To / References / Message-ID on ingest | ✅ |
| Re: / Fwd: subject fallback | ✅ |
| `simulate` + `inReplyToMessageId` / `rfcMessageId` | ✅ |
| `contract-qa-threads` + smoke thread grouping | ✅ |
| `npm run test:thread-resolve` | ✅ |

### v0.19 Custom domains (AgentMail parity)

| `POST /v1/domains`, `GET`, `POST …/verify`, `DELETE` | ✅ |
| `POST /v1/inboxes` `{ username, domainId }` | ✅ |
| MCP `mailagent_add_domain`, `mailagent_list_domains`, `mailagent_verify_domain` | ✅ |
| Migration `012_custom_domains.sql` | ✅ |
| `contract-qa-domains` | ✅ |

### v0.21 Semantic search

| `GET /v1/inboxes/:id/search?q=` keyword + semantic | ✅ |
| pgvector `message_search` + Workers AI embeddings | ✅ |
| MCP `mailagent_search_messages` | ✅ |
| `contract-qa-search` | ✅ |

### v0.22 Structured extraction

| `POST …/messages/:id/extract` presets + custom schema | ✅ |
| Presets `2fa`, `invoice`, `receipt` (rules; AI for custom) | ✅ |
| `GET …/extract/presets` | ✅ |
| MCP `mailagent_extract_structured` | ✅ |
| `contract-qa-extract` | ✅ |

### v0.23 Hosted console + billing portal

| `GET /v1/console/summary` (plan, usage, inboxes, domains, team) | ✅ |
| Scoped usage meters (`messagesLast24h`, domains, team keys) | ✅ |
| Extended `GET /v1/me` limits + usage | ✅ |
| `POST /v1/billing/portal` (Stripe Customer Portal) | ✅ |
| Console UI `dashboard.html` | ✅ |
| `contract-qa-console` | ✅ |

### v0.24 Audit log (enterprise prep)

| Migration `014_audit_log` | ✅ |
| `GET /v1/audit` team / key scoped | ✅ |
| Events: inbox, team keys, domains, billing checkout | ✅ |
| Console `recentAudit` in summary + dashboard | ✅ |
| `contract-qa-audit` | ✅ |

### v0.25 Console threads + audit retention

| `GET /v1/console/threads` scoped recent conversations | ✅ |
| `recentThreads` in console summary + dashboard UI | ✅ |
| Audit retention cron (`AUDIT_RETENTION_DAYS`, default 90) | ✅ |
| `policies.auditRetentionDays` in audit + console APIs | ✅ |

### v0.26 Console inbox detail + Codex marketplace pack

| `GET /v1/console/inboxes/:id` messages + threads + callbacks | ✅ |
| `console-inbox.html` hosted inbox view | ✅ |
| Codex plugin v0.2.3 + `npm run package:codex` tarball | ✅ |
| Skill updated (21 MCP tools) | ✅ |
| `contract-qa-console-inbox` | ✅ |

### v0.27 Console send/reply + npm publish prep

| Send / reply forms in `console-inbox.html` | ✅ |
| `outbound` capability in console inbox detail | ✅ |
| Audit `inbox.sent` / `inbox.replied` | ✅ |
| `publish-check` compares local vs npm registry | ✅ |
| Bump `@mailagent/qa@0.1.13`, `@mailagent/agent@0.1.7` | ✅ |

### v0.28 Team keys UI (without Stripe)

| Dashboard: create key form (label, prefix, read-only) | ✅ |
| Dashboard: revoke key + show-once banner | ✅ |
| `team.canManageKeys` in console summary | ✅ |
| `contract-qa-team-keys` | ✅ |
| ROADMAP / PUBLISH OIDC sync | ✅ |

### v0.29 Codex & teams docs

| `public/docs/codex.html` — Codex plugin install + marketplace pack | ✅ |
| `public/docs/teams.html` — team keys without Stripe | ✅ |
| `GET /v1/me` → `capabilities.outbound` | ✅ |
| Codex plugin manifest 0.2.4 | ✅ |
| Dashboard + sidebar nav links | ✅ |

### v0.30 Outbound setup guide

| `public/docs/outbound.html` — Resend + OUTBOUND_FROM | ✅ |
| `capabilities.outbound` in console summary + dashboard banner | ✅ |
| Shared `outboundCapabilities()` in console inbox | ✅ |
| `setup-check` hint + `.env.example` | ✅ |
| agents.html outbound + Codex links | ✅ |

### v0.31 Agent SDK + OIDC docs

| `@mailagent/agent@0.1.8` — full `MeProfile`, `getMcpAuth()`, `getAgentHub()` | ✅ |
| `GET /v1/agent` → `auth.oidc` + docs links | ✅ |
| `public/docs/oauth-idp.html` — Auth0/Google setup | ✅ |
| doctor/smoke — outbound + oidc in output | ✅ |

### v0.32 Operator + prod gate

| `docs/OPERATOR.md` — manual secrets only | ✅ |
| `npm run test:contract:all` + `npm run test:prod` | ✅ |
| CI: `MAILAGENT_API_KEY` required, fail if missing | ✅ |
| `contract-qa-agent` — hub / me / mcp/auth | ✅ |
| AGENTS.md — autonomy + test:prod | ✅ |

### v0.33 Autotests guide for agents

| `docs/AUTOTESTS.md` — full guide | ✅ |
| `public/docs/autotests.html` + sidebar nav | ✅ |
| `GET /v1/agent` → `tests`, `autotests` | ✅ |
| `contract-qa-agent` checks autotests discovery | ✅ |
| AGENTS.md + skills + Codex skill — test:prod workflow | ✅ |

### v0.34 English-only docs and comments

| All `docs/*.md`, code comments, workflow messages → English | ✅ |
| `docs/AUTOTESTS.md`, `OPERATOR.md` | ✅ |

### v0.35 Session memory + Playwright CI + npm

| Migration `015_agent_run_sessions` | ✅ |
| `GET/PATCH /v1/agent/runs/:runId/session` | ✅ |
| MCP `mailagent_get_run_session`, `mailagent_patch_run_session` | ✅ |
| `@mailagent/agent@0.1.9` — getRunSession / patchRunSession | ✅ |
| `@mailagent/mcp@0.2.4` | ✅ |
| `contract-qa-session` + Playwright `simulate-gate.spec.ts` in `test:prod` | ✅ |
| `V1-PLATFORM.md` status sync | ✅ |
| Optional CI `DATABASE_URL` → `db:migrate` on deploy | ✅ |

### Deferred (not QA)

- ~~Agent session memory / multi-step run state~~ ✅ v0.35
- OIDC on prod (Auth0 secrets)
- Stripe secrets on prod (manual `wrangler secret put`)
- `OUTBOUND_FROM` on prod (Resend verified domain)
- Codex Marketplace submit (manual)
