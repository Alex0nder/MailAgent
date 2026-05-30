# MailAgent roadmap

Текущий статус: **v0.2.0** — Phase 2 закрыт.

## Сейчас (v0.2) ✅

- REST + SSE + Queues + OTP/links
- MCP + `@mailagent/qa`
- QA: `label`, `subjectContains`, `callbackUrl`, delivery log
- Multi API keys, rate limits, `api_key_hint`, `/debug.html`
- OpenAPI 3.0: `/v1/openapi.json`
- Self-host docs, MIT

## Phase 1 — Hosted pilots ✅

| Задача | Статус |
|--------|--------|
| `API_KEYS`, stats, smoke, issue:key | ✅ |
| npm publish `@mailagent/qa` | ⏳ `npm run publish:qa` |

## Phase 2 — Product hardening ✅

| Задача | Статус |
|--------|--------|
| Rate limits (KV) | ✅ |
| `api_key_hint` | ✅ |
| Debug UI | ✅ |
| OpenAPI полная схема | ✅ |
| Webhook delivery log | ✅ `GET …/callbacks` |

## Phase 3 — Growth (дальше)

| Задача | Зачем |
|--------|--------|
| Stripe / free tier | Монетизация hosted |
| Team keys + dashboard | B2B QA |
| Custom inbox domain wizard | Свой домен вместо `*.resend.app` |
| Presets (Figma, Notion, …) | Меньше ручного `expectFrom` |

## Не делаем

- Browser extension (burner mail)
- Полноценный webmail UI
- Marketing email (Resend)

## Фичи

Issue на GitHub или hello@webmailagent.com.
