# Business Core — MailAgent

## Зачем существует

MailAgent — сервис **временных почтовых ящиков** для **AI-агентов** и **QA/E2E-тестов**. Продукт позволяет программно получать OTP-коды и magic links при регистрации/логине без ручного разбора HTML и без общих тестовых почтовых ящиков.

Официальное позиционирование (README): *«Temporary inboxes for AI agents & QA/E2E — MCP, REST, OTP/magic links»*.

Продакшн: [webmailagent.com](https://webmailagent.com) (лендинг + статика), API: [api.webmailagent.com](https://api.webmailagent.com).

## Какую проблему решает

| Боль (из docs/QA.md) | Решение MailAgent |
|----------------------|-------------------|
| Общий test@company.com — гонки, чужие письма | Inbox на тест (`label` = CI run id) |
| Ждать 60–120 с почту в тесте | `POST /v1/inboxes/open` — один вызов |
| Flaky: письмо пришло, poll пропустил | SSE + poll; опционально `callbackUrl` |
| Нужен OTP/link, не HTML | `verification.otp`, `primaryLink` |
| Тест упал — что в inbox? | `GET /v1/inboxes?label=...` + messages |
| Почта не от staging | `expectFrom` / `service` allowlist |

Дополнительно для агентов: MCP-инструменты (23), remote MCP, Agent Skills, Codex plugin — автономная верификация signup без человека (AGENTS.md).

## Кто пользователь

1. **QA-инженеры** — Playwright/Cypress, CI (GitHub Actions), `@mailagent/qa`.
2. **AI-агенты** — Cursor, Codex, любой MCP-клиент через `@mailagent/mcp` или remote `POST /mcp`.
3. **Разработчики интеграций** — REST SDK `@mailagent/agent`, self-host (docs/INTEGRATE.md).
4. **Команды (teams)** — scoped API keys, billing (Stripe Pro/Enterprise), custom domains, dedicated Resend (enterprise).
5. **Оператор (human)** — одноразовая настройка секретов (docs/OPERATOR.md).

**Не целевой пользователь:** люди, ищущие privacy burners — продукт для программных agent-inbox с allowlist (skills/mailagent/SKILL.md).

## Главные сценарии

### Agent signup verification
1. Создать inbox (`label`, `service` preset).
2. Подставить `address` в форму регистрации.
3. Дождаться письма (`subjectContains`, `messageIndex`).
4. Использовать `otp` или `primaryLink`.
5. Удалить inbox.

Инструменты: `mailagent_verify_signup`, `mailagent_wait_and_extract`, `POST /v1/inboxes/open`.

### QA/E2E в CI
- `label: ci-$GITHUB_RUN_ID`, `service: auth0`, `timeoutSeconds: 120`.
- Playwright fixture `@mailagent/qa`.
- Без реального SMTP: `POST …/simulate` (contract tests).

### Self-host / integrate
- Cloudflare Worker + Neon + Resend (README, SETUP.md, docs/INTEGRATE.md).

### Enterprise
- Teams, scoped keys, custom domains, dedicated Resend webhook, audit log, Stripe billing.

## Метрики и ограничения (важные для бизнеса)

### Plan limits (`src/lib/plans.ts`)

| Plan | Rate/min | Max active inboxes | Team keys | Custom domains | Dedicated Resend |
|------|----------|-------------------|-----------|----------------|------------------|
| free | 60 | 10 | 5 | 1 | no |
| pro | 300 | 100 | 20 | 10 | no |
| enterprise | 600 | 500 | 50 | 25 | yes |
| legacy | 120 | 500 | 0 | 3 | no |

### Операционные метрики
- `GET /v1/stats` — счётчики inbox/message за 24h.
- SLA документирован в docs/SLA.md.
- Post-deploy gate: `test:prod:gate` (~15 API calls).

### Продуктовые KPI (вывод из документации)
- Успешность verify flow без human OTP check.
- Время от create inbox до extract OTP (SSE/wait timeout до 120s).
- Flake rate в CI (mitigate через simulate, callback, diagnose).
- Adoption MCP/agent skills (distribution: docs/DISTRIBUTION-STATUS.md, catalog PRs).

## Монетизация

- Stripe: Pro subscription (`STRIPE_PRICE_PRO`), checkout/portal (`/v1/billing/*`).
- Enterprise: dedicated Resend, higher limits.

## Дистрибуция

npm: `@mailagent/mcp`, `@mailagent/agent`, `@mailagent/qa`.  
Agent Skills: `skills/mailagent/SKILL.md`.  
Codex plugin: `examples/codex/plugin/`.
