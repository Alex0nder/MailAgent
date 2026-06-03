# Scoped API keys

Ограниченные ключи для CI, агентов и MCP-клиентов — без полного доступа к team.

**Сайт:** [webmailagent.com/docs/scoped-keys.html](https://webmailagent.com/docs/scoped-keys.html)

## Scope

| Поле | Описание |
|------|----------|
| `labelPrefix` | Inbox `label` должен начинаться с префикса (например `ci-`, `agent-run-`) |
| `readOnly` | Только чтение: GET/list/wait/extract; без create/delete/open |

Полный ключ: оба поля пустые/false (legacy и admin keys).

## Создать scoped key

### Team API

```bash
curl -sS -X POST https://api.webmailagent.com/v1/team/keys \
  -H "Authorization: Bearer $ADMIN_TEAM_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "label": "ci-bot",
    "scope": { "labelPrefix": "ci-", "readOnly": false }
  }'
```

### DCR (MCP client)

```bash
curl -sS -X POST https://api.webmailagent.com/v1/oauth/register \
  -H "Authorization: Bearer $ADMIN_TEAM_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "client_name": "cursor-ci",
    "scope": { "labelPrefix": "agent-", "readOnly": true }
  }'
```

### CLI

```bash
npm run issue:key:db -- ci-bot --label-prefix ci-
```

## Правила

- Scoped key **не может** создавать другие keys, DCR, billing checkout, revoke keys
- Sub-key prefix должен **расширять** parent prefix (`ci-e2e-` ← parent `ci-`)
- `GET /v1/me` → поле `scope`
- `mat_` OAuth tokens наследуют scope исходного API key
- OIDC login → full access (admin-level team)

## Ошибки

| Code | Причина |
|------|---------|
| `scope_read_only` | POST/DELETE/open |
| `label_required` | create без label при scoped prefix |
| `label_prefix_mismatch` | label не совпадает с prefix |
| `scope_admin_required` | team/DCR/billing с restricted key |
| `inbox_not_found` | inbox вне prefix (404) |

## QA пример

```bash
# CI key только для прогона nightly
export MAILAGENT_API_KEY=ma_ci_scoped...

curl -X POST .../v1/inboxes -d '{"label":"ci-nightly-42","service":"github"}'
curl -X DELETE ".../v1/inboxes?labelPrefix=ci-nightly-"
```

См. [QA-ONBOARDING.md](./QA-ONBOARDING.md).
