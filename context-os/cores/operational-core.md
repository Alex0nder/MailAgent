# Operational Core — MailAgent

Операционное ядро Context OS: deploy overview, CI/CD картина, env/secrets summary, testing layers, monitoring, разделение operator vs agent, security ops. **Self-contained** для операционных вопросов; глубокие deploy/contract детали — в `subcores/deployment-testing-core.md`.

---

## Purpose

Operational Core отвечает на вопросы **как эксплуатировать MailAgent в dev и prod**:

- Как поднять локально и задеплоить на Cloudflare?
- Какие секреты где лежат (Worker, GitHub, `.dev.vars`)?
- Что запускает CI при push в `main` и почему deploy падает без `MAILAGENT_API_KEY`?
- Какой тест выбрать после изменения (overview, не полный каталог)?
- Как мониторить health, queues, DLQ?
- Что делает человек-оператор один раз vs что делает агент автономно?

**Когда загружать:**

| Вопрос | Секция |
|--------|--------|
| «Как задеплоить?» | Deploy |
| «Какие GitHub secrets?» | CI/CD, Environment variables |
| «Почему CI красный?» | CI/CD, Operator vs agent |
| «Какой npm test после правки X?» | Testing overview |
| «Как проверить prod жив?» | Monitoring |
| «Что оператор делает вручную?» | Operator vs agent |
| «Security checklist» | Security ops |

**Граница с другими ядрами:**

| Ядро | Фокус |
|------|-------|
| **operational-core** (этот файл) | Overview deploy/CI/env/test/monitoring/operator |
| **deployment-testing-core** | Deep: wrangler step-by-step, все contract scripts, workflow YAML детали |
| **technical-core** | Runtime architecture, Queue/DO/SSE, failure modes infra |
| **auth-billing-core** | Keys, OAuth, Stripe implementation |

Не дублировуй полную таблицу 17 contract-скриптов здесь — дай матрицу «после изменения → команда» и ссылку на deployment-testing-core.

---

## Entities

### Deploy artifacts

| Entity | Location | Role |
|--------|----------|------|
| Worker script | `src/index.ts` → wrangler deploy | API + static ASSETS |
| Wrangler config | `wrangler.jsonc` | Bindings, vars, queues, cron |
| Migrations | `migrations/*.sql` | Schema; `npm run db:migrate` |
| Static assets | `public/` | Landing, docs, dashboard |
| MCP package | `mcp/` | Published separately on tag |
| GitHub workflows | `.github/workflows/*.yml` | CI/CD automation |

### Environment tiers

| Tier | Storage | Examples |
|------|---------|----------|
| Worker secrets | Cloudflare (`wrangler secret put`) | `DATABASE_URL`, `RESEND_*`, `API_KEY` |
| Worker vars | Plain in `wrangler.jsonc` | `DEFAULT_TTL_MINUTES`, rate limit vars |
| Local dev | `.dev.vars` (gitignored) | Same keys as Worker secrets |
| MCP client | `.env` (gitignored) | `MAILAGENT_API_URL`, `MAILAGENT_API_KEY` |
| GitHub Actions | Repository secrets | `CLOUDFLARE_*`, `MAILAGENT_API_KEY`, optional `DATABASE_URL` |

### CI workflows (entity list)

| Workflow file | Trigger | Primary outcome |
|---------------|---------|-----------------|
| `deploy-worker.yml` | push `main` (path filter) | wrangler deploy → `test:prod:gate` |
| `qa-smoke.yml` | PR, `qa/*` branches | check + codex verify + smoke + contract |
| `test-prod-full.yml` | manual dispatch | full `test:prod` |
| `security-baseline.yml` | push/PR, weekly cron | `doctor:security` |
| `publish-packages.yml` | tag `v*` | npm Trusted Publishing (OIDC) |
| `hol-plugin-scanner.yml` | PR | Codex catalog score guard |

