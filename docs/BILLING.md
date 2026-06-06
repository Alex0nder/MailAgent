# Billing

## Without Stripe (current)

Stripe **not required**. Do not set `STRIPE_*` secrets — billing stays disabled.

**Option A — single hosted key (simplest):**

```bash
npm run issue:key
npx wrangler secret put API_KEY   # or API_KEYS
```

**Legacy** plan: 120 req/min, up to 500 active inboxes.

**Option B — key in Neon (free, for pilots with `team_id`):**

```bash
npm run issue:key:db -- pilot-name
```

**Free** plan: 60 req/min, 10 inboxes. Pro manually:

```bash
npm run team:plan -- TEAM_ID pro
```

`team_id` visible in `GET /v1/me` or `issue:key:db` output.

Dashboard and API work without Upgrade button.

---

## Stripe Pro (when available)

## Plans

| Plan | Rate limit | Active inboxes |
|------|------------|----------------|
| free | 60/min | 10 |
| pro | 300/min | 100 |
| legacy | 120/min | 500 (wrangler `API_KEY` only) |

## New key in DB

```bash
npm run issue:key:db -- acme-corp
```

Key stored in `teams` + `api_keys`. Do not duplicate in `API_KEYS`.

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

4. Client: `GET /v1/me` → `POST /v1/billing/checkout` → redirect to Stripe  
   Or UI: [dashboard.html](https://webmailagent.com/dashboard.html)
