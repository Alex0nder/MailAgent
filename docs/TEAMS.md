# Teams & API keys

Команда = строка в `teams` + один или несколько ключей в `api_keys`. Stripe не нужен.

## Создать команду + первый ключ

```bash
npm run issue:key:db -- acme-qa
```

Сохраните ключ и `team_id` из вывода.

## Invite (ещё один ключ)

Любой **admin** ключ команды (без scope или full access):

```bash
curl -s -X POST "$MAILAGENT_API_URL/v1/team/keys" \
  -H "Authorization: Bearer $MAILAGENT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"label":"ci-bot"}' | jq .
```

### Scoped key (CI / agent)

```bash
curl -s -X POST "$MAILAGENT_API_URL/v1/team/keys" \
  -H "Authorization: Bearer $MAILAGENT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "label": "ci-nightly",
    "scope": { "labelPrefix": "ci-", "readOnly": false }
  }' | jq .
```

Сайт: [webmailagent.com/docs/scoped-keys.html](https://webmailagent.com/docs/scoped-keys.html) · репо: [SCOPED-API-KEYS.md](./SCOPED-API-KEYS.md)

Ответ содержит полный `key` **один раз** — передайте коллеге или CI secret.

## Список ключей

```bash
curl -s "$MAILAGENT_API_URL/v1/team" \
  -H "Authorization: Bearer $MAILAGENT_API_KEY" | jq .
```

## Отозвать ключ

```bash
curl -s -X DELETE "$MAILAGENT_API_URL/v1/team/keys/KEY_ID" \
  -H "Authorization: Bearer $MAILAGENT_API_KEY"
```

Нельзя удалить последний ключ команды.

## Лимиты (общие на команду)

| Plan | Ключей | Active inbox |
|------|--------|--------------|
| free | 5 | 10 |
| pro | 20 | 100 |

Pro без Stripe: `npm run team:plan -- TEAM_ID pro`

## Legacy (wrangler `API_KEY`)

Team API недоступен (`403 team_required`). Один ключ, лимит 500 inbox.

UI: [dashboard.html](https://webmailagent.com/dashboard.html)