### Test layers (entity stack)

```
Layer 0: npm run check          — TypeScript/build
Layer 1: npm run doctor*        — env readiness probes
Layer 2: smoke:*                — prod API lifecycle (~few calls)
Layer 3: test:contract:qa:*     — HTTP simulate contracts (no DATABASE_URL)
Layer 4: test:prod:gate         — smoke:agent + smoke:qa (CI post-deploy)
Layer 5: test:prod              — gate + all contracts + Playwright
Layer 6: unit scripts           — extract, allowlist, search (local tsx)
```

Orchestrators:

- `scripts/test-prod-gate.mjs` — light gate
- `scripts/test-prod.mjs` — full gate
- `scripts/test-contract-all.mjs` — 17 contract scripts sequential

### Operator vs agent roles

| Actor | Responsibility | Docs |
|-------|----------------|------|
| **Operator (human)** | One-time secrets, GitHub Actions keys, Resend webhook URL, Stripe/OIDC when enabled | `docs/OPERATOR.md`, `docs/YOUR-TURN.md` |
| **Agent (Cursor/Codex/CI)** | Autonomous verify via prod API + MCP; no human OTP; no DATABASE_URL in CI | `AGENTS.md`, `docs/AUTOTESTS.md` |
| **Developer** | Local dev, migrations, pre-merge `test:prod` | `SETUP.md`, `docs/CI.md` |

### Monitoring touchpoints

| Signal | Endpoint / location |
|--------|---------------------|
| Liveness + DB | `GET /health` |
| Volume counters | `GET /v1/stats` (auth) |
| Worker logs | Cloudflare dashboard → Workers → mailagent |
| Queue depth / DLQ | Cloudflare Queues → `mailagent-email`, `mailagent-email-dlq` |
| Cron purge | Worker logs: `cron purge { … }` |
| CI status | GitHub Actions |
| Resend delivery | Resend dashboard events |
| Neon | Neon console connectivity |

---

## Decision history (table + narratives)

| Решение | Альтернатива | Почему |
|---------|--------------|--------|
| **Deploy fails без MAILAGENT_API_KEY** | Deploy always green | Без post-deploy smoke broken prod может уехать в main |
| **Light prod gate on deploy** | Full `test:prod` every push | Экономия KV writes + CI time; full — pre-merge / manual |
| **Contract tests без DATABASE_URL** | CI с Neon secret | Меньше риск утечки; simulate покрывает API contract |
| **Path-filtered deploy workflow** | Deploy on every push | Docs-only commits не должны катить Worker |
| **Custom domain api.webmailagent.com** | workers.dev CNAME | 522 на API; prod URL hardcoded в тестах |
| **Operator secrets one-time** | Agent asks human each run | AGENTS.md: автономия после setup |
| **npm Trusted Publishing OIDC** | NPM_TOKEN in CI | No long-lived npm secret in GitHub |
| **Optional DATABASE_URL in Actions** | Required migrate | Gate работает без DB; migrate только если secret задан |
| **Separate operational vs deployment-testing cores** | One mega doc | Router loads overview vs deep deploy on demand |
| **security-baseline weekly** | Only on PR | Drift detection for audit/npm |

### Narrative: Operator checklist — один раз

Человек выполняет `docs/OPERATOR.md`:

1. GitHub secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, **`MAILAGENT_API_KEY`**
2. Wrangler secrets на prod Worker
3. Resend webhook → `https://api.webmailagent.com/webhooks/resend`
4. Optional: Stripe, OIDC, `DATABASE_URL` для auto-migrate

После этого push в `main` → deploy → smoke без участия оператора. Агент в Cursor запускает `npm run test:prod` с тем же API key локально.

### Narrative: Почему MAILAGENT_API_KEY обязателен в CI

