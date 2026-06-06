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
| `@mailagent/mcp` | 0.2.2 |
| `@mailagent/qa` | 0.1.12 |
| `@mailagent/agent` | 0.1.6 (npm may lag — `npm run publish:agent`) |

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

## Дальше (QA / Developer track)

### v0.8 QA relief ✅

| `@mailagent/qa` 0.1.8+ debug + attachments + messageIndex | ✅ |
| Debug UI `?inbox=` + таблицы | ✅ |
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

| `@mailagent/agent@0.1.5` — `messageIndex` в verify | ✅ |
| Simulate `--with-attachment`, contract attachments | ✅ |
| Playwright `attachment.spec.example.ts` | ✅ |
| Contract on deploy (optional secrets) | ✅ |
| Publish `@mailagent/agent@0.1.5` | manual (`npm run publish:agent`, org login) |

### v0.11 Codex (plugin + MCP)

| [CODEX.md](./CODEX.md) — план и setup | ✅ |
| `examples/codex/config.toml.example` (stdio + remote) | ✅ |
| Codex plugin scaffold (`examples/codex/plugin/`) | ✅ |
| Skill `mailagent` для Codex | ✅ |
| `npm run smoke:codex` + `verify:codex` в CI | ✅ |
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
| `smoke-codex` local fallback до npm publish | ✅ |
| Publish `@mailagent/mcp@0.2.1` | manual |
| Publish `@mailagent/qa@0.1.10` | manual |

### v0.14 Simulate (QA без DATABASE_URL)

| `POST /v1/inboxes/:id/simulate` | ✅ |
| MCP `mailagent_simulate_message` | ✅ |
| Debug UI «Simulate OTP email» | ✅ |
| `@mailagent/qa` / `@mailagent/agent` simulate + diagnose | ✅ |
| smoke:qa simulate → extract | ✅ |

### v0.15 Contract без DATABASE_URL

| `contract-qa*` через `POST …/simulate` | ✅ |
| CI deploy/qa-smoke: только `MAILAGENT_API_KEY` | ✅ |
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
| [V1-PLATFORM.md](./V1-PLATFORM.md) — полный план v1.0 | ✅ |

### v0.18 Inbound threading

| Parse In-Reply-To / References / Message-ID on ingest | ✅ |
| Re: / Fwd: subject fallback | ✅ |
| `simulate` + `inReplyToMessageId` / `rfcMessageId` | ✅ |
| `contract-qa-threads` + smoke thread grouping | ✅ |
| `npm run test:thread-resolve` | ✅ |

### Отложено (не QA)

- Agent session memory / multi-step run state
- OIDC on prod (Auth0 secrets)
- Billing / Stripe
