# MailAgent

Временные inbox для **AI-агентов** и **QA/E2E**: webhook → очередь → Neon, SSE, OTP/magic link.  
**Roadmap:** [docs/ROADMAP.md](./docs/ROADMAP.md)  
**Свой агент без нашего API:** [docs/INTEGRATE.md](./docs/INTEGRATE.md) — self-host, MCP, REST.  
**Тестировщикам:** [docs/QA.md](./docs/QA.md) — label, subjectContains, callback, Playwright.

**Лендинг + API** на одном Cloudflare Worker (`public/` + `/v1`).  
Прод: [webmailagent.com](https://webmailagent.com) (после DNS) · API: [api.webmailagent.com](https://api.webmailagent.com).  
Перенос с Netlify: **[docs/HOSTING-CLOUDFLARE.md](./docs/HOSTING-CLOUDFLARE.md)**.

## Стек

- Cloudflare Workers + Hono
- Cloudflare Queues (+ DLQ)
- Durable Objects (SSE `/events`)
- Neon Postgres
- Resend Inbound

Полная настройка с секретами: **[SETUP.md](./SETUP.md)** · проверка: `npm run setup:check`

## Быстрый старт

### 1. Зависимости

```bash
npm install
```

### 2. Neon

Создайте проект на [neon.tech](https://neon.tech), скопируйте connection string.

```bash
cp .env.example .env
# заполните DATABASE_URL
npm run db:migrate
```

### 3. Resend

1. API key → `RESEND_API_KEY`
2. Dashboard → **Emails → Receiving** — скопируйте домен (`xxxx.resend.app`) → `INBOX_DOMAIN`
3. **Webhooks** → событие `email.received` → URL: `https://<worker>/webhooks/resend`
4. Signing secret → `RESEND_WEBHOOK_SECRET`

Локально: `npm run dev` + туннель (cloudflared / ngrok) на порт wrangler.

### 4. Секреты Worker

```bash
npx wrangler secret put DATABASE_URL
npx wrangler secret put RESEND_API_KEY
npx wrangler secret put RESEND_WEBHOOK_SECRET
npx wrangler secret put API_KEY
npx wrangler secret put INBOX_DOMAIN
```

Локальная разработка: создайте `.dev.vars` (те же ключи, см. `.env.example`).

### 5. Деплой

```bash
npm run deploy
```

Первый деплой создаст очереди `mailagent-email` и `mailagent-email-dlq`.

## API

Все `/v1/inboxes/*` требуют заголовок:

```
Authorization: Bearer <API_KEY>
```

| Метод | Путь | Описание |
|-------|------|----------|
| `GET` | `/v1` | Discovery: endpoints, presets, MCP tools |
| `GET` | `/v1/openapi.json` | OpenAPI 3.0 (агенты) |
| `POST` | `/v1/inboxes/open` | **One-shot:** create → wait → extract → delete |
| `POST` | `/v1/inboxes` | Создать inbox (`ttlMinutes`, `service`, `expectFrom`, `allowedSenders`) |
| `GET` | `/v1/inboxes/:id` | Статус |
| `GET` | `/v1/inboxes/:id/messages` | Письма |
| `GET` | `/v1/inboxes/:id/extract` | OTP + ссылки из последнего письма |
| `GET` | `/v1/inboxes/:id/events` | **SSE** — ждать новое письмо |
| `GET` | `/v1/inboxes/:id/wait?timeout=60` | Poll fallback (каждые 500ms) |
| `DELETE` | `/v1/inboxes/:id` | Удалить |
| `GET` | `/v1/stats` | Счётчики inbox / messages (24h) |
| `POST` | `/webhooks/resend` | Webhook Resend (без API key) |
| `GET` | `/health` | DB ping |

### Пример

```bash
# создать ящик
curl -s -X POST https://mailagent.<subdomain>.workers.dev/v1/inboxes \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"ttlMinutes":15,"expectFrom":"noreply@auth0.com"}' | jq

# SSE (в другом терминале)
curl -N "https://.../v1/inboxes/<id>/events" \
  -H "Authorization: Bearer $API_KEY"

# отправьте письмо на address из ответа → в SSE придёт event: message
```

## Надёжность

- Webhook отвечает сразу после `MAIL_QUEUE.send`
- Идемпотентность: `messages.provider_id` = Resend `email_id` (UNIQUE)
- Retry очереди до 5 раз → DLQ
- Cron каждый час: удаление просроченных inbox
- OTP/ссылки извлекаются при обработке очереди, не в webhook

## Свой домен (прод)

В Resend: MX на поддомен `inbox.yourbrand.com`, `INBOX_DOMAIN=inbox.yourbrand.com`.

## MCP для Cursor

Официальный протокол [Model Context Protocol](https://modelcontextprotocol.io); SDK: [`@modelcontextprotocol/sdk`](https://www.npmjs.com/package/@modelcontextprotocol/sdk) (stdio).

### Сборка MCP-сервера

```bash
npm run build:mcp
npm run build:qa   # пакет @mailagent/qa для Playwright
```

В `.env` добавьте (см. `.env.example`):

```
MAILAGENT_API_URL=https://mailagent.<your-subdomain>.workers.dev
MAILAGENT_API_KEY=<тот же API_KEY что у Worker>
```

### Подключение в Cursor

Проект уже содержит [`.cursor/mcp.json`](.cursor/mcp.json):

```json
{
  "mcpServers": {
    "mailagent": {
      "command": "node",
      "args": ["mcp/dist/index.js"],
      "envFile": ".env"
    }
  }
}
```

1. **Cursor Settings → MCP** — сервер `mailagent` должен быть зелёным
2. Нажмите **Refresh** у списка tools
3. В Agent/Composer: «создай inbox через mailagent» — агент вызовет tools

Глобально для всех проектов: скопируйте блок в `~/.cursor/mcp.json` (абсолютный путь к `mcp/dist/index.js`).

### Tools

| Tool | Назначение |
|------|------------|
| `mailagent_create_inbox` | Создать ящик (`service` или `expectFrom`) |
| `mailagent_wait_and_extract` | **Рекомендуется:** create → SSE wait → OTP → delete |
| `mailagent_wait_for_message` | Ждать первое письмо (SSE, до 120s) |
| `mailagent_extract_verification` | OTP + ссылки из последнего письма |
| `mailagent_list_messages` | Все письма |
| `mailagent_get_inbox` | Статус ящика |
| `mailagent_delete_inbox` | Удалить досрочно |

Skill для агента: [`.cursor/skills/mailagent-mcp/SKILL.md`](.cursor/skills/mailagent-mcp/SKILL.md)

### CLI (терминал / CI)

После `npm run build:mcp
npm run build:qa   # пакет @mailagent/qa для Playwright`:

```bash
# один шаг: ящик + ждать OTP (service=dribbble)
MAILAGENT_API_URL=... MAILAGENT_API_KEY=... \
  node mcp/dist/cli.js open --service dribbble --json

# или по шагам
node mcp/dist/cli.js inbox create --service dribbble
node mcp/dist/cli.js wait <inboxId> --json
```

Пресеты `service`: `dribbble`, `github`, `google`, `auth0`, `stripe`, `vercel`, `supabase`, `clerk`, `discord`, `openai`, `resend`, `firebase`.

### One-shot (агент / CI)

```bash
curl -s -X POST https://mailagent.<worker>/v1/inboxes/open \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"service":"github","timeoutSeconds":90}' | jq
```

### Отладка MCP

- Логи: Command Palette → **MCP: Show Logs**
- Не используйте `console.log` в MCP — только `stderr`, иначе ломается JSON-RPC
- Проверка вручную: `cd mcp && MAILAGENT_API_KEY=... MAILAGENT_API_URL=... node dist/index.js`

## Безопасность (allowlist)

При создании inbox передайте ожидаемого отправителя — остальные письма **не сохраняются**:

```json
{ "expectFrom": "noreply@stripe.com" }
{ "expectFrom": ["noreply@auth0.com", "auth0.com"] }
{ "allowedSenders": "github.com" }
```

Пустой `allowedSenders` = принимать всех (только для dev).

## CI (Worker)

GitHub Actions: `.github/workflows/deploy-worker.yml` — секреты `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`.

## Дальше

- R2 для сырых MIME
- Scoped API keys per tenant
- `api.webmailagent.com` → Worker — см. [SETUP.md](./SETUP.md) §6
