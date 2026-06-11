# Codebase Audit — MailAgent

Дата: 2026-06-11 · Версия: `mailagent@0.1.0` · MCP `@mailagent/mcp@0.2.5` · Worker MCP manifest `0.8.1`

---

## a) Размер (chars)

### Сводка

| Область | Файлов | Символов (chars) | Примечание |
|---------|--------|------------------|------------|
| **Весь репозиторий** (без node_modules, .git, dist) | 805 | **4,613,211** | Включая lockfiles, eval artifacts |
| **Значимый код** (ts/mjs/sql/md/html/json, без eval/results) | 504 | **2,950,186** | Без бинарных артефактов eval |
| **`src/` Worker** | 86 | **381,666** | Ядро продукта |
| **`context-os/`** | ~120 | ~2,419,157 | 52% repo — eval CSV/embeddings/graph |
| **`scripts/`** | ~50 | 171,051 | doctor, contract, smoke, wizards |
| **`docs/`** | 44+ | 159,008 | Operator/QA/billing docs |
| **`mcp/`** | ~15 | 101,044 | stdio MCP server |
| **`packages/`** | 3 npm + 1 py | 60,118 | agent, qa SDKs |
| **`migrations/`** | 17 | 7,761 | Neon schema |
| **`public/`** | static | 349,606 | landing, dashboard, docs HTML |

### По расширениям (top, весь repo)

| Ext | Chars | Доля |
|-----|-------|------|
| `.json` | 1,782,292 | 39% (lockfiles, eval) |
| `.ts` | 982,210 | 21% |
| `.md` | 568,833 | 12% |
| `.csv` | 426,431 | 9% (eval results) |
| `.mjs` | 222,863 | 5% |
| `.html` | 200,005 | 4% |
| `.sql` | 7,761 | <1% |

**Вывод для Context OS:** агенту не нужны 4.6M chars — достаточно ~6 ядер (~3–5K chars каждое в текущем виде, цель 500–1000 строк ≈ 25–50K chars на ядро).

---

## b) Структура (modules, packages)

### Monorepo layout

```
MailAgent/                    # private root — Cloudflare Worker + orchestration
├── src/                      # Hono API, services, MCP handlers, queue, DO
├── mcp/                      # @mailagent/mcp — stdio MCP (npm publish)
├── packages/
│   ├── mailagent-agent/      # @mailagent/agent — REST verify SDK
│   ├── mailagent-qa/         # @mailagent/qa — Playwright/Cypress
│   └── mailagent-agent-py/   # PyPI Python SDK
├── migrations/               # Neon Postgres (001–017)
├── scripts/                  # ~50 automation scripts
├── docs/                     # 44+ markdown guides
├── public/                   # Static site + dashboard
├── examples/                 # Playwright, Codex, QA starters, GH Actions
├── skills/                   # Canonical Agent Skill
├── context-os/               # Context OS Phase 1 (this system)
└── .github/workflows/        # 6 CI workflows
```

### `src/` modules (86 TS files)

| Domain | Path | Count | Role |
|--------|------|-------|------|
| **Entry** | `index.ts`, `env.ts` | 2 | Worker fetch/queue/cron, bindings |
| **Routes** | `routes/*.ts` | 16 | HTTP surface (Hono) |
| **Services** | `services/*.ts` | 33 | Business logic |
| **Lib** | `lib/*.ts` | 18 | Auth, plans, rate limit, validation, presets |
| **MCP** | `mcp/*.ts` | 4 | Manifest, handlers, session, SSE |
| **Queue** | `queue/consumer.ts` | 1 | Async email ingest |
| **DO** | `durable-objects/inbox-wait.ts` | 1 | SSE subscribers |
| **DB** | `db/client.ts` | 1 | Neon client |
| **OpenAPI** | `openapi/spec.ts` | 1 | API contract |
| **Types** | `types/*.ts` | 1 | parse-otp-message |

### npm packages

| Package | Version | Consumers |
|---------|---------|-----------|
| `@mailagent/mcp` | 0.2.5 | Cursor, Codex, remote MCP |
| `@mailagent/agent` | 0.1.12 | TS verify SDK |
| `@mailagent/qa` | 0.1.15 | Playwright/Cypress CI |
| `mailagent-agent` (PyPI) | 0.1.0 | Python agents |

### External integrations

Cloudflare Workers · Queues · Durable Objects · R2 · KV · Workers AI · Neon Postgres · Resend · Stripe · Auth0/OIDC · GitHub Actions · npm

---

## c) Domains (routing, models, API, deployment, etc.)

