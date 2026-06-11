# MailAgent

Temporary inboxes for **AI agents** and **QA/E2E**: webhook → queue → Neon, SSE, OTP/magic link.  
**Roadmap:** [docs/ROADMAP.md](./docs/ROADMAP.md)  
**Your own agent without our API:** [docs/INTEGRATE.md](./docs/INTEGRATE.md) — self-host, MCP, REST.  
**For QA:** [docs/QA.md](./docs/QA.md) — label, subjectContains, callback, Playwright.

**Landing + API** on one Cloudflare Worker (`public/` + `/v1`).  
Prod: [webmailagent.com](https://webmailagent.com) (after DNS) · API: [api.webmailagent.com](https://api.webmailagent.com).  
Moving from Netlify: **[docs/HOSTING-CLOUDFLARE.md](./docs/HOSTING-CLOUDFLARE.md)**.

## Stack

- Cloudflare Workers + Hono
- Cloudflare Queues (+ DLQ)
- Durable Objects (SSE `/events`)
- Neon Postgres
- Resend Inbound

Full setup with secrets: **[SETUP.md](./SETUP.md)** · check: `npm run setup:check`

## Quick start

### 1. Dependencies

```bash
npm install
```

### 2. Neon

Create a project on [neon.tech](https://neon.tech), copy connection string.

```bash
cp .env.example .env
# fill DATABASE_URL
npm run db:migrate
```

### 3. Resend

1. API key → `RESEND_API_KEY`
2. Dashboard → **Emails → Receiving** — copy domain (`xxxx.resend.app`) → `INBOX_DOMAIN`
3. **Webhooks** → event `email.received` → URL: `https://<worker>/webhooks/resend`
4. Signing secret → `RESEND_WEBHOOK_SECRET`

Locally: `npm run dev` + tunnel (cloudflared / ngrok) to wrangler port.

### 4. Worker secrets

```bash
npx wrangler secret put DATABASE_URL
npx wrangler secret put RESEND_API_KEY
npx wrangler secret put RESEND_WEBHOOK_SECRET
npx wrangler secret put API_KEY
npx wrangler secret put INBOX_DOMAIN
```

Local dev: create `.dev.vars` (same keys, see `.env.example`).

### 5. Deploy

```bash
npm run deploy
```

First deploy creates queues `mailagent-email` and `mailagent-email-dlq`.

## API

All `/v1/inboxes/*` require header:

```
Authorization: Bearer <API_KEY>
```

| Method | Path | Description |
|-------|------|----------|
| `GET` | `/v1` | Discovery: endpoints, presets, MCP tools |
| `GET` | `/v1/openapi.json` | OpenAPI 3.0 (agents) |
| `POST` | `/v1/inboxes/open` | **One-shot:** create → wait → extract → delete |
| `POST` | `/v1/inboxes` | Create inbox (`ttlMinutes`, `service`, `expectFrom`, `allowedSenders`) |
| `GET` | `/v1/inboxes/:id` | Status |
| `GET` | `/v1/inboxes/:id/messages` | Messages |
| `GET` | `/v1/inboxes/:id/extract` | OTP + links from latest message |
| `GET` | `/v1/inboxes/:id/events` | **SSE** — wait for new message |
| `GET` | `/v1/inboxes/:id/wait?timeout=60` | Poll fallback (every 500ms) |
| `GET` | `/v1/inboxes/:id/callbacks` | `callbackUrl` delivery log (QA) |
| `GET` | `/v1/inboxes/:id/notify-deliveries` | `notifyEmail` relay log (manual QA) |
| `POST` | `/v1/emails/check` | Email existence (syntax + Reacher SMTP) |
| `DELETE` | `/v1/inboxes/:id` | Delete |
| `GET` | `/v1/stats` | Inbox / message counters (24h) |
| `POST` | `/webhooks/resend` | Resend webhook (no API key) |
| `GET` | `/health` | DB ping |

### Example

```bash
# create inbox
curl -s -X POST https://mailagent.<subdomain>.workers.dev/v1/inboxes \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"ttlMinutes":15,"expectFrom":"noreply@auth0.com"}' | jq

# SSE (another terminal)
curl -N "https://.../v1/inboxes/<id>/events" \
  -H "Authorization: Bearer $API_KEY"

# send mail to address from response → SSE gets event: message
```

## Reliability

- Webhook responds right after `MAIL_QUEUE.send`
- Idempotency: `messages.provider_id` = Resend `email_id` (UNIQUE)
- Queue retry up to 5 times → DLQ
- Hourly cron: delete expired inboxes
- OTP/links extracted in queue processing, not in webhook

## Custom domain (prod)

In Resend: MX on subdomain `inbox.yourbrand.com`, `INBOX_DOMAIN=inbox.yourbrand.com`.

## MCP for Cursor

Official protocol [Model Context Protocol](https://modelcontextprotocol.io); SDK: [`@modelcontextprotocol/sdk`](https://www.npmjs.com/package/@modelcontextprotocol/sdk) (stdio).

### npm packages

After publish to npm (see [docs/PUBLISH.md](./docs/PUBLISH.md)):

```bash
npm install @mailagent/mcp      # stdio MCP for Cursor
npm install @mailagent/agent    # REST + remote MCP SDK
npm install @mailagent/qa       # Playwright / Cypress QA
```

Local build from repo:

```bash
npm run build:mcp
npm run build:qa
npm run build:agent
```

Remote MCP (prod): `https://api.webmailagent.com/mcp` — OAuth/DCR: [docs/MCP-OAUTH.md](./docs/MCP-OAUTH.md).

### Build MCP server (from repo)

Add to `.env` (see `.env.example`):

```
MAILAGENT_API_URL=https://mailagent.<your-subdomain>.workers.dev
MAILAGENT_API_KEY=<same API_KEY as Worker>
```

### Connect in Cursor

Project already has [`.cursor/mcp.json`](.cursor/mcp.json):

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

1. **Cursor Settings → MCP** — server `mailagent` should be green
2. Click **Refresh** on tools list
3. In Agent/Composer: "create inbox via mailagent" — agent will call tools

Globally for all projects: copy block to `~/.cursor/mcp.json` (absolute path to `mcp/dist/index.js`).

### Tools

| Tool | Purpose |
|------|------------|
| `mailagent_create_inbox` | Create inbox (`service` or `expectFrom`) |
| `mailagent_wait_and_extract` | **Recommended:** create → SSE wait → OTP → delete |
| `mailagent_wait_for_message` | Wait for first message (SSE, up to 120s) |
| `mailagent_extract_verification` | OTP + links from latest message |
| `mailagent_list_messages` | All messages |
| `mailagent_get_inbox` | Inbox status |
| `mailagent_delete_inbox` | Delete early |

Agent skill: [`.cursor/skills/mailagent-mcp/SKILL.md`](.cursor/skills/mailagent-mcp/SKILL.md)

### CLI (terminal / CI)

After `npm run build:mcp`:

```bash
# one step: inbox + wait OTP (service=dribbble)
MAILAGENT_API_URL=... MAILAGENT_API_KEY=... \
  node mcp/dist/cli.js open --service dribbble --json

# or step by step
node mcp/dist/cli.js inbox create --service dribbble
node mcp/dist/cli.js wait <inboxId> --json
```

`service` presets: `dribbble`, `github`, `google`, `auth0`, `stripe`, `vercel`, `supabase`, `clerk`, `discord`, `openai`, `resend`, `firebase`.

### One-shot (agent / CI)

```bash
curl -s -X POST https://mailagent.<worker>/v1/inboxes/open \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"service":"github","timeoutSeconds":90}' | jq
```

### MCP debugging

- Logs: Command Palette → **MCP: Show Logs**
- Do not use `console.log` in MCP — stderr only, otherwise JSON-RPC breaks
- Manual check: `cd mcp && MAILAGENT_API_KEY=... MAILAGENT_API_URL=... node dist/index.js`

## Security (allowlist)

When creating inbox pass expected sender — other mail **is not stored**:

```json
{ "expectFrom": "noreply@stripe.com" }
{ "expectFrom": ["noreply@auth0.com", "auth0.com"] }
{ "allowedSenders": "github.com" }
```

Empty `allowedSenders` = accept all (dev only).

## CI

- **Deploy:** `.github/workflows/deploy-worker.yml` — secrets `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`; optional `MAILAGENT_API_KEY` for smoke after deploy
- **npm publish:** `.github/workflows/publish-packages.yml` — secret `NPM_TOKEN`

Details: [docs/CI.md](./docs/CI.md) · [docs/PUBLISH.md](./docs/PUBLISH.md)

## Next

- ~~R2 for raw MIME~~ ✅ — [docs/RAW-MIME-R2.md](./docs/RAW-MIME-R2.md) · [site](https://webmailagent.com/docs/raw-mime.html)
- ~~Scoped API keys per tenant~~ ✅ — [docs/SCOPED-API-KEYS.md](./docs/SCOPED-API-KEYS.md) · [site](https://webmailagent.com/docs/scoped-keys.html)
- `api.webmailagent.com` → Worker — see [SETUP.md](./SETUP.md) §6