Шаг «Smoke prod gate» в `deploy-worker.yml` явно `exit 1` если ключ пустой. Это **намеренный guard**: оператор должен выдать scoped key (`npm run issue:pilot-key` или `issue:key:db -- ci-gate`). Legacy `API_KEY` из wrangler тоже подходит если положить в GitHub secret.

Без ключа deploy технически успешен, но prod мог сломаться — unacceptable.

### Narrative: Light vs full prod gate

**Light (`test:prod:gate`):** `smoke:agent` + `smoke:qa` (~15 API calls).

**Full (`test:prod`):** smoke + all 17 contracts + Playwright simulate.

Deploy workflow использует light чтобы не исчерпать rate limit KV на каждый commit. Full gate — перед merge, на release tag, или `test-prod-full.yml`.

Trade-off: редкие регрессии в не-smoke contracts могут пройти deploy — ловятся на PR qa-smoke или manual full.

### Narrative: Contract simulate-only

Все `contract-qa-*.mjs` создают письма через `POST /v1/inboxes/:id/simulate`. Не требуют:

- Real inbound Resend
- `DATABASE_URL`
- Cloudflare queue inspection

Оркестраторы **форсируют** `MAILAGENT_API_URL=https://api.webmailagent.com` — локальный `.env` с `:8787` игнорируется для prod contract runs.

### Narrative: Path-filtered deploy

`deploy-worker.yml` paths include `src/**`, `public/**`, `migrations/**`, `wrangler.jsonc`, lockfile, contract scripts, skills. **Exclude** pure docs edits from automatic prod deploy — reduces risk and CI cost.

### Narrative: npm publish on tag

Tag `v*` triggers `publish-packages.yml` with OIDC to npmjs.com. Requires full test before tag in team practice (`test:prod` with Playwright). PyPI optional via `PYPI_API_TOKEN`.

### Narrative: Agent autonomy principle

Из `AGENTS.md`: агент **не** просит человека проверить OTP. Flow: create inbox → wait/extract via MCP → delete. On failure: `mailagent_diagnose_inbox`, simulate retry, `doctor:qa`. Human only for secrets/incidents.

### Narrative: Local dev tunnel requirement

Resend webhooks must reach Worker. Local `npm run dev` on `:8787` needs cloudflared/ngrok URL registered in Resend. Without tunnel, inbound mail won't arrive — but simulate still works for API dev.

### Narrative: Auto migrate optional on deploy

If `DATABASE_URL` in GitHub secrets, deploy job runs `npm run db:migrate` **before** wrangler deploy. If absent, step skipped — gate still runs. Operator must run migrate manually when schema changes ship.

---

## Sources

| # | Path | Содержание |
|---|------|------------|
| 1 | [SETUP.md](../../SETUP.md) | Neon, Resend, secrets, first deploy |
| 2 | [docs/OPERATOR.md](../../docs/OPERATOR.md) | One-time operator checklist |
| 3 | [docs/YOUR-TURN.md](../../docs/YOUR-TURN.md) | Human setup steps |
| 4 | [docs/CI.md](../../docs/CI.md) | Workflows, secrets, failure modes |
| 5 | [docs/AUTOTESTS.md](../../docs/AUTOTESTS.md) | Test layers, contract table |
| 6 | [AGENTS.md](../../AGENTS.md) | Agent autonomy, test matrix |
| 7 | [wrangler.jsonc](../../wrangler.jsonc) | Bindings, vars |
| 8 | [package.json](../../package.json) | npm scripts |
| 9 | [.dev.vars.example](../../.dev.vars.example) | Local secret template |
| 10 | [.env.example](../../.env.example) | MCP client template |
| 11 | [.github/workflows/](../../.github/workflows/) | CI definitions |
| 12 | [docs/QA-RELEASE.md](../../docs/QA-RELEASE.md) | Release process |
| 13 | [docs/PUBLISH.md](../../docs/PUBLISH.md) | npm OIDC publish |
| 14 | [docs/PENTEST-PREP.md](../../docs/PENTEST-PREP.md) | Pentest scope |
| 15 | [docs/SOC2.md](../../docs/SOC2.md) | Compliance prep |
| 16 | `context-os/subcores/deployment-testing-core.md` | **Deep** deploy + full contract catalog |

