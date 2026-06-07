# MailAgent v1.0 — AgentMail and more

Goal: **full email API for agents** (inbound + outbound + threads) **plus** advantages [AgentMail](https://www.agentmail.to/) does not have.

## Positioning

| | AgentMail | MailAgent v1.0 |
|---|-----------|----------------|
| Inbound | ✅ | ✅ |
| Outbound / reply | ✅ | ✅ |
| Threads | ✅ | ✅ |
| Attachments | ✅ | ✅ |
| Realtime (SSE/webhooks) | ✅ | ✅ + MCP progress |
| Custom domains | ✅ API | ✅ |
| Semantic search | ✅ | ✅ |
| Document extraction | ✅ | ✅ |
| MCP | ✅ | ✅ OAuth + 23 tools |
| SDK (TS/Python) | ✅ | ✅ TS + MCP |
| Enterprise / SOC 2 | ✅ | ✅ audit log + retention |
| **Open source** | ❌ | ✅ MIT |
| **Self-host (Cloudflare)** | ❌ | ✅ |
| **QA / E2E (`@mailagent/qa`)** | ❌ | ✅ |
| **Simulate without SMTP** | ❌ | ✅ |
| **Diagnose on timeout** | ❌ | ✅ |
| **Agent verify + primaryAction** | partial | ✅ |
| **Multi-step run memory** | partial | ✅ session API + MCP |

---

## Phases

### Phase 1 — v0.17–0.18: Two-way mail ✅

| Task | API / MCP |
|--------|-----------|
| `POST /v1/inboxes/:id/send` | text/html, to[], cc[] |
| `POST …/messages/:id/reply` | In-Reply-To / References |
| `GET …/threads`, `GET …/threads/:id/messages` | conversation view |
| MCP `mailagent_send_message`, `mailagent_list_threads` | agents |
| Inbound → thread_id (subject / headers) | auto-grouping |

**Resend:** verified send domain (`OUTBOUND_FROM`), Reply-To = inbox address.

### Phase 2 — v0.19–0.20: Custom domains ✅

| Task | |
|--------|--|
| `POST /v1/domains` | add domain, DNS instructions |
| `GET /v1/domains/:id/verify` | poll MX/SPF status |
| `POST /v1/inboxes` `{ username, domainId }` | like AgentMail |
| Team-scoped domains | multi-tenant |

### Phase 3 — v0.21: Semantic search ✅

| Task | |
|--------|--|
| Embedding at ingest (Workers AI / external) | pgvector in Neon |
| `GET /v1/inboxes/:id/search?q=` | semantic + keyword |
| MCP `mailagent_search_messages` | |

### Phase 4 — v0.22: Structured extraction ✅

| Task | |
|--------|--|
| `POST /v1/messages/:id/extract` `{ schema }` | JSON from body/attachments |
| Presets: invoice, receipt, 2FA | |
| Keep OTP/links as today | backward compatible |

### Phase 5 — v0.23–0.28: Hosted SaaS ✅ (API + console)

| Task | Status |
|--------|--------|
| Stripe checkout + portal (API) | ✅ code; live secrets optional |
| Web console (inboxes, threads, domains) | ✅ |
| API keys UI, team invites | ✅ |
| Codex Marketplace publish | manual |

### Phase 6 — v0.24+: Enterprise ✅ (foundation)

| Task | Status |
|--------|--------|
| Audit log + retention policies | ✅ |
| SOC 2 narrative / SLA | backlog |
| Dedicated domains | backlog |

---

## Always-on (do not drop)

- `@mailagent/qa`, simulate, diagnose, contract CI, Playwright simulate gate
- Remote MCP + OAuth + DCR
- Self-host docs ([INTEGRATE.md](./INTEGRATE.md))
- Service presets + allowlist
- Agent run session memory (`GET/PATCH …/runs/:runId/session`)

---

## Metrics beyond AgentMail

1. **Time-to-first-OTP** — MCP one-shot + simulate for CI
2. **Time-to-debug-failure** — diagnose API (unique)
3. **Self-host TCO** — $0 infra except Cloudflare + Neon
4. **QA adoption** — Playwright fixture installs vs generic inbox API

---

## Next step

See [ROADMAP.md](./ROADMAP.md) **Deferred** — Stripe on hold, Codex Plugin Directory (OpenAI), awesome-codex PR #195.  
OIDC + outbound on prod ✅ · CI uses `test:prod:gate` (KV-friendly).
