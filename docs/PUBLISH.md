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

## GitHub Actions (без OTP каждый раз)

Granular Access Token с **Bypass 2FA** (только для CI):

1. [npmjs.com/settings/tokens](https://www.npmjs.com/settings) → **Generate New Token** → **Granular Access Token**
2. Permissions: **Read and write** для packages `@mailagent/*`
3. Organizations: `@mailagent`
4. Включить **Bypass two-factor authentication** (если доступно)
5. GitHub repo → Secrets → **`NPM_TOKEN`**
6. Actions → **Publish npm packages** → Run workflow

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