---

## Deploy

### Local development

**Prerequisites:** Node.js 22+, Cloudflare account (`wrangler login` for deploy only), Neon project, Resend account.

```bash
npm install
cp .dev.vars.example .dev.vars    # Worker secrets
cp .env.example .env              # MCP client (MAILAGENT_API_*)
npm run db:migrate                # requires DATABASE_URL in .dev.vars
npm run dev                       # wrangler dev, default :8787
npm run verify                    # local smoke
```

**Tunnel for inbound mail (optional for simulate-only dev):**

```bash
# Example: cloudflared tunnel --url http://127.0.0.1:8787
# Register https://<tunnel-host>/webhooks/resend in Resend dashboard
```

**Setup validation:**

```bash
npm run setup:check               # node scripts/setup-check.mjs
npm run doctor                    # local env + DB probe
```

Full walkthrough: **SETUP.md** (Neon ~5 min, Resend ~10 min).

### Production deploy (manual)

```bash
npx wrangler login
npx wrangler secret put DATABASE_URL
npx wrangler secret put RESEND_API_KEY
npx wrangler secret put RESEND_WEBHOOK_SECRET
npx wrangler secret put API_KEY          # or API_KEYS comma-separated
npx wrangler secret put INBOX_DOMAIN
npx wrangler r2 bucket create mailagent-raw-mime   # first time only
npm run deploy                      # wrangler deploy
npm run db:migrate                  # if not auto via CI
```

**Post-deploy:**

1. Resend webhook URL → `https://api.webmailagent.com/webhooks/resend`
2. Verify `curl https://api.webmailagent.com/health`
3. Run prod gate locally:

```bash
MAILAGENT_API_URL=https://api.webmailagent.com \
MAILAGENT_API_KEY=ma_… \
  npm run test:prod:gate
```

**Custom API domain:** Workers **Custom Domain** `api.webmailagent.com` — **не** CNAME на `*.workers.dev` (522 timeout).

Marketing static may also deploy via Netlify (see workflow comment); Worker `ASSETS` still serves docs paths from repo.

### Automated deploy (CI)

**Trigger:** push to `main` changing paths in `deploy-worker.yml` filter (`src/`, `public/`, `migrations/`, `wrangler.jsonc`, lockfile, contract scripts, skills, etc.).

**Steps (summary):**

1. `npm ci`
2. `npm run check`
3. `npm run verify:codex`
4. Optional `npm run db:migrate` if `DATABASE_URL` secret set
5. `cloudflare/wrangler-action@v3` deploy
6. **`npm run test:prod:gate`** with `MAILAGENT_API_KEY` — fails deploy job if red

**Manual dispatch:** `workflow_dispatch` on Deploy Worker workflow.

Deep step-by-step: **deployment-testing-core.md** § Production deploy.

---

## CI/CD overview

### Workflow matrix

| Workflow | When | Key commands | Blocks merge? |
|----------|------|--------------|---------------|
| `qa-smoke.yml` | PR, push `qa/*` | check, verify:codex, smoke, contract subset | Yes (PR) |
| `deploy-worker.yml` | push `main` (filtered) | deploy, test:prod:gate | N/A (post-merge) |
| `test-prod-full.yml` | manual | test:prod | Advisory |
| `security-baseline.yml` | push/PR + weekly | doctor:security | Yes on high audit |
| `publish-packages.yml` | tag `v*` | build packages, npm publish OIDC | Release |
| `hol-plugin-scanner.yml` | PR | catalog score | PR guard |

Node version in CI: **22** (match locally).

### GitHub Actions secrets

