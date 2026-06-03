# QA team onboarding

Как выдать отдельный API-ключ команде тестирования, не смешивая с agent/production ключами.

## 1. Создать team (один раз)

```bash
# из корня MailAgent, нужен DATABASE_URL
npm run db:migrate
npm run issue:key:db -- "QA Team" qa
```

Сохраните вывод: `teamId`, `apiKey` (показывается один раз).

## 2. План и лимиты

```bash
npm run team:plan -- TEAM_ID free   # 10 inbox
npm run team:plan -- TEAM_ID pro    # 100 inbox (без Stripe)
```

Проверка:

```bash
curl -sS "$MAILAGENT_API_URL/v1/me" \
  -H "Authorization: Bearer $QA_API_KEY" | jq .
```

## 3. Дополнительные ключи

Dashboard: [webmailagent.com/dashboard.html](https://webmailagent.com/dashboard.html)  
или API:

```bash
# список ключей (hint только, не полный ключ)
curl -sS "$MAILAGENT_API_URL/v1/team" \
  -H "Authorization: Bearer $ADMIN_API_KEY" | jq .

# новый ключ
curl -sS -X POST "$MAILAGENT_API_URL/v1/team/keys" \
  -H "Authorization: Bearer $ADMIN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name":"ci-github-actions"}' | jq .
```

## 4. CI secrets (репозиторий тестов)

| Secret | Пример |
|--------|--------|
| `MAILAGENT_API_URL` | `https://api.webmailagent.com` |
| `MAILAGENT_API_KEY` | `mak_...` из issue:key:db |
| `DATABASE_URL` | только для contract test в репо MailAgent |

Label convention: `ci-$GITHUB_RUN_ID` или `mail.runLabel("ci")`.

## 5. Изоляция от агентов

| Ключ | Label prefix | Назначение |
|------|--------------|------------|
| QA CI | `ci-*` | Playwright/Cypress nightly |
| Agent | `agent-{runId}` | Cursor / MCP flows |

Cleanup после job:

```bash
curl -X DELETE "$MAILAGENT_API_URL/v1/inboxes?labelPrefix=ci-$GITHUB_RUN_ID" \
  -H "Authorization: Bearer $MAILAGENT_API_KEY"
```

## 6. Smoke после деплоя

```bash
export MAILAGENT_API_URL=https://api.webmailagent.com
export MAILAGENT_API_KEY=mak_...
npm run smoke:prod
npm run smoke:qa
npm run smoke:agent
```

## 7. Документы для QA

- [QA.md](./QA.md) — основной гайд
- [QA-PRESETS.md](./QA-PRESETS.md) — `service` / `expectFrom`
- [QA-CALLBACK.md](./QA-CALLBACK.md) — webhooks
- [QA-ROADMAP.md](./QA-ROADMAP.md) — backlog

Вопросы: hello@webmailagent.com или GitHub Issues.
