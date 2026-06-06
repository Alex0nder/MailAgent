# Автотесты для агентов

Инструкция для **Cursor / Codex / CI-ботов**: как проверять MailAgent на prod **без участия человека** (без реального SMTP, без `DATABASE_URL`).

Оператор подключает секреты один раз → [OPERATOR.md](./OPERATOR.md).

## Быстрый старт

```bash
npm ci

MAILAGENT_API_URL=https://api.webmailagent.com \
MAILAGENT_API_KEY=ma_… \
  npm run test:prod
```

Это **то же самое**, что post-deploy gate в GitHub Actions.

## Уровни тестов

| Уровень | Команда | Где | Нужен ключ |
|---------|---------|-----|------------|
| **Prod gate** | `npm run test:prod` | CI + локально | `MAILAGENT_API_KEY` |
| **Smoke agent** | `npm run smoke:agent` | MCP, OAuth, DCR, Streamable HTTP | да |
| **Smoke QA** | `npm run smoke:qa` | inbox lifecycle на prod | да |
| **Contract (все)** | `npm run test:contract:all` | 12 скриптов через `simulate` | да |
| **Typecheck** | `npm run check` | PR, без prod | нет |
| **Codex scaffold** | `npm run verify:codex` | PR | нет |
| **Unit (локально)** | `npm run test:allowlist`, `test:extract`, … | dev, не prod | нет |

Contract-тесты **не шлют реальную почту**: письма создаются через `POST /v1/inboxes/:id/simulate`.

## Переменные окружения

| Переменная | Обязательно | Значение |
|------------|-------------|----------|
| `MAILAGENT_API_KEY` | да | team key или legacy `API_KEY` |
| `MAILAGENT_API_URL` | нет | default `https://api.webmailagent.com` |
| `API_KEY` | fallback | alias для `MAILAGENT_API_KEY` |
| `SMOKE_EXPECT_ATTACHMENTS` | smoke:agent | `"1"` в CI |

Локально ключ можно положить в `.env` — подхватит `scripts/load-env.mjs`.

## Prod gate (`test:prod`)

Порядок (см. `scripts/test-prod.mjs`):

1. `smoke:agent` — discovery, OAuth metadata, DCR, MCP session, tool call
2. `smoke:qa` — create → simulate → wait → extract → delete
3. `test:contract:all` — все contract-qa скрипты

Если любой шаг падает — exit code ≠ 0.

## Contract-скрипты (по одному)

Запускай **узкий** скрипт после изменений в конкретной области:

| Скрипт | npm script | Что проверяет |
|--------|------------|---------------|
| `contract-qa.mjs` | `test:contract:qa` | create → simulate OTP → wait → extract |
| `contract-qa-agent.mjs` | `test:contract:qa:agent` | `GET /v1/agent`, `/v1/me`, `/mcp/auth` |
| `contract-qa-callback.mjs` | `test:contract:qa:callback` | webhook callback после simulate |
| `contract-qa-attachments.mjs` | `test:contract:qa:attachments` | вложения + raw MIME |
| `contract-qa-threads.mjs` | `test:contract:qa:threads` | треды / reply grouping |
| `contract-qa-domains.mjs` | `test:contract:qa:domains` | custom domains (Resend quota → skip) |
| `contract-qa-search.mjs` | `test:contract:qa:search` | поиск по сообщениям |
| `contract-qa-extract.mjs` | `test:contract:qa:extract` | structured extract |
| `contract-qa-console.mjs` | `test:contract:qa:console` | console summary API |
| `contract-qa-audit.mjs` | `test:contract:qa:audit` | audit log (async poll) |
| `contract-qa-console-inbox.mjs` | `test:contract:qa:console-inbox` | console inbox UI API |
| `contract-qa-team-keys.mjs` | `test:contract:qa:team-keys` | team keys CRUD |

Пример — только agent hub после правок в `src/routes/agent.ts`:

```bash
MAILAGENT_API_KEY=ma_… npm run test:contract:qa:agent
```

## CI (что гоняется автоматически)

| Workflow | Триггер | Тесты |
|----------|---------|-------|
| [deploy-worker.yml](../.github/workflows/deploy-worker.yml) | push `main` (Worker paths) | deploy → `test:prod` |
| [qa-smoke.yml](../.github/workflows/qa-smoke.yml) | PR / `qa/**` | `check` + `verify:codex` + `test:prod` |
| [publish-packages.yml](../.github/workflows/publish-packages.yml) | tag `v*` | npm publish (OIDC) |

Без `MAILAGENT_API_KEY` в GitHub Secrets deploy **упадёт** — так задумано.

## Алгоритм для агента после изменения кода

1. **Discovery** — `GET /v1/agent` (tools, docs, auth).
2. **Локальный тип** — `npm run check` (если трогал `src/`).
3. **Узкий contract** — скрипт из таблицы выше.
4. **Полный gate** — `npm run test:prod` перед merge / после deploy.
5. **Диагностика** — `npm run doctor:qa` (plan, outbound, oidc hints).

## Если тест упал

1. Прочитай stderr последнего contract-скрипта (имя в `--- contract-qa-….mjs ---`).
2. Повтори **один** скрипт локально с тем же ключом.
3. Для inbox-flow: `mailagent_diagnose_inbox` или `POST …/simulate` вручную через curl.
4. Для audit: событие асинхронное — contract уже делает poll; если flaky — увеличь задержку в скрипте.
5. Для domains: Resend quota — скрипт cleanup + skip; не считай это регрессией API.

```bash
npm run doctor:qa
curl -s -H "Authorization: Bearer $MAILAGENT_API_KEY" \
  https://api.webmailagent.com/v1/agent | jq .
```

## Добавление нового contract-теста

1. Скопируй шаблон `scripts/contract-qa.mjs`.
2. Используй `scripts/lib/contract-api.mjs` (`contractSimulate`, `contractApi`).
3. Добавь скрипт в `scripts/test-contract-all.mjs`.
4. Добавь npm script `test:contract:qa:<name>` в `package.json`.
5. Обнови эту таблицу и [AGENTS.md](../AGENTS.md).

**Не** используй `DATABASE_URL` или `simulate-inbound.mjs` в CI — только HTTP `simulate`.

## E2E (Playwright / Vitest)

Для продуктовых E2E с `@mailagent/qa` см. [QA.md](./QA.md) и `examples/playwright/`.  
Contract-тесты покрывают **API-контракт**; Playwright — UI внешних сервисов.

## Ссылки

- [AGENTS.md](../AGENTS.md) — MCP, verify flow
- [CI.md](./CI.md) — secrets, workflows
- [OPERATOR.md](./OPERATOR.md) — единственное ручное участие
- [examples/github-actions/contract-qa.yml](../examples/github-actions/contract-qa.yml) — шаблон для своего репо
- Публичная версия: [autotests.html](https://webmailagent.com/docs/autotests.html)
