# SOC 2 readiness (draft)

Control mapping for MailAgent hosted SaaS. **Not a certification** — engineering checklist for enterprise sales.

Public summary: [enterprise.html](https://webmailagent.com/docs/enterprise.html)

## CC6 — Logical access

| Control | MailAgent |
|---------|-----------|
| API authentication | Bearer API keys, scoped keys (`labelPrefix`, `readOnly`) |
| MCP OAuth | `client_credentials` JWT (`mat_`) + optional Auth0 OIDC |
| Team isolation | Team-scoped keys, domains, audit, inboxes |
| Secrets | Cloudflare Worker secrets, no keys in client bundles |

## CC7 — System operations

| Control | MailAgent |
|---------|-----------|
| Deploy gate | `test:prod:gate` on push; full `test:prod` on tag `v*` |
| Audit log | `GET /v1/audit`, retention cron (`AUDIT_RETENTION_DAYS`) |
| Rate limits | Per-key KV-sampled limits; plan tiers in `GET /v1/me` |

## CC8 — Change management

| Control | MailAgent |
|---------|-----------|
| Source | MIT repo, PR + CI |
| Migrations | `migrations/*.sql`, optional `db:migrate` on deploy |
| Versioning | npm `@mailagent/*`, API hub `version` |

## A1 — Availability (operational)

| Control | MailAgent |
|---------|-----------|
| Infra | Cloudflare Workers (multi-region edge) |
| Queue DLQ | `mailagent-email-dlq` |
| Self-host | Documented in [INTEGRATE.md](./INTEGRATE.md) |

## Gaps (before Type II)

- Formal penetration test report
- Employee access policy (operator-only secrets today)
- Dedicated tenant infra (dedicated domains backlog)
- Stripe billing + SLA (on hold)
