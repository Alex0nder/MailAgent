# Product Core — MailAgent

## Purpose

Product Core описывает **как пользователь (QA, agent, integrator) проходит сценарии** через API и MCP: inbox, inbound email, OTP/links, wait/SSE/callback, simulate, custom domains, outbound, console, run sessions.

Загружай, когда спрашивают:

- «Как работает verify?» — `mailagent_verify_signup`, `POST /v1/inboxes/open`, `POST /v1/agent/verify`
- Flows: inbox, email, OTP, QA, agent (ASCII ниже)
- 10 scenarios, MCP 28 tools, service presets 25
- Callback, custom domain, outbound, console, `runId` sessions
- Troubleshooting: diagnose, simulate retry

Не загружай для plan limits / Stripe → `business-core`.  
Не загружай для schema/migrations → `data-model-core`.

---

## Entities

| Entity | Описание | Entry |
|--------|----------|-------|
| **Inbox** | Temp address, TTL, allowlist, label, callback | `POST /v1/inboxes`, `mailagent_create_inbox` |
| **Message** | Inbound: otp, links, provider_id | `GET …/messages` |
| **Verification** | `{ otp, primaryLink, links[] }` | `GET …/extract`, `mailagent_extract_verification` |
| **Wait** | Poll or SSE until message | `GET …/wait`, `GET …/events`, `mailagent_wait_for_message` |
| **Open** | Create + wait + extract | `POST /v1/inboxes/open` |
| **Simulate** | Inject without SMTP | `POST …/simulate`, `mailagent_simulate_message` |
| **Callback** | POST on message processed | `callbackUrl`, `GET …/callbacks` |
| **Service preset** | `service` → expectFrom + subject hint | `src/lib/service-presets.ts` |
| **MCP Tool** | 28 tools | sync block ниже |
| **Agent verify** | Signup + primaryAction | `POST /v1/agent/verify`, `mailagent_verify_signup` |
| **Run session** | State by `runId` | `GET/PATCH /v1/agent/runs/:runId/session` |
| **Custom domain** | `@mail.example.com` | `/v1/domains/*` |
| **Outbound** | Reply via Resend | `POST …/send`, `mailagent_send_message` |
| **Console** | Debug UI | `dashboard.html`, `/v1/console/*` |
| **Diagnose** | Timeout hints | `GET …/diagnose`, `mailagent_diagnose_inbox` |

---

## Decision history (table + narratives)

| Решение | Альтернатива | Почему |
|---------|--------------|--------|
| **`POST /v1/inboxes/open`** | Client create+wait loop | Меньше race в CI; один round-trip |
| **Extract at queue ingest** | Extract on read | OTP один раз; быстрый webhook ack |
| **SSE via Durable Object** | Long poll only | Push `/events`; `/wait` polls DO |
| **`service` presets** | Только `expectFrom` | Agents: `auth0` вместо массива доменов |
| **`mailagent_verify_signup`** | Raw extract | `agent.primaryAction` для LLM |
| **Simulate `sim_*`** | Real SMTP в CI | Contract tests без Resend |
| **Callback** | Poll only | Parallel CI; smee local |
| **Run session table** | State in inbox row | Multi-step patch без churn |
| **Console = debug** | Email client | Human fallback через `debugUiUrl` |
| **Outbound gated** | Open relay | Abuse prevention |

### Narrative: One-shot vs step-by-step

Playwright нужен **address до submit** → `POST /v1/inboxes` → fill form → wait. CI curl часто использует **`open`**. Agent skill: **create → form → verify(inboxId)** для browser.

### Narrative: messageIndex

Welcome email часто приходит раньше verify → `subjectContains` + `messageIndex`; presets дают default subject hints. Diagnose показывает subjects при timeout.

### Narrative: Simulate then retry

`mailagent_diagnose_inbox` → `mailagent_simulate_message` → retry — автономный agent path без human.

---

## Sources

| # | File | Content |
|---|------|---------|
| 1 | `docs/QA.md` | QA flows, Playwright |
| 2 | `docs/QA-CALLBACK.md` | Callback |
| 3 | `docs/QA-TROUBLESHOOTING.md` | Timeout, empty OTP |
| 4 | `docs/QA-PRESETS.md` | Service matrix |
| 5 | `AGENTS.md` | MCP, autotests |
| 6 | `skills/mailagent/SKILL.md` | Agent flow |
| 7 | `src/mcp/manifest.ts` | MCP schemas |
| 8 | `src/lib/service-presets.ts` | 25 presets |
| 9 | `src/routes/inboxes.ts`, `agent.ts` | Routes |
| 10 | `src/services/agent-verify.ts`, `extract.ts` | Verify, OTP |
| 11 | `README.md` | API table |

