# QA team onboarding

How to issue a separate API key for the QA team without mixing with agent/production keys.

## 1. Create team (once)

```bash
# from MailAgent root, requires DATABASE_URL
npm run db:migrate
npm run issue:key:db -- "QA Team" qa
```

Save output: `teamId`, `apiKey` (shown once).

## 2. Plan and limits

```bash
npm run team:plan -- TEAM_ID free   # 10 inbox
npm run team:plan -- TEAM_ID pro    # 100 inbox (without Stripe)
```

Check:

```bash
curl -sS "$MAILAGENT_API_URL/v1/me" \
  -H "Authorization: Bearer $QA_API_KEY" | jq .
```

## 3. Additional keys

Dashboard: [webmailagent.com/dashboard.html](https://webmailagent.com/dashboard.html)  
or API:

```bash
# list keys (hint only, not full key)
curl -sS "$MAILAGENT_API_URL/v1/team" \
  -H "Authorization: Bearer $ADMIN_API_KEY" | jq .

# new key
curl -sS -X POST "$MAILAGENT_API_URL/v1/team/keys" \
  -H "Authorization: Bearer $ADMIN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name":"ci-github-actions"}' | jq .
```

## 4. CI secrets (test repo)

| Secret | Example |
|--------|--------|
| `MAILAGENT_API_URL` | `https://api.webmailagent.com` |
| `MAILAGENT_API_KEY` | `mak_...` from issue:key:db |
| `DATABASE_URL` | only for contract test in MailAgent repo |

Label convention: `ci-$GITHUB_RUN_ID` or `mail.runLabel("ci")`.

## 5. Isolation from agents

| Key | Label prefix | Purpose |
|------|--------------|------------|
| QA CI | `ci-*` | Playwright/Cypress nightly |
| Agent | `agent-{runId}` | Cursor / MCP flows |

Cleanup after job:

```bash
curl -X DELETE "$MAILAGENT_API_URL/v1/inboxes?labelPrefix=ci-$GITHUB_RUN_ID" \
  -H "Authorization: Bearer $MAILAGENT_API_KEY"
```

## 6. Smoke after deploy

```bash
export MAILAGENT_API_URL=https://api.webmailagent.com
export MAILAGENT_API_KEY=mak_...
npm run smoke:prod
npm run smoke:qa
npm run smoke:agent
```

## 7. QA docs

- [QA.md](./QA.md) — main guide
- [QA-PRESETS.md](./QA-PRESETS.md) — `service` / `expectFrom`
- [QA-CALLBACK.md](./QA-CALLBACK.md) — webhooks
- [QA-ROADMAP.md](./QA-ROADMAP.md) — backlog

Questions: hello@webmailagent.com or GitHub Issues.
