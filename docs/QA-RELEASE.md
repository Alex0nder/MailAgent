# QA release: `qa/v0.8` → `main`

Checklist before merge and after deploy (without billing/OIDC).

## 1. PR and CI

```bash
git push -u origin qa/v0.8
gh pr create --base main --head qa/v0.8 --title "QA v0.8–0.9+"
```

Workflow **QA Smoke** on PR: `check`, `build:qa`, optional `smoke:qa` + contract (needs secrets `MAILAGENT_API_KEY`, `DATABASE_URL`).

## 2. Merge → `main`

After merge **Deploy Worker** + `smoke:agent` + `smoke:qa` run (if `MAILAGENT_API_KEY` in secrets).

## 3. Neon migrations (prod)

If v0.7 attachments not applied yet:

```bash
# .dev.vars or env with prod DATABASE_URL
npm run db:migrate
```

Migration: `migrations/010_message_attachments.sql`.

## 4. Local check on prod API

```bash
export MAILAGENT_API_KEY=...
npm run smoke:qa
npm run smoke:agent
export DATABASE_URL=...   # prod Neon
npm run test:contract:qa
npm run test:contract:qa:callback
npm run doctor
```

After deploy `GET /v1/agent` should return **25** `mcpTools` (including `mailagent_get_run_timeline`).

## 5. npm publish (optional)

```bash
npm run publish:qa    # @mailagent/qa@0.1.9
npm run publish:agent # if agent SDK changed
```

## 6. Debug UI

https://webmailagent.com/debug.html?inbox=&lt;id&gt; (after deploy `public/debug.html`).
