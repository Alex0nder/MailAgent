# Agent autonomy — verify prod without human OTP checks

Temporary inboxes for signup verification (OTP, magic links). Works in **Cursor**, **Codex**, and any MCP client.

**Operator (human):** one-time secrets only → [docs/OPERATOR.md](docs/OPERATOR.md)

## Autotests (verify prod without human)

Full guide: **[docs/AUTOTESTS.md](docs/AUTOTESTS.md)** · [autotests.html](https://webmailagent.com/docs/autotests.html)

```bash
MAILAGENT_API_URL=https://api.webmailagent.com \
MAILAGENT_API_KEY=ma_… \
  npm run test:prod
```

CI post-deploy: `test:prod:gate` (smoke only). Before merge: `test:prod` (full contracts + Playwright).

| After changing… | Run |
|-----------------|-----|
| `src/routes/agent.ts`, MCP hub | `npm run test:contract:qa:agent` |
| inbox / simulate / extract | `npm run test:contract:qa` |
| attachments / raw MIME | `npm run test:contract:qa:attachments` |
| team keys / dashboard | `npm run test:contract:qa:team-keys` |
| billing / Stripe routes | `npm run test:contract:qa:billing` |
| notifyEmail relay | `npm run test:contract:qa:notify` |
| email check (local + MX) | `npm run test:contract:qa:email-check` |
| `src/mcp/manifest.ts`, service presets, `context-os/` | `npm run sync:context-os` then `npm run check:context-os-router` |
| anything before merge | `npm run test:prod` (full; CI uses `test:prod:gate`) |

Contract tests use `POST …/simulate` — no real SMTP, no `DATABASE_URL`. On failure: `npm run doctor:qa`.

## Quick commands

```bash
npm run doctor              # local env check
npm run doctor:qa           # QA consumer: API key + diagnose smoke
npm run doctor:billing      # Stripe readiness (local + prod /v1/me)
npm run doctor:security     # trust docs, npm audit, secret scanning (CI: security-baseline.yml)
npm run check:catalog-prs   # awesome-codex #195 + awesome-agent-skills #659 status
npm run wizard:qa-pilot     # QA consumer: doctor:qa + smoke:qa + next steps
npm run wizard:qa-pilot:onboard  # operator: smoke + starter guard + pilot package
npm run issue:pilot-key -- <slug>  # scoped ci- key (DATABASE_URL)
npm run test:qa-pilot-starter  # guard examples/qa-pilot-starter
npm run test:qa-pilot-cypress-starter  # guard examples/qa-pilot-cypress-starter
npm run codex:install       # Codex MCP from .dev.vars
npm run smoke:qa            # prod API lifecycle
npm run smoke:agent         # MCP + OAuth smoke
npm run test:contract:all   # all contract-qa (simulate, no DATABASE_URL)
npm run verify:codex        # Codex plugin scaffold
npm run sync:context-os     # after manifest.ts / presets / route changes
npm run check:context-os-router  # keyword router F1 gate (CI)
```

## Discovery (start here)

```bash
curl -s -H "Authorization: Bearer $MAILAGENT_API_KEY" \
  https://api.webmailagent.com/v1/agent | jq .
```

Returns `mcpTools`, `auth.oidc`, `remoteMcp`, `docs`.

## MCP tools (38)

`mailagent_issue_access` · `mailagent_start_run` · `mailagent_report_run` · `mailagent_next_run` · `mailagent_plan_next` · `mailagent_workspace_summarize` · `mailagent_workspace_draft_reply` · `mailagent_workspace_suggest_reminders` · `mailagent_workspace_create_reminder` · `mailagent_workspace_list_reminders` · `mailagent_workspace_complete_reminder` · `mailagent_suggest_preset` · `mailagent_verify_signup` · `mailagent_create_inbox` · `mailagent_wait_for_message` · `mailagent_wait_and_extract` · `mailagent_extract_verification` · `mailagent_extract_structured` · `mailagent_list_messages` · `mailagent_get_raw_message` · `mailagent_list_attachments` · `mailagent_get_attachment` · `mailagent_check_email` · `mailagent_diagnose_inbox` · `mailagent_simulate_message` · `mailagent_send_message` · `mailagent_list_threads` · `mailagent_add_domain` · `mailagent_list_domains` · `mailagent_verify_domain` · `mailagent_search_messages` · `mailagent_list_inboxes` · `mailagent_get_inbox` · `mailagent_delete_inbox` · `mailagent_cleanup_inboxes` · `mailagent_get_run_session` · `mailagent_get_run_timeline` · `mailagent_patch_run_session`

Source of truth: `src/mcp/manifest.ts` → `GET /v1/agent`.

## Context OS (repo tasks)

Canonical context for **this codebase** (debug Worker, deploy, contribute) — not for using prod inboxes only.

**Do not** load the full repository (~4.6M chars). Route the question, then read matched cores only:

| Step | Action |
|------|--------|
| 1 | Match → cores via `context-os/router/routing-map.json` or `npm run check:context-os-router` |
| 2 | Read listed files under `context-os/` (+ `audit/project-map.md` for file navigation) |
| 3 | Open `src/` only for paths named in those cores |

Six primary cores: [context-os/CORE-DEFINITIONS.md](context-os/CORE-DEFINITIONS.md) · router: [context-os/router/question-router.md](context-os/router/question-router.md) · manifest: [context-os/manifest.json](context-os/manifest.json).

After changing MCP tools, presets, migrations, or routes: `npm run sync:context-os`. CI runs `check:context-os-router` (F1 ≥ 0.9). Eval: [context-os/eval/](context-os/eval/) · framework: [AI-Context-OS](https://github.com/Alex0nder/AI-Context-OS).

## Connect clients

| Client | Config |
|--------|--------|
| Cursor | `.cursor/mcp.json` → `node mcp/dist/index.js` |
| Codex | [docs/codex.html](https://webmailagent.com/docs/codex.html) |
| Remote | `POST https://api.webmailagent.com/mcp` + Bearer |

```bash
codex mcp add mailagent -- npx -y -p @mailagent/mcp@0.2.11 mailagent-mcp
```

## Agent Skills

```bash
npx skills add Alex0nder/MailAgent --skill mailagent
npm run sync:skills   # after editing skills/mailagent/SKILL.md
```

Guide: [docs/AGENT-SKILLS.md](docs/AGENT-SKILLS.md) · canonical: [skills/mailagent/SKILL.md](skills/mailagent/SKILL.md)

## Packages

| Package | Use |
|---------|-----|
| `@mailagent/mcp` | stdio MCP |
| `@mailagent/agent` | REST verify SDK (npm) |
| `@mailagent/qa` | Playwright / Cypress |
| `mailagent-agent` | Python verify SDK (PyPI) |

## Typical verify flow

1. Create inbox (`label`, `service` preset) — optional `notifyEmail` for manual QA relay to real inbox.
2. Fill signup form with `address` — **do not** run email check on this address.
3. Wait (`subjectContains`, optional `messageIndex`) via verify or wait tools.
4. Use `otp` or `primaryLink` from `agent.primaryAction`.
5. Delete inbox when done.

For autonomous multi-step runs: `mailagent_start_run` → execute `plan.nextTool` → `mailagent_report_run` after each browser/API step → `mailagent_next_run` to resume after errors or context loss.

On failure: `mailagent_diagnose_inbox` or `POST …/simulate` then retry.

## Email check (agents)

`POST /v1/emails/check` · MCP `mailagent_check_email` — syntax, disposable, MX (local, no external deps).

Use **only** to test app email validation (e.g. reject `@mailinator.com`). **Not** for signup verify path.

Guide: [docs/EMAIL-CHECK.md](docs/EMAIL-CHECK.md) · contract: `npm run test:contract:qa:email-check`

## Docs

- [docs/agents](https://webmailagent.com/docs/agents.html) · [docs/autotests](https://webmailagent.com/docs/autotests.html) · [docs/qa](https://webmailagent.com/docs/qa.html)
- [docs/AUTOTESTS.md](docs/AUTOTESTS.md) · [docs/OPERATOR.md](docs/OPERATOR.md) (human: secrets only)
- [docs/AGENT-SKILLS.md](docs/AGENT-SKILLS.md) · [docs/CODEX.md](docs/CODEX.md) · [docs/QA-RELEASE.md](docs/QA-RELEASE.md)
- Skill (canonical): [skills/mailagent/SKILL.md](skills/mailagent/SKILL.md)