| Secret | Required | Purpose |
|--------|----------|---------|
| `CLOUDFLARE_API_TOKEN` | deploy | Workers Scripts Edit permission |
| `CLOUDFLARE_ACCOUNT_ID` | deploy | `42ae092824ce3429ee3f914b43603273` |
| **`MAILAGENT_API_KEY`** | **deploy gate** | Post-deploy smoke + contracts in CI |
| `DATABASE_URL` | optional | Auto migrate on deploy; local `issue:pilot-key` |
| `PYPI_API_TOKEN` | optional | PyPI on tag; skipped if unset |

### Typical CI failures

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `Missing MAILAGENT_API_KEY` | Secret not set | OPERATOR.md §1 |
| `Missing CLOUDFLARE_API_TOKEN` | Secret not set | docs/CI.md |
| Contract 401 | Invalid/expired CI key | Re-issue scoped key |
| Contract 429 | Rate limit / too many inboxes | Cleanup; wait; check plan |
| Smoke timeout | Prod outage or bad deploy | Check /health, CF logs |
| check failed | TS error | `npm run check` locally |
| verify:codex failed | Skill/manifest drift | `npm run sync:skills` |

Full troubleshooting: **docs/CI.md**.

### PR vs main pipeline

**Pull request:** `qa-smoke.yml` runs checks + smoke + contracts against prod API (same simulate pattern). Developer should run `npm run test:prod` locally before merge for full coverage.

**Main branch:** auto deploy + light gate. Does not replace full test before risky changes.

---

## Environment variables summary

### Required Worker secrets

| Variable | Source | Notes |
|----------|--------|-------|
| `DATABASE_URL` | Neon dashboard | Pooled connection string |
| `RESEND_API_KEY` | Resend | Platform API key |
| `RESEND_WEBHOOK_SECRET` | Resend webhook config | Svix signing |
| `API_KEY` or `API_KEYS` | Generated | Legacy single or comma pilot keys |
| `INBOX_DOMAIN` | Resend receiving domain | MX must point to Resend |

Set via:

```bash
npx wrangler secret put VARIABLE_NAME
```

Local mirror in `.dev.vars` (never commit).

### Plain Worker vars (`wrangler.jsonc`)

| Variable | Default | Purpose |
|----------|---------|---------|
| `DEFAULT_TTL_MINUTES` | `30` | Inbox auto-expiry |
| `RATE_LIMIT_PER_MINUTE` | `120` | Per-key rate limit |
| `RATE_LIMIT_KV_WRITE_EVERY` | `10` | KV write sampling |
| `AUDIT_RETENTION_DAYS` | `90` | Audit log purge |

### Optional Worker secrets

