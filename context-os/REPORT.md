# Context OS Experiment — REPORT

Дата: 2026-06-10 · Репозиторий: MailAgent @ 0.1.0

---

## 1. Сколько сущностей найдено

| Категория | Количество | Источник |
|-----------|------------|----------|
| MCP tools | 23 | `src/mcp/manifest.ts` |
| Hono route modules | 15 | `src/routes/` |
| Service modules | 25+ | `src/services/` |
| Lib modules | 15+ | `src/lib/` |
| DB migrations | 16 | `migrations/` |
| DB tables (core) | 12+ | migrations 001–016 |
| npm packages (published) | 3 | mcp, mailagent-agent, mailagent-qa |
| Service presets | 12 | service-presets.ts |
| Plan tiers | 4 | free, pro, enterprise, legacy |
| docs/*.md | 42 | `docs/` |
| GitHub workflows | 6 | `.github/workflows/` |
| Contract test scripts | 14 | `scripts/contract-qa*.mjs` |
| Doctor scripts | 6 | doctor*.mjs |
| TypeScript source files | ~90 | src + mcp + packages |
| SKILL.md copies | 3 | skills, .cursor, codex plugin |
| Cloudflare bindings | 7 | wrangler.jsonc |

**Файлов в репозитории:** ~3295 (с lockfiles); значимых для контекста ~289.

---

## 2. Какие Core созданы

| Core | Файл | Размер (прибл.) |
|------|------|-----------------|
| Business | `cores/business-core.md` | purpose, users, scenarios, metrics |
| Product | `cores/product-core.md` | 5 flows + 10 scenarios |
| Technical | `cores/technical-core.md` | full stack + failure points |
| Operational | `cores/operational-core.md` | deploy, CI, env, testing |

---

## 3. Какие Subcores созданы

| Subcore | Файл |
|---------|------|
| Inbox | `subcores/inbox-core.md` |
| Email | `subcores/email-core.md` |
| OTP | `subcores/otp-core.md` |
| API | `subcores/api-core.md` |
| Worker | `subcores/worker-core.md` |
| Database | `subcores/database-core.md` |
| Deployment | `subcores/deployment-core.md` |
| Security | `subcores/security-core.md` |

---

## 4. Какие вопросы покрывает каждый Core

| Core | Вопросы |
|------|---------|
| **Business** | Зачем продукт? Кто пользователь? Какие боли QA/agents? Метрики и планы? Монетизация? |
| **Product** | Как работают inbox/email/OTP/QA/agent flows? Какие entry points? MCP typical flow? |
| **Technical** | Stack? Worker/Queue/DO/SSE? Neon/Resend/R2? Critical components? Failure modes? |
| **Operational** | Как deploy? Какие secrets? CI workflows? Какие тесты запускать? Monitoring? |
| **Inbox** | CRUD inbox, wait, quota, scoped keys, TTL |
| **Email** | Webhook→queue→ingest, simulate, outbound, endpoints |
| **OTP** | extractOtp, wait filters, troubleshoot empty OTP |
| **API** | All REST endpoints, OpenAPI, contract tests |
| **Worker** | index.ts routing, services vs routes, cron |
| **Database** | Tables, migrations, what's not in DB |
| **Deployment** | SETUP steps, wrangler, env table |
| **Security** | Secrets location, authz, allowlist, pentest scope |

---

## 5. Какие файлы наиболее важны

| Priority | File | Why |
|----------|------|-----|
| P0 | `src/index.ts` | Worker entry, routing |
| P0 | `src/routes/inboxes.ts` | Core product API |
| P0 | `src/services/inbox.ts` | Inbox/message CRUD |
| P0 | `src/services/resend-mail.ts` | Email ingest |
| P0 | `src/services/extract.ts` | OTP extraction |
| P0 | `src/mcp/manifest.ts` | MCP tool source of truth |
| P0 | `wrangler.jsonc` | Infrastructure bindings |
| P1 | `src/queue/consumer.ts` | Async ingest |
| P1 | `src/durable-objects/inbox-wait.ts` | SSE |
| P1 | `src/routes/webhooks.ts` | Inbound trigger |
| P1 | `src/lib/auth.ts` + `api-key-store.ts` | Auth |
| P1 | `migrations/001_init.sql` | Schema foundation |
| P1 | `AGENTS.md` | Agent operator guide |
| P2 | `src/openapi/spec.ts` | API contract |
| P2 | `docs/QA-TROUBLESHOOTING.md` | Debug playbook |
| P2 | `package.json` | All npm scripts |

---

## 6. Какие файлы можно проверить на удаление

См. `audit/cleanup-candidates.md`. Кратко:

- **Проверить drift:** `mcp/src/service-presets.ts` vs `src/lib/service-presets.ts`
- **Исторические:** Netlify migration mentions in README/HOSTING-CLOUDFLARE
- **One-time scripts:** `prepare-catalog-pr.mjs`, `prepare-skills-pr.mjs` после merge PR
- **Не удалять:** SKILL.md копии (sync:skills), contract-qa scripts, examples/

---

## 7. Насколько удалось сократить контекст

| Метрика | Полный репо | Context OS (типичный вопрос) | Сокращение |
|---------|-------------|------------------------------|------------|
| Файлы | ~289 значимых | 1–3 ядра (~4–12 KB each) | **~95–99%** файлов |
| Строки (оценка) | ~25 000+ src/docs | ~400–1200 строк | **~95%** |
| docs/ | 42 MD | 0–1 ссылка | **100%** docs не нужны |
| examples/ | 30+ files | 0 | **100%** |
| scripts/ | 50+ | 0 (команды в operational-core) | **100%** |

**Типичные размеры ядер:**
- Subcore: ~80–120 строк
- Core: ~150–250 строк
- Комбо (2 subcores): ~200–240 строк vs весь репозиторий

**Исключения (нужен широкий контекст):**
- Cross-cutting refactor → technical + worker + api
- Full security audit → security + api + audit/risks
- New feature design → business + product + technical

---

## 8. Выводы о гипотезе AI Context OS

**Гипотеза:** AI отвечает точнее и быстрее с Context Cores вместо полного репозитория.

**Подтверждение (на уровне структуры эксперимента):**

1. MailAgent имеет **чёткие домены** (inbox, email, OTP, MCP, deploy) — хорошо ложатся на subcores.
2. **Source of truth** локализован: manifest.ts, openapi/spec.ts, wrangler.jsonc — не нужно сканировать весь src/.
3. **Документация дублируется** (42 MD + HTML + README) — полный контекст добавляет шум.
4. **Debug-вопросы** (OTP timeout) требуют 2 ядра, не 90 TS-файлов.

**Ограничения:**

1. Без актуального sync ядра устаревают при изменении кода.
2. Cross-domain баги (webhook→queue→DO→wait) требуют 3+ ядер.
3. Contract test matrix слишком детальна для одного ядра — operational-core ссылается на команды.

---

## 9. Где подход работает хорошо

| Область | Почему |
|---------|--------|
| OTP troubleshooting | otp-core + email-core = полный decision tree |
| Deploy/onboarding | deployment-core заменяет README+SETUP+OPERATOR |
| «Какие endpoints?» | api-core без чтения 15 route files |
| Agent integration | product-core + manifest reference |
| Security review | security-core самодостаточен |
| «Что за продукт?» | business-core за 2 минуты чтения |

---

## 10. Где подход не работает

| Область | Почему |
|---------|--------|
| Exact code changes | Нужен конкретный файл из src/ — ядра не заменяют код |
| Billing/Stripe edge cases | Размазано по billing.ts, webhooks, docs — нужен src |
| OIDC/OAuth flows | Много файлов: oauth.ts, mcp-oauth, oidc-oauth |
| Новые фичи без обновления cores | Drift |
| Duplicate docs resolution | Нужен human — audit только классифицирует |
| Performance tuning | Нет ядра — нужен profiling |

---

## Experiment: Minimal Context Table (35 examples)

| # | Question | Minimal Context | Reason |
|---|----------|-----------------|--------|
| 1 | How does OTP work? | otp-core | Extraction + read paths self-contained |
| 2 | How to deploy MailAgent? | deployment-core | SETUP/deploy steps |
| 3 | Why are users not receiving emails? | email-core + technical-core | Webhook→queue→allowlist chain |
| 4 | What is the product? | business-core + product-core | Purpose + flows |
| 5 | Why is OTP empty but message exists? | otp-core | extract + troubleshoot section |
| 6 | How does inbox creation work? | inbox-core | CRUD + address generation |
| 7 | What API endpoints exist? | api-core | Full endpoint list |
| 8 | How is the Worker structured? | worker-core | Entry + services map |
| 9 | What database tables matter? | database-core | Schema + critical tables |
| 10 | What env vars are required? | deployment-core | Env table |
| 11 | How does SSE wait work? | technical-core + inbox-core | DO + /events route |
| 12 | How to run prod tests? | operational-core | test:prod commands |
| 13 | What are security risks? | security-core + audit/risks | Threat model |
| 14 | How does MCP integrate? | product-core + technical-core | Agent flow + /mcp transport |
| 15 | Why API returns 401? | security-core + api-core | Auth + endpoints |
| 16 | Why API returns 429? | security-core + business-core | Rate limit + plan quotas |
| 17 | How does simulate work for QA? | email-core + api-core | simulate endpoint + ingest |
| 18 | What is the email ingest pipeline? | email-core | Full inbound path |
| 19 | How to configure Resend webhook? | deployment-core + email-core | SETUP + webhook route |
| 20 | What are plan limits? | business-core | PLAN_LIMITS table |
| 21 | How to debug wait timeout 408? | otp-core + inbox-core | messageIndex, subjectContains |
| 22 | Where is business logic? | worker-core | services/ map |
| 23 | How does allowlist work? | security-core + inbox-core | sender filter at ingest |
| 24 | What runs in CI on push to main? | operational-core | deploy-worker.yml |
| 25 | How to create team API key? | deployment-core + api-core | issue:key:db + team routes |
| 26 | What is callbackUrl for? | product-core + email-core | QA callback flow |
| 27 | How are messages idempotent? | database-core + email-core | provider_id UNIQUE |
| 28 | What happens on inbox expiry? | inbox-core + worker-core | cron purgeExpired |
| 29 | How to use Playwright with MailAgent? | product-core + operational-core | QA flow + build:qa |
| 30 | What files are duplicates? | audit/duplicate-docs | Classification only |
| 31 | What can be cleaned up? | audit/cleanup-candidates | No deletion |
| 32 | Map of the repository? | audit/project-map | Navigation |
| 33 | How does custom domain inbox work? | inbox-core + api-core | domainId + domains routes |
| 34 | Why queue/DLQ matters? | technical-core + email-core | Retry + mail loss |
| 35 | What is mailagent_verify_signup? | product-core + otp-core | Preferred agent tool |

---

## Next steps (для продолжения эксперимента)

1. **A/B тест:** одинаковые 10 вопросов — full repo vs Context OS — сравнить accuracy/latency.
2. **Sync hook:** `npm run sync:context-os` при изменении manifest.ts, inboxes.ts, wrangler.jsonc.
3. **Embedding router:** routing-map.json → semantic match вместо keyword patterns.
4. **Version pin:** manifest.json `sourceCommit` для воспроизводимости.

---

*Сгенерировано в рамках AI Context OS Experiment. Продуктовый код не изменён.*
