# CI / GitHub Actions

## Deploy Worker

Workflow: [`.github/workflows/deploy-worker.yml`](../.github/workflows/deploy-worker.yml)

Trigger: push to `main` (`src/`, `public/`, `wrangler.jsonc`, `package-lock.json`) or **Run workflow**.  
Changes only in `package.json` / `scripts/` / `docs/` **do not** deploy the Worker.

### Secrets (Settings → Secrets and variables → Actions)

| Secret | Required | Value |
|--------|-------------|----------|
| `CLOUDFLARE_API_TOKEN` | yes | API token with **Workers Scripts Edit** |
| `CLOUDFLARE_ACCOUNT_ID` | yes | `42ae092824ce3429ee3f914b43603273` |
| `MAILAGENT_API_KEY` | **yes** (prod gate) | CI key for `npm run test:prod` after deploy and on PR |
| `DATABASE_URL` | no | not needed — contract uses `POST …/simulate` |

`account_id` is also set in `wrangler.jsonc` — local deploy works after `wrangler login` without env.

### Local vs CI

```bash
npx wrangler login          # local
npm run deploy

# CI — push to main only (with secrets)
```

After deploy, CI runs `npm run test:prod` automatically. Locally:

```bash
MAILAGENT_API_URL=https://api.webmailagent.com \
MAILAGENT_API_KEY=ma_… \
  npm run test:prod
```

Operator checklist: [OPERATOR.md](./OPERATOR.md).

Agent autotest instructions: [AUTOTESTS.md](./AUTOTESTS.md).

### Deploy failed: `CLOUDFLARE_API_TOKEN` / npx exit 1

Typical cause ([example run](https://github.com/Alex0nder/MailAgent/actions/runs/27020682647)):

```
In a non-interactive environment, it's necessary to set a CLOUDFLARE_API_TOKEN
```

**Unrelated to codex:install** — `verify:codex` passes; `wrangler deploy` fails.

1. GitHub → **Settings → Secrets and variables → Actions**
2. Add `CLOUDFLARE_API_TOKEN` (Workers Scripts **Edit**)
3. Add `CLOUDFLARE_ACCOUNT_ID` = `42ae092824ce3429ee3f914b43603273`
4. **Actions → Deploy Worker → Re-run all jobs**

Local deploy without CI: `npm run deploy` (after `wrangler login`).

## Publish npm packages

Workflow: [`.github/workflows/publish-packages.yml`](../.github/workflows/publish-packages.yml)

Secret: **Trusted Publishing (OIDC)** — no `NPM_TOKEN`. See [PUBLISH.md](./PUBLISH.md).

See [PUBLISH.md](./PUBLISH.md).
