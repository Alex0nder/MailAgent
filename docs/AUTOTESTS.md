# Autotests for agents

Guide for **Cursor / Codex / CI bots**: verify MailAgent on prod **without human involvement** (no real SMTP, no `DATABASE_URL`).

Operator connects secrets once → [OPERATOR.md](./OPERATOR.md).

## Quick start

```bash
npm ci

MAILAGENT_API_URL=https://api.webmailagent.com \
MAILAGENT_API_KEY=ma_… \
  npm run test:prod:gate   # CI after deploy (smoke only)

# Before merge or release:
  npm run test:prod        # full contracts + Playwright
```

CI after deploy runs **`test:prod:gate`** (smoke only — saves KV quota). Full suite: manual or tag `v*` publish workflow.

## Test layers

| Layer | Command | Where | API key |
|-------|---------|-------|---------|
| **Prod gate (CI)** | `npm run test:prod:gate` | deploy / PR | `MAILAGENT_API_KEY` |
| **Prod gate (full)** | `npm run test:prod` | pre-merge, tag `v*` | `MAILAGENT_API_KEY` |
| **Smoke agent** | `npm run smoke:agent` | MCP, OAuth, DCR, Streamable HTTP | yes |
| **Smoke QA** | `npm run smoke:qa` | inbox lifecycle on prod | yes |
| **Contract (all)** | `npm run test:contract:all` | 13 scripts via `simulate` | yes |
| **Playwright simulate** | `npm run test:pw:simulate` | CI gate, no DATABASE_URL | yes |
| **Typecheck** | `npm run check` | PR, no prod | no |
| **Codex scaffold** | `npm run verify:codex` | PR | no |
| **Unit (local)** | `npm run test:allowlist`, `test:extract`, … | dev, not prod | no |

Contract tests **do not send real mail**: messages are injected via `POST /v1/inboxes/:id/simulate`.

## Environment variables

| Variable | Required | Value |
|----------|----------|-------|
| `MAILAGENT_API_KEY` | yes | team key or legacy `API_KEY` |
| `MAILAGENT_API_URL` | no | default `https://api.webmailagent.com` |
| `API_KEY` | fallback | alias for `MAILAGENT_API_KEY` |
| `SMOKE_EXPECT_ATTACHMENTS` | smoke:agent | `"1"` in CI |

Local key can live in `.env` — loaded by `scripts/load-env.mjs`.

## Prod gate

**CI (`test:prod:gate`)** — `scripts/test-prod-gate.mjs`: `smoke:agent` → `smoke:qa`.

**Full (`test:prod`)** — `scripts/test-prod.mjs`:

Order:

1. `smoke:agent` — discovery, OAuth metadata, DCR, MCP session, tool call
2. `smoke:qa` — create → simulate → wait → extract → delete
3. `test:contract:all` — all contract-qa scripts
4. `test:pw:simulate` — Playwright simulate gate

Any failing step exits non-zero.

## Contract scripts (one at a time)

Run a **narrow** script after changes in a specific area:

| Script | npm script | Covers |
|--------|------------|--------|
| `contract-qa.mjs` | `test:contract:qa` | create → simulate OTP → wait → extract |
| `contract-qa-agent.mjs` | `test:contract:qa:agent` | `GET /v1/agent`, `/v1/me`, `/mcp/auth` |
| `contract-qa-callback.mjs` | `test:contract:qa:callback` | webhook callback after simulate |
| `contract-qa-attachments.mjs` | `test:contract:qa:attachments` | attachments + raw MIME |
| `contract-qa-threads.mjs` | `test:contract:qa:threads` | threads / reply grouping |
| `contract-qa-domains.mjs` | `test:contract:qa:domains` | custom domains (Resend quota → skip) |
| `contract-qa-search.mjs` | `test:contract:qa:search` | message search |
| `contract-qa-extract.mjs` | `test:contract:qa:extract` | structured extract |
| `contract-qa-console.mjs` | `test:contract:qa:console` | console summary API |
| `contract-qa-audit.mjs` | `test:contract:qa:audit` | audit log (async poll) |
| `contract-qa-console-inbox.mjs` | `test:contract:qa:console-inbox` | console inbox UI API |
| `contract-qa-team-keys.mjs` | `test:contract:qa:team-keys` | team keys CRUD |
| `contract-qa-session.mjs` | `test:contract:qa:session` | run session GET/PATCH |
| `contract-qa-oidc.mjs` | `test:contract:qa:oidc` | OIDC authorize redirect (skip if disabled) |

Example — agent hub only after edits to `src/routes/agent.ts`:

```bash
MAILAGENT_API_KEY=ma_… npm run test:contract:qa:agent
```

## CI (automatic runs)

| Workflow | Trigger | Tests |
|----------|---------|-------|
| [deploy-worker.yml](../.github/workflows/deploy-worker.yml) | push `main` (Worker paths) | deploy → `test:prod:gate` |
| [qa-smoke.yml](../.github/workflows/qa-smoke.yml) | PR / `qa/**` | `check` + `verify:codex` + `test:prod:gate` |
| [publish-packages.yml](../.github/workflows/publish-packages.yml) | tag `v*` | `test:prod` → npm publish |

Without `MAILAGENT_API_KEY` in GitHub Secrets, deploy **fails** — by design.

## Agent workflow after a code change

1. **Discovery** — `GET /v1/agent` (tools, docs, auth).
2. **Types** — `npm run check` (if you changed `src/`).
3. **Narrow contract** — script from the table above.
4. **Full gate** — `npm run test:prod` before merge / after deploy.
5. **Diagnostics** — `npm run doctor:qa` (plan, outbound, oidc hints).

## When a test fails

1. Read stderr of the last contract script (name in `--- contract-qa-….mjs ---`).
2. Re-run **one** script locally with the same key.
3. Inbox flow: `mailagent_diagnose_inbox` or `POST …/simulate` via curl.
4. Audit: event is async — contract already polls; if flaky, increase delay in the script.
5. Domains: Resend quota — script cleanup + skip; not an API regression.

```bash
npm run doctor:qa
curl -s -H "Authorization: Bearer $MAILAGENT_API_KEY" \
  https://api.webmailagent.com/v1/agent | jq .
```

## Adding a new contract test

1. Copy template `scripts/contract-qa.mjs`.
2. Use `scripts/lib/contract-api.mjs` (`contractSimulate`, `contractApi`).
3. Register in `scripts/test-contract-all.mjs`.
4. Add npm script `test:contract:qa:<name>` in `package.json`.
5. Update this table and [AGENTS.md](../AGENTS.md).

Do **not** use `DATABASE_URL` or `simulate-inbound.mjs` in CI — HTTP `simulate` only.

## E2E (Playwright / Vitest)

Product E2E with `@mailagent/qa`: [QA.md](./QA.md) and `examples/playwright/`.  
Contract tests cover the **API contract**; Playwright covers external app UI.

## Links

- [AGENTS.md](../AGENTS.md) — MCP, verify flow
- [CI.md](./CI.md) — secrets, workflows
- [OPERATOR.md](./OPERATOR.md) — human: secrets only
- [examples/github-actions/contract-qa.yml](../examples/github-actions/contract-qa.yml) — template for your repo
- Public docs: [autotests.html](https://webmailagent.com/docs/autotests.html)
