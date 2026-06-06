# Operator checklist (единственное ручное участие)

Цель: **ты подключаешь секреты один раз**, дальше CI и агенты сами гоняют smoke + contract на prod.

## 1. GitHub Actions (обязательно для автопроверки)

Settings → Secrets and variables → Actions:

| Secret | Зачем |
|--------|--------|
| `CLOUDFLARE_API_TOKEN` | deploy Worker |
| `CLOUDFLARE_ACCOUNT_ID` | deploy Worker |
| **`MAILAGENT_API_KEY`** | **post-deploy smoke + contract (без DATABASE_URL)** |

Ключ: legacy `API_KEY` из wrangler **или** team key (`npm run issue:key:db -- ci-gate`).

Без `MAILAGENT_API_KEY` deploy **упадёт** на contract — так и задумано.

## 2. Cloudflare Worker (prod secrets)

```bash
npx wrangler secret put DATABASE_URL
npx wrangler secret put RESEND_API_KEY
npx wrangler secret put RESEND_WEBHOOK_SECRET
npx wrangler secret put API_KEY          # или API_KEYS
npx wrangler secret put INBOX_DOMAIN
```

Опционально (когда понадобится):

| Secret | Когда |
|--------|--------|
| `OUTBOUND_FROM` | send/reply из консоли |
| `STRIPE_*` | billing |
| `OIDC_*` | browser login для MCP |

## 3. npm Trusted Publishing

Уже настроено для `@mailagent/*`. Релиз: `git tag v0.x.0 && git push origin v0.x.0`.

## 4. Что происходит без тебя

| Событие | Автоматика |
|---------|------------|
| Push `main` | deploy → `smoke:agent` + `smoke:qa` + **все** `test:contract:qa:*` |
| PR / `qa/*` | `check` + `verify:codex` + smoke + contract |
| Tag `v*` | npm publish (OIDC) |

Локально то же самое:

```bash
MAILAGENT_API_URL=https://api.webmailagent.com \
MAILAGENT_API_KEY=ma_… \
  npm run test:prod
```

## 5. Что делают агенты (Cursor / Codex)

1. Читают [AGENTS.md](../AGENTS.md), [AUTOTESTS.md](./AUTOTESTS.md) и `GET /v1/agent`
2. Гоняют `npm run test:prod` (или узкий `test:contract:qa:*`) после изменений
3. Подключают MCP: `@mailagent/mcp` или remote `/mcp`
4. Verify flow: `mailagent_verify_signup` / `POST /v1/agent/verify`
5. При сбое: `mailagent_diagnose_inbox`, `npm run doctor:qa`

Тебе не нужно вручную проверять OTP — только следить, что CI зелёный.

## 6. Если CI красный

1. Actions → failed run → шаг **Contract QA** или **Smoke**
2. Локально: `npm run test:prod` с тем же ключом
3. `npm run doctor:qa` — plan, outbound, oidc
