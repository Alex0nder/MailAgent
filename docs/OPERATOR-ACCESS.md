# Operator access policy (draft)

Single-operator SaaS today. Maps to SOC 2 **CC6** (logical access) before formal Type II audit.

Public summary: [security.html](https://webmailagent.com/docs/security.html) · [SOC2.md](./SOC2.md)

## Roles

| Role | Who | Access |
|------|-----|--------|
| Operator | Repo + Cloudflare + Resend + Auth0 owner | Prod secrets, deploy, billing setup |
| Customer admin | Team owner in dashboard | Team keys, domains, audit (scoped) |
| Agent / CI | API key or OAuth `mat_` | API/MCP per key scopes |

## Operator controls

- **Secrets:** only via `wrangler secret put` and GitHub Actions secrets — never in git or client bundles. Checklist: [OPERATOR.md](./OPERATOR.md).
- **Prod API key:** team-scoped keys for CI (`MAILAGENT_API_KEY`); rotate via dashboard or `issue:key:db`.
- **OIDC / Auth0:** Client Secret rotation → `npm run rotate:oidc`.
- **Dedicated Resend:** per-team AES-256-GCM in Worker; operator does not read tenant API keys in plaintext after save.
- **Audit:** operator actions on infrastructure are outside app audit log; use Cloudflare + GitHub audit where available.

## Onboarding / offboarding

| Event | Action |
|-------|--------|
| New operator | Grant GitHub admin, Cloudflare account, Resend; document in internal runbook only |
| Operator offboard | Rotate `API_KEY` / team keys, `RESEND_*`, `OIDC_*`, Stripe keys, revoke Cloudflare token |
| Compromised key | Revoke in dashboard → re-issue → update GitHub `MAILAGENT_API_KEY` if CI key |

## Gaps before Type II

- [ ] Named backup operator + break-glass procedure
- [ ] Quarterly access review (even if single operator)
- [ ] MFA enforced on GitHub, Cloudflare, Resend, Auth0 (operator responsibility)
- [ ] Penetration test report (third party)