| Variable | When needed |
|----------|-------------|
| `OUTBOUND_FROM` | Send/reply from console or API |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_PRO` | Billing enabled |
| `OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`, `OIDC_AUDIENCE` | MCP browser OAuth |
| `MCP_OAUTH_TOKEN_TTL_SEC`, `MCP_OAUTH_JWT_SECRET` | OAuth token tuning |
| `RAW_MIME_MAX_BYTES`, `RAW_MIME_AGENT_MAX_BYTES`, `ATTACHMENT_MAX_STORE_BYTES` | R2 size policy |
| `SEARCH_EMBED_MODEL`, `EXTRACT_MODEL` | Workers AI model overrides |

Full typed list: `src/env.ts`.

### Client / test env (`.env`)

```
MAILAGENT_API_URL=https://api.webmailagent.com
MAILAGENT_API_KEY=ma_…
```

Used by MCP stdio, contract scripts, smoke scripts. Prod orchestrators override URL to api.webmailagent.com.

### Team API keys (DB)

Not env vars — issued via:

```bash
npm run issue:key:db -- <slug>
```

Stored hashed in `api_keys` table with optional scopes (`labelPrefix`, `readOnly`). Prefer scoped CI keys over sharing root `API_KEY`.

---

## Secrets management

### Three tiers

1. **Cloudflare Worker secrets** — production runtime only; `wrangler secret put`.
2. **Local files** — `.dev.vars` (Worker dev), `.env` (MCP client); gitignored.
3. **GitHub Actions** — deploy + CI verification keys.

### Rules

- Never commit secrets; `.dev.vars.example` / `.env.example` show shape only.
- Rotate `RESEND_WEBHOOK_SECRET` and Resend dashboard together.
- CI key should be scoped (`ci-` prefix label) with minimal permissions.
- Operator human tasks: **docs/OPERATOR.md** only — agents should not ask for OTP/secrets repeatedly.

### Issuing keys

| Command | Use |
|---------|-----|
| `npm run issue:pilot-key -- <slug>` | Scoped `ci-` key (needs DATABASE_URL locally) |
| `npm run issue:key:db -- <slug>` | Team key in DB |

### Stripe / OIDC

Optional phases — wizard scripts:

```bash
npm run doctor:billing
npm run doctor:oidc
npm run wizard:stripe          # when enabling billing
```

---

## Testing overview

Полный каталог contract-скриптов и порядок `test-contract-all.mjs` — **deployment-testing-core.md**. Здесь — слои и матрица «после изменения».

### Doctor commands (readiness)

```bash
npm run doctor              # local: env, DB, basic probes
npm run doctor:qa           # prod API without local DATABASE_URL
npm run doctor:operator     # operator checklist automation
npm run doctor:billing      # Stripe readiness + /v1/me plan
npm run doctor:security     # trust docs, npm audit, secret patterns
npm run doctor:oidc         # OIDC config probe
```

On contract failure: `npm run doctor:qa` first.

### Smoke tests (prod API, real HTTP)

```bash
MAILAGENT_API_URL=https://api.webmailagent.com \
MAILAGENT_API_KEY=ma_… \
  npm run smoke:qa          # inbox lifecycle
  npm run smoke:agent       # MCP hub + OAuth surface
  npm run smoke:prod        # basic prod check
  npm run smoke:codex       # Codex plugin path
```

### Contract tests (simulate, no DATABASE_URL)

Core + targeted scripts (full 17-script order → **deployment-testing-core.md**):

| After changing… | Run |
|-----------------|-----|
| `src/routes/agent.ts`, MCP hub | `npm run test:contract:qa:agent` |
| inbox / simulate / extract | `npm run test:contract:qa` |
| attachments / raw MIME | `npm run test:contract:qa:attachments` |
| team keys / dashboard | `npm run test:contract:qa:team-keys` |
| billing / Stripe routes | `npm run test:contract:qa:billing` |
| OAuth, callbacks, domains, console, audit, sessions, outbound, search, threads | matching `test:contract:qa:*` |
| anything before merge | `npm run test:prod` (CI deploy uses `test:prod:gate`) |

All contracts: `npm run test:contract:all`.

### Prod gates

```bash
npm run test:prod:gate   # CI post-deploy: smoke:agent + smoke:qa (~15 calls)
npm run test:prod        # full: smoke + all contracts + Playwright
```

**Before merge** on risky changes: `npm run test:prod`. CI default deploy uses gate only.

### Unit / local scripts (no prod required)

```bash
npm run test:allowlist
npm run test:extract
npm run test:structured-extract
npm run test:message-search
npm run test:thread-resolve
```

### Playwright

```bash
npm run test:pw:simulate
# examples/playwright/ — browser signup flows
```

Part of full `test:prod`.

### Starter guards

```bash
npm run test:qa-pilot-starter
npm run test:qa-pilot-cypress-starter
```

Validate example repos for QA pilots.

### Wizard for new QA consumers

```bash
npm run wizard:qa-pilot
npm run wizard:qa-pilot:onboard   # operator: smoke + starter guard
```

Guide: **docs/AUTOTESTS.md**, **AGENTS.md**.

---

## Monitoring

### Health endpoints

```bash
# Liveness + DB connectivity
curl -s https://api.webmailagent.com/health | jq .

