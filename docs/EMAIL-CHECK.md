# Email check (self-contained)

**v0.79** · Inspired by [check-if-email-exists](https://github.com/reacherhq/check-if-email-exists) — **our own MIT implementation**, no npm/cargo dependency, no external backend.

Verify email quality **without sending mail** — for QA signup validation and `notifyEmail` preflight.

## What MailAgent checks (built-in)

| Check | How |
|-------|-----|
| Syntax | Local RFC-ish parse |
| Disposable (DEA) | Local domain blocklist |
| Role account | admin@, support@, … |
| MX records | DNS-over-HTTPS (Cloudflare DoH) |
| `isReachable` | Derived: invalid / risky / safe |

## What we do NOT check

**SMTP mailbox existence** (is this specific user@domain deliverable?) — Cloudflare Workers cannot open outbound port 25. That requires a separate SMTP probe service; we intentionally do not depend on one.

## API

```bash
curl -s -X POST https://api.webmailagent.com/v1/emails/check \
  -H "Authorization: Bearer $MAILAGENT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"email":"user@gmail.com"}'
```

Response `source` is always `"local"`.

## MCP

`mailagent_check_email` — `{ "email": "…" }`

## QA use cases

1. Signup form rejects `test@mailinator.com` → `isReachable: invalid`
2. Domain without MX → `invalid`
3. `notifyEmail` rejects disposable at inbox create

## Contract

```bash
npm run test:contract:qa:email-check
```

## vs check-if-email-exists (Reacher)

| Feature | Reacher (Rust) | MailAgent (Worker) |
|---------|----------------|-------------------|
| Syntax | ✅ | ✅ |
| Disposable | ✅ | ✅ (local list) |
| MX DNS | ✅ | ✅ (DoH) |
| SMTP deliverability | ✅ | ❌ (no port 25) |
| Dependency | Docker / AGPL service | **none** |

We took the **idea and response shape**, not the git repo as a runtime dependency.

## Related

- [DEV-EMAIL-RELAY.md](./DEV-EMAIL-RELAY.md) — `notifyEmail`
