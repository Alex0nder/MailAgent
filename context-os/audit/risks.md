# Risks — MailAgent

Классификация рисков на основе docs/PENTEST-PREP.md, architecture, operational docs.

## Technical risks

| ID | Risk | Impact | Mitigation in repo |
|----|------|--------|-------------------|
| T1 | Queue consumer failure → DLQ | Mail not stored | 5 retries, DLQ monitoring (manual) |
| T2 | Allowlist silent drop | Agent timeout, no error to sender | diagnose endpoint, docs/QA-TROUBLESHOOTING |
| T3 | Neon outage | Full API down | Health check; Neon SLA |
| T4 | Resend webhook misconfig | Zero inbound mail | SETUP checklist, verify events |
| T5 | DO SSE disconnect | Wait fails | Poll fallback `/wait` |
| T6 | Idempotency edge cases | Duplicate provider_id handled | UNIQUE constraint |
| T7 | R2 unavailable | No raw MIME | Extract from Resend body still works |
| T8 | Workers AI unavailable | No semantic search / AI extract | Keyword search fallback |
| T9 | Single Worker monolith | All features share fate | Cloudflare redundancy |
| T10 | Cron purge lag | Expired inboxes until hourly run | TTL + manual delete |

## Security risks

| ID | Risk | Impact | Mitigation |
|----|------|--------|------------|
| S1 | API key leak | Full tenant access | Scoped keys, labelPrefix, readOnly |
| S2 | Cross-team IDOR | Data leak | apiKeyHint/teamId filtering |
| S3 | Webhook signature bypass | Fake inbound mail | svix verify |
| S4 | callbackUrl SSRF | Internal network probe | HTTPS validation in parseCallbackUrl |
| S5 | Untrusted email content | Agent executes malicious link | Docs warn; primaryLink filtering |
| S6 | Dashboard localStorage key | XSS → key theft | security.html guidance |
| S7 | Rate limit bypass | Abuse | KV rate limit per plan |
| S8 | MCP session binding | Session hijack | validateMcpSession |
| S9 | Team dedicated Resend secrets in DB | Credential exposure | team-secrets encryption pattern |
| S10 | Empty allowlist in dev | Accept all senders | README warns dev only |

## Operational risks

| ID | Risk | Impact | Mitigation |
|----|------|--------|------------|
| O1 | Missing MAILAGENT_API_KEY in CI | Deploy blocked | By design (OPERATOR.md) |
| O2 | Secret in git | Compromise | .gitignore, doctor:security, secret scanning |
| O3 | Migration not run | Schema drift | db:migrate on deploy (optional CI) |
| O4 | wrangler account_id in repo | Low — not secret | Public in wrangler.jsonc |
| O5 | Contract tests hit prod | Prod data mutation | simulate + delete patterns |
| O6 | npm package drift | Client incompatibility | publish:check, version in manifest |

## Product / business risks

| ID | Risk | Impact |
|----|------|--------|
| B1 | Resend dependency | Vendor lock-in for inbound |
| B2 | Cloudflare-only deploy | No AWS/GCP path without fork |
| B3 | OTP extract heuristics | False negatives on unusual formats |
| B4 | 120s max wait | Slow mail providers timeout |
| B5 | Plan quota in CI | Parallel runs hit inbox_limit |

## Compliance

- SOC2 prep documented (docs/SOC2.md) — not certified in repo
- Pentest prep (docs/PENTEST-PREP.md) — draft scope
- SLA (docs/SLA.md) — product commitments

## Monitoring gaps

- No automated DLQ alert documented in repo
- No structured APM — rely on Cloudflare logs
- Cron purge only logs to console
