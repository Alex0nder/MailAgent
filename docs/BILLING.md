# Billing

## Без Stripe (сейчас)

Stripe **не нужен**. Секреты `STRIPE_*` не задавайте — billing просто выключен.

**Вариант A — один hosted-ключ (проще всего):**

```bash
npm run issue:key
npx wrangler secret put API_KEY   # или API_KEYS
```

План **legacy**: 120 req/min, до 500 активных inbox.

**Вариант B — ключ в Neon (free, для пилотов с `team_id`):**

```bash
npm run issue:key:db -- pilot-name
```

План **free**: 60 req/min, 10 inbox. Pro вручную:

```bash
npm run team:plan -- TEAM_ID pro
```

`team_id` виден в `GET /v1/me` или в выводе `issue:key:db`.

Dashboard и API работают без кнопки Upgrade.

---

## Stripe Pro (когда появится)

## Планы

| Plan | Rate limit | Active inboxes |
|------|------------|----------------|
| free | 60/min | 10 |
| pro | 300/min | 100 |
| legacy | 120/min | 500 (wrangler `API_KEY` only) |

## Новый ключ в БД

```bash
npm run issue:key:db -- acme-corp
```

Ключ сохраняется в `teams` + `api_keys`. Не дублируйте его в `API_KEYS`.

## Stripe (hosted)

1. Stripe Dashboard → Product → Price (subscription) → copy `price_…`
2. Webhook endpoint: `https://api.webmailagent.com/webhooks/stripe`  
   Events: `checkout.session.completed`, `customer.subscription.deleted`
3. Secrets:

```bash
npx wrangler secret put STRIPE_SECRET_KEY
npx wrangler secret put STRIPE_WEBHOOK_SECRET
npx wrangler secret put STRIPE_PRICE_PRO
```

4. Клиент: `GET /v1/me` → `POST /v1/billing/checkout` → redirect to Stripe  
   Or UI: [dashboard.html](https://webmailagent.com/dashboard.html)
