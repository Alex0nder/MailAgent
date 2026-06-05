# CI / GitHub Actions

## Deploy Worker

Workflow: [`.github/workflows/deploy-worker.yml`](../.github/workflows/deploy-worker.yml)

Триггер: push в `main` (`src/`, `public/`, `wrangler.jsonc`, `package-lock.json`) или **Run workflow**.  
Изменения только `package.json` / `scripts/` / `docs/` **не** деплоят Worker.

### Secrets (Settings → Secrets and variables → Actions)

| Secret | Обязательно | Значение |
|--------|-------------|----------|
| `CLOUDFLARE_API_TOKEN` | да | API token с **Workers Scripts Edit** |
| `CLOUDFLARE_ACCOUNT_ID` | да | `42ae092824ce3429ee3f914b43603273` |
| `MAILAGENT_API_KEY` | нет | team/legacy key для post-deploy smoke + PR **QA Smoke** |
| `DATABASE_URL` | нет | prod Neon — только для `test:contract:qa` на PR (`qa-smoke.yml`) |

`account_id` также прописан в `wrangler.jsonc` — локальный deploy работает после `wrangler login` без env.

### Локально vs CI

```bash
npx wrangler login          # локально
npm run deploy

# CI — только push в main (с секретами)
```

После деплоя (ручно или CI):

```bash
MAILAGENT_API_URL=https://api.webmailagent.com npm run smoke:agent
```

### Deploy failed: `CLOUDFLARE_API_TOKEN` / npx exit 1

Типичная причина ([пример run](https://github.com/Alex0nder/MailAgent/actions/runs/27020682647)):

```
In a non-interactive environment, it's necessary to set a CLOUDFLARE_API_TOKEN
```

**Не связано с codex:install** — `verify:codex` проходит; падает `wrangler deploy`.

1. GitHub → **Settings → Secrets and variables → Actions**
2. Добавь `CLOUDFLARE_API_TOKEN` (Workers Scripts **Edit**)
3. Добавь `CLOUDFLARE_ACCOUNT_ID` = `42ae092824ce3429ee3f914b43603273`
4. **Actions → Deploy Worker → Re-run all jobs**

Локальный deploy без CI: `npm run deploy` (после `wrangler login`).

## Publish npm packages

Workflow: [`.github/workflows/publish-packages.yml`](../.github/workflows/publish-packages.yml)

Secret: **`NPM_TOKEN`** — Granular Access Token с **Bypass 2FA** и publish для `@mailagent/*` (см. [PUBLISH.md](./PUBLISH.md)).

См. [PUBLISH.md](./PUBLISH.md).