# Authenticated volume stats (24h)
curl -s -H "Authorization: Bearer $MAILAGENT_API_KEY" \
  https://api.webmailagent.com/v1/stats | jq .

# Plan/quota for key
curl -s -H "Authorization: Bearer $MAILAGENT_API_KEY" \
  https://api.webmailagent.com/v1/me | jq .
```

### Cloudflare & external dashboards

Workers logs (mailagent), Queues (`mailagent-email`, DLQ), DO/R2/KV metrics — Cloudflare dashboard. Also: Resend inbound events, Neon connectivity, Stripe webhooks (if billing), GitHub Actions status.

**Log patterns:** `cron purge` (hourly TTL); `queue process failed` (consumer retry/DLQ); webhook 401 (bad Resend secret).

No dedicated APM in repo — CF logs + health/stats + CI gate are primary signals.

---

## Operator vs agent

### Operator (human) — one-time and rare

From **docs/OPERATOR.md**:

1. **GitHub Actions secrets** — Cloudflare + `MAILAGENT_API_KEY`
2. **Wrangler prod secrets** — DATABASE_URL, Resend, API_KEY, INBOX_DOMAIN
3. **Resend webhook URL** → prod `/webhooks/resend`
4. **Optional:** Stripe (`STRIPE_*`), OIDC (`OIDC_*`), `DATABASE_URL` in Actions for migrate
5. **npm Trusted Publishing** — already configured; tag releases `v*`
6. **Custom domain** — api.webmailagent.com in Cloudflare dashboard

Checklist automation:

```bash
npm run doctor:operator
```

Human-only doc: **docs/YOUR-TURN.md**.

**Operator does NOT:** manually read OTP emails for CI, click verification links for agent tests, paste secrets into agent chat repeatedly.

### Agent (Cursor / Codex / CI) — autonomous

From **AGENTS.md**:

1. Discovery: `GET /v1/agent` or read AGENTS.md
2. MCP tools: `@mailagent/mcp` stdio or remote `/mcp`
3. Typical flow: create inbox → fill signup → wait/extract OTP or link → delete inbox
4. On failure: `mailagent_diagnose_inbox`, simulate retry, `npm run doctor:qa`
5. After code changes: run targeted contract or `npm run test:prod`

**No DATABASE_URL** in agent/CI context for verification — simulate endpoint only.

### Division table

| Task | Operator | Agent |
|------|----------|-------|
| Set GitHub secrets | ✅ | ❌ |
| Fix application code | ❌ | ✅ |
| Run test:prod | optional | ✅ |
| Read OTP from real email | ❌ | ❌ (uses API extract) |
| Create Resend webhook | ✅ once | ❌ |
| Diagnose 408 wait timeout | ❌ | ✅ via diagnose + simulate |
| Merge PR | human | — |
| npm publish tag | human | — |

### CI as autonomous agent

Post-deploy `test:prod:gate` acts as automated agent verifying prod. Failure blocks deploy job success — operator investigates logs, not OTP.

---

## Security ops

### Routine commands

```bash
npm run doctor:security     # trust docs, verify:codex, npm audit high+
npm run harden:repo         # enable GitHub secret scanning
npm run verify:codex        # Codex plugin / catalog integrity
```

Workflow: `security-baseline.yml` on PR/push + weekly schedule.

### Documentation surfaces

| Doc | Purpose |
|-----|---------|
| docs/PENTEST-PREP.md | Pentest scope and boundaries |
| docs/SOC2.md | SOC2 preparation notes |
| docs/SCOPED-API-KEYS.md | Key scoping model |
| docs/TRUST.md | Trust center pointers |

### Operational controls (summary)

| Control | Mechanism |
|---------|-----------|
| API authentication | Bearer API key / OAuth mat_ on all tenant routes |
| Webhook trust | Svix (Resend), Stripe signing secret |
| Sender allowlist | Drop unexpected inbound at ingest |
| Rate limiting | KV sampled per key; plan quotas |
| Audit trail | `GET /v1/audit`, retention cron |
| Scoped keys | labelPrefix, readOnly in DB |
| Raw MIME caps | Prevent exfiltration of huge blobs |
| Simulate gated | Auth required; tenant-scoped |

Implementation detail: **security-core.md**, **auth-billing-core.md**.

### npm publish security

Trusted Publishing via OIDC — no long-lived `NPM_TOKEN` in GitHub. See **docs/PUBLISH.md**.

Release discipline: run full `test:prod` before tagging.

### Incident response (operational)

1. Confirm scope: `/health`, stats, CF logs, Resend events
2. If ingest broken: check webhook URL, queue DLQ, Neon status
3. If auth broken: key rotation, check `api_keys` / legacy API_KEY
4. If deploy regression: revert commit on main or roll Worker version in CF dashboard
5. Communicate: status via team channel; postmortem for Sev1

Technical failure matrix: **technical-core.md** § Failure modes.

---

## Release & local checklist

**Release:** PR green → merge → auto deploy + gate → tag `v*` → npm OIDC publish. Details: docs/QA-RELEASE.md, docs/PUBLISH.md.

**Local vs prod:** dev `:8787` + `.dev.vars`; prod secrets via wrangler; webhook needs tunnel locally; contracts/smoke target `api.webmailagent.com`.

## Cross-reference: deployment-testing-core

| Load this file (operational-core) | Load deployment-testing-core |
|-----------------------------------|------------------------------|
| Quick deploy / secrets / test matrix | Full wrangler + 17 contract script order |
| Operator vs agent, monitoring entry | Line-by-line workflow YAML |
| CI secrets, security ops commands | Resend webhook setup depth, `.dev.vars` field-by-field |

---

## Quick command reference

```bash
# Local bootstrap
npm install && cp .dev.vars.example .dev.vars && npm run doctor

