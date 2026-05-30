# MailAgent roadmap

Текущий статус: **v0.1.1** — open source, hosted API, MCP, QA SDK, лендинг.

## Сейчас (v0.1) ✅

- REST + SSE + Queues + OTP/links
- MCP + `@mailagent/qa`
- `label`, `subjectContains`, `callbackUrl`
- Self-host docs, MIT

## Phase 1 — Hosted pilots ✅

| Задача | Статус |
|--------|--------|
| Несколько API keys (`API_KEYS`) | ✅ |
| `GET /v1/stats` | ✅ |
| `npm run smoke:prod` | ✅ |
| `npm run issue:key` | ✅ |
| Миграция `003` на Neon prod | ⏳ `npm run db:migrate` на prod |
| npm publish `@mailagent/qa` | ⏳ `npm run publish:qa` (нужен npm login) |

## Phase 2 — Product hardening (в работе)

| Задача | Статус |
|--------|--------|
| Rate limits (KV) per key | ✅ `RATE_LIMIT` + 120/min |
| `api_key_hint` на inbox | ✅ миграция `004` |
| Debug UI `/debug.html` | ✅ |
| OpenAPI = полная схема | 📋 |
| Webhook delivery log | 📋 |

## Phase 3 — Growth (позже)

| Задача | Зачем |
|--------|--------|
| Stripe / free tier | Монетизация hosted |
| Team keys + dashboard | B2B QA команды |
| Custom inbox domain wizard | Бренд вместо `*.resend.app` |
| Больше presets (Figma, Notion, …) | Меньше `expectFrom` вручную |

## Не делаем

- Browser extension для людей (burner mail)
- Полноценный webmail UI
- Marketing email sending (это Resend, не мы)

## Как предложить фичу

Issue на GitHub или hello@webmailagent.com.
