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
| `@mailagent/mcp` | 0.2.5 |
| `@mailagent/qa` | 0.1.13 |
| `@mailagent/agent` | 0.1.11 |

```bash
npm install @mailagent/mcp @mailagent/qa @mailagent/agent
```

Re-release: [PUBLISH.md](./PUBLISH.md) · CI: workflow **Publish npm packages** (OIDC Trusted Publishing, tag `v*`).

## CI ✅

Deploy on push `main`: [CI.md](./CI.md) — `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, **`MAILAGENT_API_KEY`** (prod gate).

**KV free tier:** rate limit uses sampled writes (`RATE_LIMIT_KV_WRITE_EVERY=10`). CI deploy uses `test:prod:gate` (smoke only); full `test:prod` on tag `v*` or manual. OIDC browser login uses stateless JWT (no KV puts).

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

### v0.35.1 KV put quota (free tier)

| Rate limit: sample KV writes (`RATE_LIMIT_KV_WRITE_EVERY=10`) | ✅ |
| MCP stream progress: no redundant KV relay on `tools/call` SSE | ✅ |
| Prod smoke fallback when KV exhausted | ✅ |

### v0.36 Stateless mat_ JWT + verify session

| `mat_` tokens signed as JWT (HS256, no KV put/get) | ✅ |
| Legacy KV-backed `mat_` still validated | ✅ |
| `POST /v1/agent/verify` auto-patches run session when `runId` set | ✅ |
| Optional `MCP_OAUTH_JWT_SECRET` (default `API_KEY`) | ✅ |

### v0.37 Verify session everywhere

| Session patch inside `runAgentVerify` (REST + MCP) | ✅ |
| MCP `runId` on verify / wait_and_extract | ✅ |
| MCP `create_inbox` → `inbox.created` session step | ✅ |
| API hub `0.8.0` · npm `@mailagent/agent@0.1.10` `@mailagent/mcp@0.2.5` | ✅ |

### v0.38 Stateless MCP sessions + session in verify/run

| MCP `Mcp-Session-Id` as JWT (no KV put on initialize) | ✅ |
| `POST /v1/agent/verify` response includes `session` when `runId` set | ✅ |
| `GET /v1/agent/runs/:runId` includes `session` | ✅ |
| `@mailagent/agent@0.1.11` · API hub `0.8.1` | ✅ |

### v0.39 Agent Skills ecosystem

| Canonical `skills/mailagent/SKILL.md` (Agent Skills spec) | ✅ |
| `npm run sync:skills` → Cursor + Codex plugin copies | ✅ |
| `npm run verify:skills` · [AGENT-SKILLS.md](./AGENT-SKILLS.md) | ✅ |
| Combo flows (verify → Membrane / app skills) documented | ✅ |
| `npx skills add Alex0nder/MailAgent --skill mailagent` | ✅ |
| OIDC contract `test:contract:qa:oidc` (skip if disabled) | ✅ |
| `npm run doctor:oidc` + setup:oidc-prod verify hook | ✅ |
| Catalog submit guide [CATALOG-SUBMIT.md](./CATALOG-SUBMIT.md) | ✅ |
| `npm run prepare:catalog-pr` staging bundle | ✅ |
| awesome-codex-plugins PR | [#195](https://github.com/hashgraph-online/awesome-codex-plugins/pull/195) mergeable, maintainer merge |
| Docs page `/docs/agent-skills.html` | ✅ |

### v0.40 OIDC prod + KV relief

| Auth0 tenant `webmailagent.us.auth0.com` + MailAgent MCP app | ✅ |
| OIDC secrets on Worker (`npm run wizard:auth0 -- --deploy`) | ✅ |
| `auth.oidc: enabled` on prod | ✅ |
| Stateless OIDC flow JWT (authorize state + auth code, no KV puts) | ✅ |
| `npm run wizard:auth0` interactive setup | ✅ |

### v0.40.1 CI KV relief

| `test:prod:gate` — smoke only on deploy/PR (not full contract suite) | ✅ |
| OIDC flow JWT (no KV on browser login) | ✅ |
| `test-prod-full.yml` workflow_dispatch | ✅ |
| `GET /v1/agent` → `tests.prodGateCi` | ✅ |

### v0.41 Domains docs

| `custom-domain.html` — SaaS API + self-host INBOX_DOMAIN | ✅ |
| Resend quota note in domains guide | ✅ |

### v0.42 Console domains UI

| Dashboard: add domain form + DNS banner | ✅ |
| Verify DNS / delete domain buttons | ✅ |
| `enterprise.html` + sidebar link | ✅ |

### v0.43 Landing + SOC2 draft

| Landing: OIDC + console feature cards, CTA dashboard link | ✅ |
| `GET /v1/agent` → `console`, `enterprise` URLs | ✅ |
| `docs/SOC2.md` control mapping draft | ✅ |
| `npm run rotate:oidc` alias | ✅ |

### v0.44 Console self-serve + audit UI

| Dashboard: create inbox form (label + service preset) | ✅ |
| `audit.html` — paginated `GET /v1/audit` (`before` cursor) | ✅ |
| Audit API `hasMore` + `nextBefore` | ✅ |
| Sidebar + console summary `links.audit` | ✅ |

### v0.45 Distribution (catalog + review fixes)

| `run-mailagent-mcp.sh` — generic plugin-root `.env` hint | ✅ |
| `README.catalog.md` for awesome-codex-plugins paths | ✅ |
| `prepare:catalog-pr` copies catalog README into staging | ✅ |
| SKILL — console key + `test:prod` from MailAgent repo only | ✅ |
| awesome-codex-plugins PR [#195](https://github.com/hashgraph-online/awesome-codex-plugins/pull/195) refresh | ✅ pushed |

### v0.46 Enterprise — dedicated Resend

| `enterprise` plan + limits in `plans.ts` | ✅ |
| Migration `016_team_dedicated_resend` | ✅ |
| `PUT/GET/DELETE /v1/team/dedicated-resend` | ✅ |
| Encrypted team Resend key + webhook secret | ✅ |
| `POST /webhooks/resend/team/:teamId` | ✅ |
| Custom domains use team Resend when configured | ✅ |
| Enterprise requires dedicated Resend before domains | ✅ |
| `npm run team:plan -- TEAM_ID enterprise` | ✅ |
| [DEDICATED-DOMAINS.md](./DEDICATED-DOMAINS.md) | ✅ |

### v0.47 Enterprise — outbound on dedicated Resend

| `send` / `reply` use team Resend when configured | ✅ |
| From address = custom-domain inbox (`domainId` required) | ✅ |
| `capabilities.outbound.dedicatedResend` in `/v1/me` + console | ✅ |
| MCP `mailagent_send_message` passes `teamId` | ✅ |

### v0.48 Enterprise — console dedicated Resend UI

| Dashboard section: configure / status / webhook URL | ✅ |
| `dedicatedResend` in `GET /v1/console/summary` | ✅ |
| Enterprise banner before domains when not configured | ✅ |
| `contract-qa-console` checks `dedicatedResend` shape | ✅ |

### v0.49 Enterprise docs page

| `public/docs/dedicated-domains.html` | ✅ |
| Sidebar + footer nav link | ✅ |
| Cross-links from enterprise, custom-domain, dashboard | ✅ |

### v0.50 Distribution (catalog PR follow-up)

| Merge `upstream/main` into PR [#195](https://github.com/hashgraph-online/awesome-codex-plugins/pull/195) (llm-transpile + mailagent) | ✅ |
| `plugins.json` entry (106 plugins) | ✅ |
| Catalog bundle + `LICENSE` in `plugins/Alex0nder/mailagent` | ✅ |
| HOL plugin scanner CI on MailAgent `main` | ✅ [workflow](https://github.com/Alex0nder/MailAgent/actions/workflows/hol-plugin-scanner.yml) |
| `SECURITY.md` + scanner score 88/100 (0 critical/high) | ✅ |
| awesome-codex-plugins PR #195 maintainer merge | pending |

### v0.51 Enterprise — trust & compliance (public)

| `public/docs/security.html` — CC6/CC7/CC8/A1 summary | ✅ |
| Nav + `GET /v1/agent` → `security` URL | ✅ |
| `SOC2.md` — dedicated Resend tenant isolation | ✅ |
| Cross-links from enterprise + dedicated-domains | ✅ |

### v0.52 Distribution — Codex Directory prep

| `privacy.html` + `terms.html` (hosted SaaS) | ✅ |
| `plugin.json` → `privacyPolicyURL` / `termsOfServiceURL` | ✅ |
| `verify:codex` asserts publisher URLs | ✅ |
| Footer legal links · `GET /v1/agent` → `privacy`, `terms` | ✅ |
| [SKILLS-SUBMIT.md](./SKILLS-SUBMIT.md) — `gh skill publish`, Skill Hub | ✅ |
| Repo topic `agent-skills` | ✅ |
| Official Codex Plugin Directory submit | when OpenAI opens |
| awesome-codex-plugins PR #195 maintainer merge | pending |

### v0.53 Billing — Stripe prep (no account required)

| `docs/STRIPE-SETUP.md` + `public/docs/billing.html` | ✅ |
| `npm run wizard:stripe` · `setup:stripe-prod` · `doctor:billing` | ✅ |
| Webhook `subscription.updated` downgrade | ✅ |
| `test:contract:qa:billing` (503 when disabled) | ✅ |
| `canUpgradeViaStripe` (free only) | ✅ |
| Stripe live on prod (`wizard:stripe --deploy`) | operator when ready |

### v0.54 Distribution — Agent Skills release

| `gh skill publish --tag skills-0.2.5` | ✅ |
| `npm run prepare:skills-pr` staging entry | ✅ |
| awesome-agent-skills [PR #659](https://github.com/VoltAgent/awesome-agent-skills/pull/659) | submitted |
| awesome-codex-plugins PR #195 maintainer merge | pending |

### v0.55 Enterprise (next)

| `public/docs/sla.html` draft | ✅ |
| SOC 2 Type II audit (formal) | planned |
| SLA / support tier live | with Stripe |

### Deferred (not QA)

- ~~Agent session memory / multi-step run state~~ ✅ v0.35
- ~~OIDC on prod~~ ✅ v0.40
- **Stripe on prod** — prep ✅ · enable via `npm run wizard:stripe --deploy`
- ~~`OUTBOUND_FROM` on prod~~ ✅
- ~~Codex repo marketplace~~ ✅ `.agents/plugins/marketplace.json`
- Codex official Plugin Directory submit — coming soon (OpenAI)
