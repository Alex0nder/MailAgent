# Product backlog — service development

Stripe **on hold** · QA pilot **on hold** (kit ready: [PILOT-ONBOARD.md](./PILOT-ONBOARD.md)).

Context OS **done** for agents on repo ([skills/mailagent/SKILL.md](../skills/mailagent/SKILL.md) § Context OS).

Pick the next sprint from **P0 → P2**. Re-prioritize when pilot feedback arrives.

---

## P0 — agent & QA experience (core loop) ✅

| # | Feature | Status |
|---|---------|--------|
| 1 | **Console search** | ✅ `console-inbox.html` → `GET …/search` |
| 2 | **Bulk inbox cleanup UI** | ✅ `dashboard.html` → `DELETE …?labelPrefix=` |
| 3 | **Diagnose deep-link** | ✅ `debugUiUrl` on verify timeout + console banner |
| 4 | **Top signup presets** | ✅ `gitlab`, `bitbucket` + recipes + contract |
| 5 | **`verify_signup` ergonomics** | ✅ `SERVICE_SUBJECT_HINTS` + auto default + MCP docs |

**Done when:** agent can verify GitLab signup E2E with zero custom allowlist research.

---

## P1 — platform & observability

| # | Feature | Why | Surface |
|---|---------|-----|---------|
| 6 | **Team event webhook** | `callbackUrl` is per-inbox; teams want one URL for all messages | `POST /v1/team/webhooks` (new) |
| 7 | **Delivery log in console** | `GET …/callbacks` exists; not visible in UI | `console-inbox.html` |
| 8 | **Usage dashboard** | `GET /v1/me` + console summary — surface rate-limit headroom | dashboard meters |
| 9 | **Public status** | Tenants ask “is MailAgent up?” | `GET /v1/status` or status.html |
| 10 | **Run explorer** | `GET /v1/agent/runs` — filter by label, link to inbox | dashboard page |

**Done when:** team lead debugs a failed CI run without curl.

---

## P2 — differentiation vs AgentMail

| # | Feature | Why | Surface |
|---|---------|-----|---------|
| 11 | **Simulate scenario library** | One-click OTP/magic-link/attachment fixtures | `POST …/simulate` presets + docs |
| 12 | **Extract presets expansion** | `invoice`/`receipt` exist; add `magic_link`, `invite` | extract presets + MCP |
| 13 | **Python SDK** (`@mailagent/agent` parity) | AgentMail ships Python; gap in positioning | new package |
| 14 | **Landing use-case pages** | SEO: “Playwright email verification”, “MCP signup QA” | `public/` |
| 15 | **Inbox TTL presets** | `ttlMinutes` per `service` default in preset | `service-presets.ts` |

---

## Explicitly not now

| Item | Reason |
|------|--------|
| Stripe live | on hold |
| SOC 2 / pentest | external vendor |
| Catalog PR merges | maintainer |
| Full Context OS in hosted runtime | repo/skill only |

---

## Suggested first sprint (1–2 weeks)

1. P0 #4 — presets (GitLab, Bitbucket, …) + contract test  
2. P0 #1 — console search (thin UI on existing API)  
3. P0 #3 — diagnose deep-link in MCP + docs  

Track in [ROADMAP.md](./ROADMAP.md) § v0.71.
