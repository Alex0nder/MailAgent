# Your turn — manual prod setup (no Stripe)

What **you** enable once; CI and agents handle the rest after that.

**Stripe is on hold** — skip `STRIPE_*` until billing is a priority.

Run anytime:

```bash
export MAILAGENT_API_KEY="$(grep '^MAILAGENT_API_KEY=' .env | cut -d= -f2- | tr -d '"')"
npm run doctor:operator
```

---

## Already automated (nothing to do)

| Item | Status |
|------|--------|
| Deploy on push `main` | GitHub Actions |
| Prod gate `test:prod` | smoke + contract + Playwright |
| npm publish on tag `v*` | Trusted Publishing |
| MCP OAuth `mat_` JWT | no KV quota needed |
| Agent run session | verify + MCP + `GET /runs/:id` |
| Agent Skills (`skills/mailagent/`) | `npx skills add` · `npm run sync:skills` |

---

## 1. GitHub Secrets

Repo → **Settings → Secrets and variables → Actions**

| Secret | Required | Notes |
|--------|----------|--------|
| `CLOUDFLARE_API_TOKEN` | yes | Worker deploy |
| `CLOUDFLARE_ACCOUNT_ID` | yes | from `wrangler.jsonc` |
| `MAILAGENT_API_KEY` | yes | same key as local `.env` |
| `DATABASE_URL` | optional | auto `db:migrate` on deploy |

Verify: last [Deploy Worker](https://github.com/Alex0nder/MailAgent/actions/workflows/deploy-worker.yml) run is green.

---

## 2. Outbound (send / reply) ✅ prod

`OUTBOUND_FROM=MailAgent <noreply@webmailagent.com>` on Worker.

Check:

```bash
curl -sS https://api.webmailagent.com/v1/me \
  -H "Authorization: Bearer $MAILAGENT_API_KEY" | jq .capabilities.outbound
# verifiedFrom: true
```

Contract: `npm run test:contract:qa:outbound` (uses prod API)

Details: [outbound.html](https://webmailagent.com/docs/outbound.html)

---

## 3. OIDC (browser login for MCP) ✅

Auth0 tenant `webmailagent.us.auth0.com` · app **MailAgent MCP** · `auth.oidc: enabled`.

Rotate Client Secret if it was shared in chat → `npm run setup:oidc-prod`.

Guide: [MCP-OAUTH-IDP.md](./MCP-OAUTH-IDP.md)

---

## 4. Resend domain quota

If `contract-qa-domains` skips with **domain quota exhausted**:

1. Resend dashboard → delete stale test domains
2. Or upgrade Resend plan

Local check (uses `RESEND_API_KEY` from `.dev.vars`):

```bash
npm run doctor:operator
```

---

## 5. Codex Marketplace

**Repo marketplace (works today):**

```bash
codex plugin marketplace add Alex0nder/MailAgent
codex plugin install mailagent --source mailagent
```

Set `MAILAGENT_API_KEY` when prompted. Verify: `codex mcp list` → server `mailagent`.

**Tarball (manual share):**

```bash
npm run package:codex
# → dist/mailagent-codex-plugin-0.2.5.tar.gz
```

**Official Plugin Directory:** self-serve publish coming soon — see [CODEX.md](./CODEX.md).

Third-party catalogs: [CATALOG-SUBMIT.md](./CATALOG-SUBMIT.md) — PR [awesome-codex-plugins #195](https://github.com/hashgraph-online/awesome-codex-plugins/pull/195) pending.

---

## On hold

| Item | Why wait |
|------|----------|
| **Stripe** (`STRIPE_SECRET_KEY`, webhook, `STRIPE_PRICE_PRO`) | billing not needed yet |
| Workers Paid ($5/mo) | only if KV 1000 puts/day is hit again |

---

## Quick verify after any change

```bash
npm run doctor:operator
npm run test:prod
```
