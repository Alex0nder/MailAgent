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
| `@mailagent/qa` | 0.1.9 |
| `@mailagent/agent` | 0.1.5 (npm may lag — `npm run publish:agent`) |

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

### v0.10 (следующий спринт)

| `@mailagent/agent@0.1.5` — `messageIndex` в verify | in repo |
| Publish `@mailagent/agent@0.1.5` | pending |
| Simulate `--with-attachment`, contract attachments | ✅ |
| Playwright `attachment.spec.example.ts` | ✅ |
| Contract on deploy (optional secrets) | ✅ |
| GitHub Secrets: `MAILAGENT_API_KEY` + `DATABASE_URL` | optional |
| Удалить ветку `qa/v0.8` на GitHub | housekeeping |

### Отложено (не QA)

- Agent session memory / multi-step run state
- OIDC on prod (Auth0 secrets)
- Billing / Stripe
