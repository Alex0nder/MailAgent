# Product backlog — service development

Stripe **on hold** · QA pilot **on hold** (kit ready: [PILOT-ONBOARD.md](./PILOT-ONBOARD.md)).

Context OS **done** for agents on repo ([skills/mailagent/SKILL.md](../skills/mailagent/SKILL.md) § Context OS).

P0–P2 **done**. Next: **P3** (distribution) or human-blocked items below.

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

## P1 — platform & observability ✅

| # | Feature | Status |
|---|---------|--------|
| 6 | **Team event webhook** | ✅ `GET/PUT/DELETE /v1/team/webhooks` |
| 7 | **Delivery log in console** | ✅ callback log + refresh |
| 8 | **Usage dashboard** | ✅ rate-limit meter on dashboard |
| 9 | **Public status** | ✅ `/v1/status` + `status.html` |
| 10 | **Run explorer** | ✅ label filter + console/debug links |

**Done when:** team lead debugs a failed CI run without curl.

---

## P2 — differentiation vs AgentMail ✅

| # | Feature | Status |
|---|---------|--------|
| 11 | **Simulate scenario library** | ✅ `scenario` + `GET …/simulate/scenarios` |
| 12 | **Extract presets expansion** | ✅ `magic_link`, `invite` |
| 13 | **Python SDK** | ✅ `packages/mailagent-agent-py` |
| 14 | **Landing use-case pages** | ✅ `playwright-email-verification.html`, `mcp-signup-qa.html` |
| 15 | **Inbox TTL presets** | ✅ `resolveTtlMinutes(service)` |

---

## P3 — distribution & pilot polish

| # | Feature | Status |
|---|---------|--------|
| 16 | **PyPI publish pipeline** | ✅ `publish:agent-py` + CI step |
| 17 | **SEO / nav links** | ✅ footer + landing cross-links |
| 18 | **QA SDK `scenario`** | ✅ `@mailagent/qa` + pilot starter test |
| 19 | **Pilot starter ↔ monorepo** | ✅ CI installs local `@mailagent/qa` |
| 20 | **Run first external pilot** | ⏳ `wizard:qa-pilot:onboard` + `issue:pilot-key` |

**Done when:** `pip install mailagent-agent` works; pilot repo forks starter and passes CI.

---

## Explicitly not now

| Item | Reason |
|------|--------|
| Stripe live | on hold |
| SOC 2 / pentest | external vendor |
| Catalog PR merges | maintainer |
| Full Context OS in hosted runtime | repo/skill only |

---

## Suggested next sprint

1. P3 #20 — onboard first QA pilot (needs `DATABASE_URL` + staging URL)  
2. Publish tag `v*` — npm `@mailagent/qa@0.1.15` + PyPI `mailagent-agent@0.1.0`  
3. Team webhook docs page (when pilot asks for event delivery)

Track in [ROADMAP.md](./ROADMAP.md) § v0.74.
