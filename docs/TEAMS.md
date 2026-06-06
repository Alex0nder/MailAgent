# Teams & API keys

Team = row in `teams` + one or more keys in `api_keys`. Stripe not required.

## Create team + first key

```bash
npm run issue:key:db -- acme-qa
```

Save the key and `team_id` from the output.

## Invite (another key)

Any team **admin** key (no scope or full access):

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

Site: [webmailagent.com/docs/scoped-keys.html](https://webmailagent.com/docs/scoped-keys.html) · repo: [SCOPED-API-KEYS.md](./SCOPED-API-KEYS.md)

Response includes full `key` **once** — pass to teammate or CI secret.

## List keys

```bash
curl -s "$MAILAGENT_API_URL/v1/team" \
  -H "Authorization: Bearer $MAILAGENT_API_KEY" | jq .
```

## Revoke key

```bash
curl -s -X DELETE "$MAILAGENT_API_URL/v1/team/keys/KEY_ID" \
  -H "Authorization: Bearer $MAILAGENT_API_KEY"
```

Cannot delete the last key of a team.

## Limits (shared per team)

| Plan | Keys | Active inbox |
|------|--------|--------------|
| free | 5 | 10 |
| pro | 20 | 100 |

Pro without Stripe: `npm run team:plan -- TEAM_ID pro`

## Legacy (wrangler `API_KEY`)

Team API unavailable (`403 team_required`). Single key, 500 inbox limit.

UI: [dashboard.html](https://webmailagent.com/dashboard.html)
