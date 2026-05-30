# Хостинг всего на Cloudflare (без Netlify)

Лендинг (`public/`), API и webhook — один Worker. Free tier обычно хватает для старта.

## Уже работает

- https://api.webmailagent.com — API + health
- https://mailagent.alex-young33rd.workers.dev/ — лендинг + API

После переноса DNS:

- https://webmailagent.com — лендинг
- https://www.webmailagent.com — редирект на apex

## Шаг 1 — Custom domains в Worker

**Workers & Pages** → **mailagent** → **Domains** → **+ Add domain**

| Subdomain | Домен |
|-----------|--------|
| *(пусто)* | `webmailagent.com` |
| `www` | `www.webmailagent.com` |

`api.webmailagent.com` уже должен быть в списке.

## Шаг 2 — Удалить DNS на Netlify

**Cloudflare** → **DNS** → **Records**, удалить:

- **A** `webmailagent.com` → `75.2.60.5` (Netlify)
- **CNAME** `www` → `alex0nder-mailagent.netlify.app`

Custom domain в Worker создаст новые записи сам (подожди 2–5 мин).

## Шаг 3 — Деплой

```bash
npm run deploy
```

## Шаг 4 — Проверка

```bash
curl -sI https://webmailagent.com | head -5
curl -sI http://webmailagent.com | grep -i location   # должен быть 301 → https
curl -s https://api.webmailagent.com/health
```

### HTTPS / «Подключение не защищено»

Сертификат Cloudflare для apex обычно появляется через несколько минут после Custom Domain.

Если Chrome пишет «не защищено», но в меню есть «Действительный сертификат» — вы на **http://**, не на **https://**.

1. **Cloudflare** → **SSL/TLS** → **Edge Certificates** → включить **Always Use HTTPS**
2. Worker уже редиректит `http` → `https` (см. `src/index.ts`)
3. Открывайте `https://webmailagent.com` или обновите закладку

## Netlify

Сайт в Netlify можно **отключить** или удалить custom domain — чтобы не путаться. Репозиторий и `netlify.toml` можно оставить как запасной вариант.

## Стоимость

| Компонент | Где | Free tier |
|-----------|-----|-----------|
| Worker + Assets | Cloudflare | ~100k req/день |
| Durable Objects, Queues | Cloudflare | лимиты есть |
| Postgres | Neon | отдельно |
| Inbound mail | Resend | отдельно |

## Доступ агента

MCP не управляет DNS. Деплой с машины:

```bash
npx wrangler whoami
npm run deploy
```
