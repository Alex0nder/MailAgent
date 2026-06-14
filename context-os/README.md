# MailAgent Context OS

Экспериментальная система контекстных ядер поверх репозитория MailAgent. Цель — давать AI минимальный, но достаточный контекст вместо всего репозитория.

**Framework:** [github.com/Alex0nder/AI-Context-OS](https://github.com/Alex0nder/AI-Context-OS) — теория, схемы, prompts, evaluation. Эта папка — **заполненный инстанс Phase 1** для MailAgent (не шаблон).

**Не изменяет продукт.** Только анализ и маршрутизация контекста.

## Структура

```
context-os/
├── README.md              ← вы здесь
├── manifest.json          ← индекс ядер и метаданные
├── REPORT.md              ← итоги эксперимента
├── cores/                 ← 4 главных ядра (~500+ строк каждое)
├── subcores/              ← 12 специализированных ядер (incl. auth-billing, data-model, serialization, deployment-testing)
├── router/                ← маршрутизация вопросов → ядра
└── audit/                 ← карта проекта, риски, кандидаты на cleanup
```

## Автоматический A/B/C замер

| Condition | Что это |
|-----------|---------|
| A | Full repo baseline |
| B | Context OS cores |
| C | Hermes-style graph (`graph/graph-index.json`) |

```bash
npm run sync:context-os              # manifest + cores из src/mcp, presets, stats
npm run eval:context-os:graph-build  # индекс для C
npm run eval:context-os:router-build # embeddings для semantic router (OPENAI_API_KEY)
npm run eval:context-os:route        # keyword router F1
npm run eval:context-os:route-semantic
npm run eval:context-os:dry-abc      # размеры A/B/C без API
npm run eval:context-os:pilot        # 10 вопросов A/B/C
npm run eval:context-os:aggregate    # SUMMARY.md
npm run eval:context-os:tokens       # TOKENS.md
```

Подробно: [eval/README.md](eval/README.md). Результаты в `eval/results/` — pull в [AI-Context-OS](https://github.com/Alex0nder/AI-Context-OS).

## Как использовать

1. Получить вопрос от пользователя или агента.
2. Открыть `router/question-router.md` или `router/routing-map.json`.
3. Загрузить **только** указанные ядра (core + subcore). Router: `routeQuestion()` в `eval/lib/router.mjs` (F1 **1.0** на 45 eval-вопросах).
4. При необходимости добавить `audit/project-map.md` для навигации по файлам.

## Шесть primary cores (+ legacy subcores)

См. [CORE-DEFINITIONS.md](CORE-DEFINITIONS.md) · Аудит: [audit/codebase-audit.md](audit/codebase-audit.md)

| Ядро | Файл | Когда |
|------|------|-------|
| Business | `cores/business-core.md` | Зачем продукт, планы, monetization |
| Product | `cores/product-core.md` | Flows, MCP, QA scenarios |
| Auth & Billing | `subcores/auth-billing-core.md` | API keys, OAuth, Stripe, scopes |
| Data Model | `subcores/data-model-core.md` | Schema, migrations, idempotency |
| Serialization | `subcores/serialization-core.md` | Extract, validation, OpenAPI |
| Deployment & Testing | `subcores/deployment-testing-core.md` | Deploy, CI, contract tests |

## Четыре главных ядра (overview)

| Ядро | Файл | Когда |
|------|------|-------|
| Business | `cores/business-core.md` | Зачем продукт, кто пользователь, метрики |
| Product | `cores/product-core.md` | Сценарии, flows (inbox, email, OTP, QA, agent) |
| Technical | `cores/technical-core.md` | Архитектура, стек, зависимости, точки отказа |
| Operational | `cores/operational-core.md` | Deploy, CI, env, тесты, мониторинг |

## Legacy subcores (узкая маршрутизация)

`inbox-core` · `email-core` · `otp-core` · `api-core` · `worker-core` · `database-core` · `deployment-core` · `security-core`

## Источники истины

Данные взяты из: `README.md`, `AGENTS.md`, `SETUP.md`, `docs/`, `src/`, `mcp/`, `packages/`, `migrations/`, `wrangler.jsonc`, `package.json`, `.github/workflows/`.

Создано: 2026-06-10. Обновлено: 2026-06-14 (6 primary + 12 subcores, ~500+ строк). Версия репозитория: `mailagent@0.1.0`, MCP server `0.8.2`.
