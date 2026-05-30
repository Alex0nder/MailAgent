# Подключить MailAgent в свой проект (без нашего hosted API)

Полная открытость = **свой Worker, свой Resend, свой API key**.  
Никакого `hello@webmailagent.com` и `api.webmailagent.com` не требуется.

Hosted API на [webmailagent.com](https://webmailagent.com) — только опция «не хочу поднимать инфру».

## Два пути

| | Self-host (рекомендуется) | Hosted API |
|--|---------------------------|------------|
| Кто владеет данными | Вы | Мы |
| Нужен ключ от нас | Нет | Да (`hello@`) |
| Нужны Neon + Resend + Cloudflare | Да | Нет |
| Подходит для продукта с NDA | Да | Зависит от договорённости |

---

## 1. Self-host за ~30 минут

Пошагово: **[SETUP.md](../SETUP.md)**.

Краткий чеклист:

```bash
git clone https://github.com/Alex0nder/MailAgent.git
cd MailAgent
npm install
cp .dev.vars.example .dev.vars   # DATABASE_URL, API_KEY, Resend…
npm run db:migrate
npm run dev                      # http://127.0.0.1:8787
npm run verify
npx wrangler login
npm run deploy                   # ваш *.workers.dev
```

После деплоя:

1. Resend webhook → `https://<ваш-worker>/webhooks/resend`
2. Сгенерируйте **свой** `API_KEY` (любая длинная случайная строка) → `wrangler secret put API_KEY`
3. В проекте агента: `MAILAGENT_API_URL=https://<ваш-worker>` и `MAILAGENT_API_KEY=<ваш ключ>`

---

## 2. Агент в Cursor (MCP) — в вашем репозитории

Скопируйте из MailAgent в **свой** проект (или добавьте submodule / npm workspace):

### 2.1 Сборка MCP

```bash
# в клоне MailAgent или как git submodule
npm run build:mcp
```

### 2.2 `.cursor/mcp.json` в корне вашего проекта

```json
{
  "mcpServers": {
    "mailagent": {
      "command": "node",
      "args": ["/absolute/path/to/MailAgent/mcp/dist/index.js"],
      "env": {
        "MAILAGENT_API_URL": "https://your-worker.workers.dev",
        "MAILAGENT_API_KEY": "your-secret-key"
      }
    }
  }
}
```

Или `envFile`: `.env` в вашем проекте (не коммитьте ключ в git).

### 2.3 Skill для агента (опционально)

Скопируйте [`.cursor/skills/mailagent-mcp/SKILL.md`](../.cursor/skills/mailagent-mcp/SKILL.md) →  
`your-project/.cursor/skills/mailagent-mcp/SKILL.md`

Агент будет знать, когда вызывать `mailagent_wait_and_extract`.

### 2.4 Проверка в Cursor

**Settings → MCP** → сервер `mailagent` зелёный → **Refresh tools**.

В Composer: «создай inbox для github signup и дождись OTP».

---

## 3. Любой агент / бэкенд (только REST)

Без MCP — любой стек с HTTP:

```bash
curl -X POST "$MAILAGENT_API_URL/v1/inboxes/open" \
  -H "Authorization: Bearer $MAILAGENT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"service":"github","timeoutSeconds":90,"deleteAfter":true}'
```

- Discovery: `GET /v1`
- Схема: `GET /v1/openapi.json`

Примеры для LangChain, custom agent loop, CI — тот же контракт.

---

## 4. Playwright / Cypress (QA)

Пакет в репозитории: `packages/mailagent-qa`.

```bash
npm run build:qa
# в репо тестов:
npm install file:../path/to/MailAgent/packages/mailagent-qa
```

```typescript
import { createMailAgentQa } from "@mailagent/qa";

const mail = createMailAgentQa(); // читает MAILAGENT_API_URL / MAILAGENT_API_KEY
```

Подробнее: [docs/QA.md](./QA.md).

---

## 5. Что не отдавать в git

| Секрет | Где |
|--------|-----|
| `API_KEY` | wrangler secret, `.dev.vars`, CI secrets |
| `DATABASE_URL` | wrangler secret |
| `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET` | wrangler secret |
| `MAILAGENT_API_KEY` в приложении агента | `.env`, CI |

В репозитории держите только `.env.example` без значений.

---

## 6. Свой домен для inbox

Не обязательно `*.resend.app`:

1. Resend → Receiving → добавьте поддомен `inbox.yourcompany.com`
2. MX по инструкции Resend
3. `INBOX_DOMAIN=inbox.yourcompany.com`

Письма для тестов: `anything@inbox.yourcompany.com`.

---

## 7. FAQ

**Нужен ли доступ к GitHub Alex0nder?**  
Нет. Клонируете публичный репо, форкните при желании.

**Можно ли форкнуть и переименовать?**  
Да, MIT license.

**Агент будет звонить на webmailagent.com?**  
Только если вы сами укажете наш URL. При self-host — только ваш Worker.

**Как добавить свой `service` preset?**  
`src/lib/service-presets.ts` → deploy. Или `expectFrom` в API без пресета.

---

## Ссылки

- [SETUP.md](../SETUP.md) — Neon, Resend, deploy  
- [README.md](../README.md) — API, MCP tools  
- [docs/QA.md](./QA.md) — E2E  
- [mcp/README.md](../mcp/README.md) — MCP отладка  
