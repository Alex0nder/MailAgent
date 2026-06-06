# Scoped API keys

Restricted keys for CI, agents, and MCP clients — without full team access.

**Site:** [webmailagent.com/docs/scoped-keys.html](https://webmailagent.com/docs/scoped-keys.html)

## Scope

| Field | Description |
|------|----------|
| `labelPrefix` | Inbox `label` must start with prefix (e.g. `ci-`, `agent-run-`) |
| `readOnly` | Read-only: GET/list/wait/extract; no create/delete/open |

Full key: both fields empty/false (legacy and admin keys).

## Create scoped key

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

## Rules

- Scoped key **cannot** create other keys, DCR, billing checkout, revoke keys
- Sub-key prefix must **extend** parent prefix (`ci-e2e-` ← parent `ci-`)
- `GET /v1/me` → `scope` field
- `mat_` OAuth tokens inherit scope of source API key
- OIDC login → full access (admin-level team)

## Errors

| Code | Cause |
|------|---------|
| `scope_read_only` | POST/DELETE/open |
| `label_required` | create without label when scoped prefix |
| `label_prefix_mismatch` | label does not match prefix |
| `scope_admin_required` | team/DCR/billing with restricted key |
| `inbox_not_found` | inbox outside prefix (404) |

## QA example

```bash
# CI key only for nightly run
export MAILAGENT_API_KEY=ma_ci_scoped...

curl -X POST .../v1/inboxes -d '{"label":"ci-nightly-42","service":"github"}'
curl -X DELETE ".../v1/inboxes?labelPrefix=ci-nightly-"
```

See [QA-ONBOARDING.md](./QA-ONBOARDING.md).