Sync markers (`<!-- sync:mcp-tools:start -->
28 tools (MCP server `0.8.2`):

- `mailagent_plan_next`
- `mailagent_suggest_preset`
- `mailagent_verify_signup`
- `mailagent_create_inbox`
- `mailagent_wait_and_extract`
- `mailagent_list_inboxes`
- `mailagent_wait_for_message`
- `mailagent_extract_verification`
- `mailagent_simulate_message`
- `mailagent_send_message`
- `mailagent_list_threads`
- `mailagent_add_domain`
- `mailagent_list_domains`
- `mailagent_verify_domain`
- `mailagent_extract_structured`
- `mailagent_search_messages`
- `mailagent_check_email`
- `mailagent_diagnose_inbox`
- `mailagent_get_inbox`
- `mailagent_delete_inbox`
- `mailagent_cleanup_inboxes`
- `mailagent_list_messages`
- `mailagent_get_raw_message`
- `mailagent_list_attachments`
- `mailagent_get_attachment`
- `mailagent_get_run_session`
- `mailagent_get_run_timeline`
- `mailagent_patch_run_session`
<!-- sync:mcp-tools:end -->

| Group | Tools | When |
|-------|-------|------|
| Verify | verify_signup, wait_and_extract, extract_verification, wait_for_message | Signup/login |
| Inbox | create, get, list, delete | Lifecycle |
| Messages | list, get_raw, search | Debug |
| QA | simulate, diagnose | CI, timeout |
| Domains | add, list, verify | Custom @ |
| Outbound | send, list_threads | Reply |
| Attachments | list, get | Files |
| Agent state | get/patch_run_session | Multi-step |
| Advanced | extract_structured | AI extract |

Source: `MCP_TOOL_NAMES` in `manifest.ts` → `GET /v1/agent`.

---

## Run sessions

**`runId`** — validated agent correlation id; inbox labels `agent-{runId}` for `GET /v1/agent/runs`.

| Method | Path |
|--------|------|
| GET | `/v1/agent/runs`, `/v1/agent/runs/:runId` |
| GET/PATCH | `/v1/agent/runs/:runId/session` |

MCP: `mailagent_get_run_session`, `mailagent_get_run_timeline`, `mailagent_patch_run_session`. Session scoped to team/key hint. `verify_signup` with `runId` writes completion state and timeline events.

```json
PATCH session { "state": { "inboxId": "…", "step": "awaiting_verify" },
                "step": { "name": "created_inbox" } }
```

---

## Console (dashboard)

**UI:** https://webmailagent.com/dashboard.html — static `public/`, Bearer key or OIDC.

| Endpoint | Returns |
|----------|---------|
| `GET /v1/console/summary` | Plan, usage |
| `GET /v1/console/threads` | Recent threads |
| `GET /v1/console/inboxes/:id` | Messages, verification preview |

**`debugUiUrl`** on diagnose/timeout → deep link for human operator. Not a replacement for programmatic verify.

---

## Outbound

`POST /v1/inboxes/:id/send` / `mailagent_send_message { inboxId, text, html?, replyToMessageId? }`.

Requires verified custom domain or `OUTBOUND_FROM` (`outbound-capabilities.ts`). **`mailagent_list_threads`** for conversation view. Reply/thread use case only — not bulk ESP.

---

## Custom domains

```
POST /v1/domains { domain }
    → DNS records (Resend)
    → POST …/verify (or mailagent_verify_domain)
    → POST /v1/inboxes { domainId, username }
    → user@mail.example.com
    → inbound → same queue pipeline
```

Enterprise option: `/webhooks/resend/team/:teamId` for dedicated inbound (business-core).

---

## Callback

```
POST /v1/inboxes { callbackUrl }
    → [inbound or simulate processed]
    → fireInboxCallback → POST JSON { inboxId, otp, primaryLink, … }
    → logged in callback_deliveries
    → GET …/callbacks for audit
```

| Poll `/wait` | Callback |
|--------------|----------|
| Simple E2E | Parallel / long flows |
| Playwright default | smee.io / staging hook |

Validation: `src/lib/callback-url.ts` (HTTPS, no internal IPs in prod). Contract: `test:contract:qa:callback`.

---

## Pairs with

| Core | Adds |
|------|------|
| `business-core` | Plans, personas, KPIs |
| `inbox-core` / `email-core` / `otp-core` | Deep dives |
| `serialization-core` | OpenAPI, verification schema |
| `auth-billing-core` | Scopes, OAuth MCP |
| `deployment-testing-core` | test:prod, doctor |

Router: `context-os/router/routing-map.json` · Eval: `eval/questions.json`.

<!-- sync:service-presets:start -->
Presets (25): `dribbble`, `github`, `gitlab`, `bitbucket`, `google`, `auth0`, `stripe`, `vercel`, `supabase`, `clerk`, `discord`, `openai`, `resend`, `firebase`, `figma`, `notion`, `linear`, `slack`, `shopify`, `atlassian`, `aws`, `microsoft`, `apple`, `twilio`, `posthog` — source: `src/lib/service-presets.ts`.
<!-- sync:service-presets:end -->
