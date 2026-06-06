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

## Перед первым publish (обязательно)

### 1. Организация `@mailagent`

Scope `@mailagent` на npm **ещё не создан** (или у тебя нет прав).

1. [npmjs.com/org/create](https://www.npmjs.com/org/create)
2. Имя org: **`mailagent`** (будет `@mailagent/mcp`, …)
3. Free plan достаточно для public packages

### 2. Двухфакторная аутентификация (2FA)

npm **не публикует** без 2FA. Ошибка:

```
403 … Two-factor authentication or granular access token with bypass 2fa enabled is required
```

1. [npmjs.com/settings](https://www.npmjs.com/settings) → **Two-Factor Authentication**
2. Режим: **Authorization and publishing** (не только login)
3. Перелогинься:

```bash
npm logout
npm login
```

При `npm publish` CLI попросит **OTP-код** из приложения (Google Authenticator и т.п.).

### 3. Publish

```bash
npm run publish:all
```

Или по одному:

```bash
npm run publish:mcp
npm run publish:qa
npm run publish:agent
```

## GitHub Actions (OIDC Trusted Publishing)

Без `NPM_TOKEN` и без OTP при каждом релизе:

1. npm → каждый пакет → **Settings → Trusted Publisher**
2. GitHub Actions · org/user `Alex0nder` · repo `MailAgent` · workflow `publish-packages.yml`
3. Permissions: `npm publish`, `npm stage publish`
4. Push тег:

```bash
git tag v0.27.0 && git push origin v0.27.0
```

Workflow: `.github/workflows/publish-packages.yml` (`id-token: write`, `npm publish --provenance`).

### Ручной publish (fallback)

```bash
npm run publish:all
```

Нужны 2FA/passkey OTP или granular token с bypass 2FA.

## Частые ошибки

| Ошибка | Решение |
|--------|---------|
| `403 … Two-factor authentication` | Включить 2FA + `npm logout` / `npm login`, при publish ввести OTP |
| `403 … you do not have access` | Создать org `@mailagent`, ты должен быть owner |
| `402 … must pay` | Scope занят — другое имя org или связаться с владельцем scope |
| Версия уже существует | Поднять `version` в `package.json` и повторить |

## После publish

Проверка:

```bash
npm view @mailagent/mcp version
npm view @mailagent/qa version
npm view @mailagent/agent version
```

Обновите README / docs, если менялись major/minor.