| Domain | Primary paths | Context core |
|--------|---------------|--------------|
| **Business / positioning** | README, docs/QA.md, plans.ts | `business-core` |
| **Product flows** | routes/inboxes, agent, product docs | `product-core` |
| **Auth & billing** | lib/auth, api-key-store, billing, oauth | `auth-billing-core` |
| **Data model** | migrations/, services/inbox, api-key-store | `data-model-core` |
| **Serialization & validation** | extract, message-verify, openapi, lib/*-url | `serialization-core` |
| **Email ingest** | webhooks, queue, resend-mail | `email-core` |
| **OTP / verify** | extract.ts, wait.ts, agent-verify | `otp-core` |
| **REST API** | routes/*, openapi/spec | `api-core` |
| **Worker architecture** | index.ts, wrangler.jsonc | `technical-core`, `worker-core` |
| **Deployment & config** | SETUP.md, wrangler, secrets | `deployment-core` |
| **Testing & CI** | scripts/contract-*, test-prod, workflows | `testing-core`, `operational-core` |
| **Security** | security-core, PENTEST-PREP | overlaps auth-billing |
| **MCP / agents** | mcp/, agent.ts, skills | `product-core`, `technical-core` |

### Route modules → domain map

| Route file | Domain |
|------------|--------|
| `inboxes.ts` | Product, API, Serialization |
| `webhooks.ts` | Email, Auth (signatures) |
| `agent.ts` | Product, MCP |
| `mcp-http.ts` | Auth, MCP |
| `oauth.ts` | Auth-billing |
| `billing.ts` | Auth-billing |
| `team.ts` | Auth-billing, Data model |
| `domains.ts` | Product, API |
| `console.ts` | Product (dashboard API) |
| `audit.ts` | Security, Data model |
| `me.ts` | Auth-billing (plan/limits) |
| `stats.ts` | Operational |
| `health.ts`, `status.ts` | Operational |

### Service modules → domain map (33 files)

**Inbox/messages:** inbox, wait, extract, message-verify, message-raw, message-attachments, raw-mime-r2, thread-resolve, inbox-diagnose

**Agent/MCP:** agent-verify, agent-runs, agent-run-session, mcp-oauth, oidc-oauth

**QA:** simulate-inbound, callback, callback-log

**Search/AI:** message-search, embeddings, structured-extract

**Outbound:** outbound-mail, resend-mail

**Teams/auth/billing:** api-key-store, billing, team-resend, team-event-webhook, domains, audit-log

**Console/stats:** console-summary, console-stats, console-threads, console-inbox, stats

---

## d) Метрики сущностей

| Сущность | Количество | Source of truth |
|----------|------------|-----------------|
| MCP tools | 23 | `src/mcp/manifest.ts` |
| Hono routes | 16 modules | `src/routes/` |
| Services | 33 | `src/services/` |
| Lib modules | 18 | `src/lib/` |
| DB migrations | 17 | `migrations/` |
| DB tables | 11 | migrations CREATE TABLE |
| Service presets | 25 | `src/lib/service-presets.ts` |
| Plan tiers | 4 | free, pro, enterprise, legacy |
| Contract test scripts | 14+ | `scripts/contract-qa*.mjs` |
| Doctor scripts | 6 | `scripts/doctor*.mjs` |
| GitHub workflows | 6 | `.github/workflows/` |
| docs/*.md | 44+ | `docs/` |
| Cloudflare bindings | 7 | wrangler.jsonc |

---

## e) P0 files (навигация для агента)

| Priority | File | Why |
|----------|------|-----|
| P0 | `src/index.ts` | Worker entry |
| P0 | `src/routes/inboxes.ts` | Core API |
| P0 | `src/services/inbox.ts` | CRUD |
| P0 | `src/services/resend-mail.ts` | Ingest |
| P0 | `src/services/extract.ts` | OTP |
| P0 | `src/mcp/manifest.ts` | MCP tools |
| P0 | `src/services/api-key-store.ts` | Auth |
| P0 | `wrangler.jsonc` | Infra |
| P1 | `src/queue/consumer.ts` | Async |
| P1 | `src/durable-objects/inbox-wait.ts` | SSE |
| P1 | `src/routes/webhooks.ts` | Inbound |
| P1 | `src/lib/auth.ts` | Middleware |
| P1 | `migrations/001_init.sql` | Schema base |
| P1 | `AGENTS.md` | Operator matrix |
| P2 | `src/openapi/spec.ts` | Contract |
| P2 | `docs/QA-TROUBLESHOOTING.md` | Debug |
| P2 | `package.json` | Scripts |

---

## f) Риски для Context OS

1. **Drift:** MCP tool count, migrations, presets меняются — `npm run sync:context-os`.
2. **Duplication:** service-presets в `src/lib` и `mcp/src`; SKILL.md в 3 местах.
3. **Eval bloat:** context-os/eval/results раздувает repo — не включать в baseline A.
4. **Legacy keys:** env `API_KEY` без team — особый plan `legacy`, видимость inbox без hint.

См. также: `audit/risks.md`, `audit/cleanup-candidates.md`, `audit/duplicate-docs.md`.
