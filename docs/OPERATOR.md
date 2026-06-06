# Operator checklist (only manual step)

Goal: **connect secrets once**, then CI and agents run smoke + contract on prod by themselves.

## 1. GitHub Actions (required for autoverification)

Settings → Secrets and variables → Actions:

| Secret | Purpose |
|--------|---------|
| `CLOUDFLARE_API_TOKEN` | deploy Worker |
| `CLOUDFLARE_ACCOUNT_ID` | deploy Worker |
| **`MAILAGENT_API_KEY`** | **post-deploy smoke + contract (no DATABASE_URL)** |

Key: legacy `API_KEY` from wrangler **or** team key (`npm run issue:key:db -- ci-gate`).

Without `MAILAGENT_API_KEY`, deploy **fails** on contract — by design.

## 2. Cloudflare Worker (prod secrets)

```bash
npx wrangler secret put DATABASE_URL
npx wrangler secret put RESEND_API_KEY
npx wrangler secret put RESEND_WEBHOOK_SECRET
npx wrangler secret put API_KEY          # or API_KEYS
npx wrangler secret put INBOX_DOMAIN
```

Optional (when needed):

| Secret | When |
|--------|------|
| `OUTBOUND_FROM` | send/reply from console |
| `STRIPE_*` | billing |
| `OIDC_*` | browser login for MCP |

## 3. npm Trusted Publishing

Already configured for `@mailagent/*`. Release: `git tag v0.x.0 && git push origin v0.x.0`.

## 4. What runs without you

| Event | Automation |
|-------|------------|
| Push `main` | deploy → `smoke:agent` + `smoke:qa` + **all** `test:contract:qa:*` |
| PR / `qa/*` | `check` + `verify:codex` + smoke + contract |
| Tag `v*` | npm publish (OIDC) |

Same locally:

```bash
MAILAGENT_API_URL=https://api.webmailagent.com \
MAILAGENT_API_KEY=ma_… \
  npm run test:prod
```

## 5. What agents do (Cursor / Codex)

1. Read [AGENTS.md](../AGENTS.md), [AUTOTESTS.md](./AUTOTESTS.md), and `GET /v1/agent`
2. Run `npm run test:prod` (or narrow `test:contract:qa:*`) after changes
3. Connect MCP: `@mailagent/mcp` or remote `/mcp`
4. Verify flow: `mailagent_verify_signup` / `POST /v1/agent/verify`
5. On failure: `mailagent_diagnose_inbox`, `npm run doctor:qa`

You do not need to manually check OTP — only watch that CI is green.

## 6. If CI is red

1. Actions → failed run → **Contract QA** or **Smoke** step
2. Locally: `npm run test:prod` with the same key
3. `npm run doctor:qa` — plan, outbound, oidc
