# MailAgent setup (manual steps)

Worker already runs locally (`npm run dev`). Full cycle needs **3 services**.

## 1. Neon Postgres (5 min)

In Neon **Connect**: enable **Connection pooling**, copy string (**Copy snippet**), paste into `.dev.vars` as `DATABASE_URL=...`.  
You can remove `&channel_binding=require` — sometimes blocks serverless driver.  
Password: **Show password** → replace `YOUR_PASSWORD` in `.dev.vars`.

1. [neon.tech](https://neon.tech) → New project
2. Copy **connection string** → `DATABASE_URL`
3. Migrate:

```bash
DATABASE_URL="postgresql://..." npm run db:migrate
```

## 2. Resend (10 min)

1. [resend.com](https://resend.com) → API Keys → `RESEND_API_KEY`
2. **Emails → Receiving** — domain like `abc123.resend.app` → `INBOX_DOMAIN=abc123.resend.app`
3. **Webhooks** → `email.received` → URL:
   - local: `https://<tunnel>/webhooks/resend` (cloudflared / ngrok)
   - prod: `https://mailagent.<subdomain>.workers.dev/webhooks/resend`
4. Signing secret → `RESEND_WEBHOOK_SECRET`

## 3. Local secrets

```bash
cp .dev.vars.example .dev.vars
cp .env.example .env
# fill both (API_KEY is the same)
```

For MCP in `.env`:

```
MAILAGENT_API_URL=http://127.0.0.1:8787
MAILAGENT_API_KEY=<same as API_KEY in .dev.vars>
```

Check:

```bash
node scripts/setup-check.mjs
npm run dev          # terminal 1
npm run verify       # terminal 2
```

## 4. Cloudflare deploy (manual login)

```bash
npx wrangler login
npx wrangler secret put DATABASE_URL
npx wrangler secret put RESEND_API_KEY
npx wrangler secret put RESEND_WEBHOOK_SECRET
npx wrangler secret put API_KEY
npx wrangler secret put INBOX_DOMAIN
# Dashboard → R2 → enable, then:
npx wrangler r2 bucket create mailagent-raw-mime
npm run deploy
npm run db:migrate
```

R2 stores raw `.eml` (see [docs/RAW-MIME-R2.md](./docs/RAW-MIME-R2.md)). Binding `RAW_MIME` is already in `wrangler.jsonc`.

Update Resend webhook URL to prod Worker.  
`MAILAGENT_API_URL` in `.env` → URL after deploy.

## 6. API at api.webmailagent.com (optional)

Landing: **webmailagent.com** (Netlify). API: **api.webmailagent.com** (Worker).

**Do not** CNAME `api` → `*.workers.dev` — you get **522**.

Correct approach (one of):

**A) Via Dashboard (simpler)**  
1. **Workers & Pages** → Worker `mailagent` → **Settings** → **Domains & Routes**  
2. **Add** → **Custom domain** → `api.webmailagent.com`  
3. Cloudflare creates/updates DNS record  
4. Remove old CNAME to `workers.dev` if present  

**B) Via CLI**  
```bash
npm run deploy
npx wrangler domains add api.webmailagent.com
```

After deploy and check:

```bash
curl https://api.webmailagent.com/health
```

In `.env` / MCP:

```
MAILAGENT_API_URL=https://api.webmailagent.com
```

If deploy fails due to `routes` in `wrangler.jsonc` — zone must be in same Cloudflare account, or remove `routes` block and attach domain in Dashboard → Workers → Custom Domains.

## 5. Cursor MCP

After `npm run build:mcp` and filled `.env`:

**Settings → MCP** → `mailagent` → Refresh tools.
