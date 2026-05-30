# Настройка MailAgent (ручные шаги)

Worker уже поднимается локально (`npm run dev`). Для полного цикла нужны **3 сервиса**.

## 1. Neon Postgres (5 мин)

В Neon **Connect**: включите **Connection pooling**, скопируйте строку (кнопка **Copy snippet**), вставьте в `.dev.vars` как `DATABASE_URL=...`.  
Можно убрать `&channel_binding=require` — иногда мешает serverless-драйверу.  
Пароль: **Show password** → подставьте вместо `YOUR_PASSWORD` в `.dev.vars`.

1. [neon.tech](https://neon.tech) → New project
2. Скопируйте **connection string** → `DATABASE_URL`
3. Миграция:

```bash
DATABASE_URL="postgresql://..." npm run db:migrate
```

## 2. Resend (10 мин)

1. [resend.com](https://resend.com) → API Keys → `RESEND_API_KEY`
2. **Emails → Receiving** — домен вида `abc123.resend.app` → `INBOX_DOMAIN=abc123.resend.app`
3. **Webhooks** → `email.received` → URL:
   - локально: `https://<tunnel>/webhooks/resend` (cloudflared / ngrok)
   - прод: `https://mailagent.<subdomain>.workers.dev/webhooks/resend`
4. Signing secret → `RESEND_WEBHOOK_SECRET`

## 3. Локальные секреты

```bash
cp .dev.vars.example .dev.vars
cp .env.example .env
# заполните оба (API_KEY один и тот же)
```

В `.env` для MCP:

```
MAILAGENT_API_URL=http://127.0.0.1:8787
MAILAGENT_API_KEY=<тот же что API_KEY в .dev.vars>
```

Проверка:

```bash
node scripts/setup-check.mjs
npm run dev          # терминал 1
npm run verify       # терминал 2
```

## 4. Cloudflare Deploy (ручной login)

```bash
npx wrangler login
npx wrangler secret put DATABASE_URL
npx wrangler secret put RESEND_API_KEY
npx wrangler secret put RESEND_WEBHOOK_SECRET
npx wrangler secret put API_KEY
npx wrangler secret put INBOX_DOMAIN
npm run deploy
```

Обновите Resend webhook URL на прод Worker.  
`MAILAGENT_API_URL` в `.env` → URL после deploy.

## 6. API на api.webmailagent.com (опционально)

Лендинг: **webmailagent.com** (Netlify). API: **api.webmailagent.com** (Worker).

**Не делайте** CNAME `api` → `*.workers.dev` — будет **522**.

Правильно (один из способов):

**A) Через Dashboard (проще)**  
1. **Workers & Pages** → Worker `mailagent` → **Settings** → **Domains & Routes**  
2. **Add** → **Custom domain** → `api.webmailagent.com`  
3. Cloudflare сам создаст/обновит DNS-запись  
4. Удалите старый CNAME на `workers.dev`, если есть  

**B) Через CLI**  
```bash
npm run deploy
npx wrangler domains add api.webmailagent.com
```

После деплоя и проверки:

```bash
curl https://api.webmailagent.com/health
```

В `.env` / MCP:

```
MAILAGENT_API_URL=https://api.webmailagent.com
```

Если deploy падает из‑за `routes` в `wrangler.jsonc` — зона должна быть в том же Cloudflare-аккаунте, либо уберите блок `routes` и привяжите домен в Dashboard → Workers → Custom Domains.

## 5. Cursor MCP

После `npm run build:mcp` и заполненного `.env`:

**Settings → MCP** → `mailagent` → Refresh tools.
