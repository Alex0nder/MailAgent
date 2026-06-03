# QA release: `qa/v0.8` → `main`

Чеклист перед merge и после deploy (без billing/OIDC).

## 1. PR и CI

```bash
git push -u origin qa/v0.8
gh pr create --base main --head qa/v0.8 --title "QA v0.8–0.9+"
```

Workflow **QA Smoke** на PR: `check`, `build:qa`, опционально `smoke:qa` + contract (нужны secrets `MAILAGENT_API_KEY`, `DATABASE_URL`).

## 2. Merge → `main`

После merge срабатывает **Deploy Worker** + `smoke:agent` + `smoke:qa` (если `MAILAGENT_API_KEY` в secrets).

## 3. Миграции Neon (prod)

Если ещё не применяли v0.7 attachments:

```bash
# .dev.vars или env с DATABASE_URL prod
npm run db:migrate
```

Миграция: `migrations/010_message_attachments.sql`.

## 4. Локальная проверка на prod API

```bash
export MAILAGENT_API_KEY=...
npm run smoke:qa
npm run smoke:agent
export DATABASE_URL=...   # prod Neon
npm run test:contract:qa
npm run test:contract:qa:callback
npm run doctor
```

После deploy `GET /v1/agent` должен отдавать **12** `mcpTools` (включая `mailagent_list_attachments`, `mailagent_get_attachment`).

## 5. npm publish (опционально)

```bash
npm run publish:qa    # @mailagent/qa@0.1.9
npm run publish:agent # если меняли agent SDK
```

## 6. Debug UI

https://webmailagent.com/debug.html?inbox=&lt;id&gt; (после deploy `public/debug.html`).
