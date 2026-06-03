# Публикация @mailagent/* на npm

## Пакеты

| Пакет | Версия | Назначение |
|-------|--------|------------|
| `@mailagent/mcp` | см. `mcp/package.json` | stdio MCP для Cursor |
| `@mailagent/qa` | см. `packages/mailagent-qa/package.json` | Playwright / Cypress QA SDK |
| `@mailagent/agent` | см. `packages/mailagent-agent/package.json` | REST + remote MCP SDK |

Проверка сборки:

```bash
npm run publish:check
```

## Локально

```bash
npm login
npm run publish:all
```

Нужен доступ к org **`@mailagent`** на npm.

## GitHub Actions

Workflow: [`.github/workflows/publish-packages.yml`](../.github/workflows/publish-packages.yml)

1. [npmjs.com](https://www.npmjs.com) → Access Tokens → **Automation** (или Granular: publish для `@mailagent/*`)
2. GitHub repo → Settings → Secrets → **`NPM_TOKEN`**
3. Запуск:
   - Actions → **Publish npm packages** → Run workflow
   - или git tag: `git tag v0.5.0 && git push origin v0.5.0`

## После publish

Обновите версии в README / docs, если менялись major/minor.
