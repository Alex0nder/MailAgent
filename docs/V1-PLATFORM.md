# MailAgent v1.0 — AgentMail + больше

Цель: **полноценный email API для агентов** (inbound + outbound + threads) **и** преимущества, которых нет у [AgentMail](https://www.agentmail.to/).

## Позиционирование

| | AgentMail | MailAgent v1.0 |
|---|-----------|----------------|
| Inbound | ✅ | ✅ |
| Outbound / reply | ✅ | 🚧 v0.17 |
| Threads | ✅ | 🚧 v0.17 |
| Attachments | ✅ | ✅ |
| Realtime (SSE/webhooks) | ✅ | ✅ + MCP progress |
| Custom domains | ✅ API | ✅ v0.19 |
| Semantic search | ✅ | ✅ v0.21 |
| Document extraction | ✅ | ✅ v0.22 |
| MCP | ✅ | ✅ OAuth + 15+ tools |
| SDK (TS/Python) | ✅ | ✅ TS + MCP |
| Enterprise / SOC 2 | ✅ | 🚧 v0.23+ |
| **Open source** | ❌ | ✅ MIT |
| **Self-host (Cloudflare)** | ❌ | ✅ |
| **QA / E2E (`@mailagent/qa`)** | ❌ | ✅ |
| **Simulate без SMTP** | ❌ | ✅ |
| **Diagnose on timeout** | ❌ | ✅ |
| **Agent verify + primaryAction** | partial | ✅ |

---

## Фазы

### Phase 1 — v0.17–0.18: Двусторонняя почта ✅

| Задача | API / MCP |
|--------|-----------|
| `POST /v1/inboxes/:id/send` | text/html, to[], cc[] |
| `POST …/messages/:id/reply` | In-Reply-To / References |
| `GET …/threads`, `GET …/threads/:id/messages` | conversation view |
| MCP `mailagent_send_message`, `mailagent_list_threads` | agents |
| Inbound → thread_id (subject / headers) | авто-группировка |

**Resend:** verified send domain (`OUTBOUND_FROM`), Reply-To = inbox address.

### Phase 2 — v0.19–0.20: Custom domains ✅ (API v0.19)

| Задача | |
|--------|--|
| `POST /v1/domains` | add domain, DNS instructions |
| `GET /v1/domains/:id/verify` | poll MX/SPF status |
| `POST /v1/inboxes` `{ username, domainId }` | как AgentMail |
| Team-scoped domains | multi-tenant |

### Phase 3 — v0.21: Semantic search ✅

| Задача | |
|--------|--|
| Embedding at ingest (Workers AI / external) | pgvector в Neon |
| `GET /v1/inboxes/:id/search?q=` | semantic + keyword |
| MCP `mailagent_search_messages` | |

### Phase 4 — v0.22: Structured extraction ✅

| Задача | |
|--------|--|
| `POST /v1/messages/:id/extract` `{ schema }` | JSON из body/attachments |
| Presets: invoice, receipt, 2FA | |
| Сохранить OTP/links как сейчас | backward compatible |

### Phase 5 — v0.23: Hosted SaaS

| Задача | |
|--------|--|
| Stripe live, plans, usage meters | |
| Web console (inboxes, threads, domains) | |
| API keys UI, team invites | |
| Codex Marketplace publish | |

### Phase 6 — v0.24+: Enterprise

| Задача | |
|--------|--|
| SOC 2 narrative / audit prep | |
| Dedicated domains, SLA | |
| Audit log, retention policies | |

---

## Что не теряем (always-on)

- `@mailagent/qa`, simulate, diagnose, contract CI
- Remote MCP + OAuth + DCR
- Self-host docs ([INTEGRATE.md](./INTEGRATE.md))
- Service presets + allowlist

---

## Метрики «больше AgentMail»

1. **Time-to-first-OTP** — MCP one-shot + simulate для CI
2. **Time-to-debug-failure** — diagnose API (уникально)
3. **Self-host TCO** — $0 infra кроме Cloudflare + Neon
4. **QA adoption** — Playwright fixture installs vs generic inbox API

---

## Следующий коммит

v0.23: hosted SaaS console + Stripe live billing.
