# Dedicated domains (enterprise)

Enterprise teams use **their own Resend account** for custom domains and inbound mail — isolated from the shared MailAgent Resend quota.

Public: [dedicated-domains.html](https://webmailagent.com/docs/dedicated-domains.html) · [enterprise.html](https://webmailagent.com/docs/enterprise.html)

## When to use

- Enterprise plan (`teams.plan = enterprise`)
- Need isolated domain quota and webhook traffic
- Compliance: tenant-owned email infra

Free/pro teams continue using the shared Resend account (`RESEND_API_KEY` on the Worker).

## Setup (operator)

```bash
npm run team:plan -- TEAM_ID enterprise
```

## Setup (team admin API)

### 1. Configure dedicated Resend

```bash
curl -sS -X PUT "$MAILAGENT_API_URL/v1/team/dedicated-resend" \
  -H "Authorization: Bearer $MAILAGENT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "resendApiKey": "re_…",
    "webhookSecret": "whsec_…"
  }' | jq .
```

Response includes `webhookUrl` — register in the team's Resend dashboard:

`POST https://api.webmailagent.com/webhooks/resend/team/TEAM_ID`

Event: `email.received`

### 2. Add custom domain

Same as [custom-domain guide](https://webmailagent.com/docs/custom-domain.html) — domains are created in the **team's** Resend account.

```bash
curl -sS -X POST "$MAILAGENT_API_URL/v1/domains" \
  -H "Authorization: Bearer $MAILAGENT_API_KEY" \
  -d '{"name":"inbox.yourcompany.com"}' | jq .
```

Without step 1, enterprise teams get `403 dedicated_resend_required`.

### 3. Status

```bash
curl -sS "$MAILAGENT_API_URL/v1/team/dedicated-resend" \
  -H "Authorization: Bearer $MAILAGENT_API_KEY" | jq .
```

`GET /v1/me` → `capabilities.dedicatedResend` when on enterprise plan.

Console: [dashboard.html](https://webmailagent.com/dashboard.html) → **Dedicated Resend** section · [docs/dedicated-domains.html](https://webmailagent.com/docs/dedicated-domains.html)

## Security

- Resend API key and webhook secret stored **encrypted** in Postgres (AES-GCM, key derived from `MCP_OAUTH_JWT_SECRET` / `API_KEY`)
- Team admin key required (`scope_admin_required` for read-only scoped keys)
- Audit: `team.dedicated_resend.configured` / `team.dedicated_resend.cleared`

## Outbound send / reply

With dedicated Resend configured, `POST /v1/inboxes/:id/send` and `…/reply` use the **team's** Resend API key.

- **From:** `MailAgent <inbox@your-verified-domain.com>`
- Inbox must be on a **custom domain** (`domainId` at create) — shared `INBOX_DOMAIN` addresses return `403 dedicated_outbound_requires_custom_domain_inbox`
- `GET /v1/me` → `capabilities.outbound.dedicatedResend: true` when team Resend is configured

```bash
curl -sS -X POST "$MAILAGENT_API_URL/v1/inboxes" \
  -H "Authorization: Bearer $MAILAGENT_API_KEY" \
  -d '{"label":"outbound","domainId":"DOMAIN_ID","username":"qa"}' | jq .address

curl -sS -X POST "$MAILAGENT_API_URL/v1/inboxes/INBOX_ID/send" \
  -H "Authorization: Bearer $MAILAGENT_API_KEY" \
  -d '{"to":["user@example.com"],"subject":"Hello","text":"from dedicated Resend"}' | jq .
```

MCP: `mailagent_send_message` — same rules.

## Limits (enterprise plan)

| Limit | Value |
|-------|-------|
| Custom domains | 25 |
| Active inboxes | 500 |
| Team keys | 50 |
| Rate limit | 600/min |

See `src/lib/plans.ts`.