# Deploy prod (operator)
npm run deploy

# Verify prod (agent or operator)
MAILAGENT_API_URL=https://api.webmailagent.com \
MAILAGENT_API_KEY=ma_… \
  npm run test:prod:gate

# Full verification before merge
MAILAGENT_API_URL=https://api.webmailagent.com \
MAILAGENT_API_KEY=ma_… \
  npm run test:prod

# Operator checklist
npm run doctor:operator

# Security sweep
npm run doctor:security
```

---

## Prod URLs (operational)

| Resource | URL |
|----------|-----|
| API base | `https://api.webmailagent.com` |
| Health | `https://api.webmailagent.com/health` |
| Agent discovery | `https://api.webmailagent.com/v1/agent` |
| Resend webhook | `https://api.webmailagent.com/webhooks/resend` |
| Remote MCP | `https://api.webmailagent.com/mcp` |
| Marketing/docs | `https://webmailagent.com` |
| Autotests doc | `https://webmailagent.com/docs/autotests.html` |
| Operator doc | `https://webmailagent.com/docs/OPERATOR.md` (repo path docs/OPERATOR.md) |

---

## FAQ (compact)

| Question | Answer |
|----------|--------|
| Deploy OK, no mail | Webhook URL, MX, allowlist, DLQ — not gate issue |
| Which CI API key? | Scoped `ci-` key or legacy `API_KEY` in GitHub secret |
| DATABASE_URL in Actions? | Optional; migrate skipped if absent |
| When full test:prod? | Pre-merge API/MCP changes; before npm tag |
| Agent asks human OTP | Wrong — use AGENTS.md + MCP extract |
| API 522 | Custom Domain required, not workers.dev CNAME |

**Related cores:** deployment-testing (deep deploy/contracts), technical (infra), auth-billing, product, business. Router: `routing-map.json`.
