# Enterprise readiness (foundation)

MailAgent v1 enterprise surface — what exists today vs backlog.

## Available now

| Capability | API / UI |
|------------|----------|
| Audit log | `GET /v1/audit` · console `recentAudit` |
| Retention | `AUDIT_RETENTION_DAYS` cron (default 90) |
| Team-scoped API keys | Dashboard · `POST /v1/team/keys` |
| Custom domains | `POST /v1/domains` · MCP · console |
| OIDC browser login | Auth0 · `auth.oidc: enabled` |
| Plan limits | `GET /v1/me` → `limits`, `usage` |

## Backlog

| Item | Notes |
|------|--------|
| SOC 2 Type II narrative | security whitepaper + control mapping |
| Dedicated domains | isolated Resend/infra per enterprise tenant |
| SLA / support tier | post-Stripe billing |
| Stripe on prod | on hold — see [YOUR-TURN.md](./YOUR-TURN.md) |

## Self-host TCO

Cloudflare Workers + Neon + Resend — no MailAgent hosting fee when self-hosted. See [INTEGRATE.md](./INTEGRATE.md).
