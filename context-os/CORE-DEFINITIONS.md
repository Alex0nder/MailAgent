# Context Core Definitions — MailAgent

Шесть ядер Context OS для MailAgent. Формат каждого ядра:

1. **Purpose** — зачем ядро, какие вопросы закрывает
2. **Entities** — сущности, поля, связи, файлы
3. **Decision history** — архитектурные решения и почему
4. **Sources** — файлы истины (не дублировать whole repo)

Subcores (`inbox`, `email`, `otp`, `api`, `worker`, `deployment`, `security`) остаются для **узкой** маршрутизации; 6 cores ниже — **primary load** для агента.

---

## 1. Business Core

| | |
|---|---|
| **File** | `cores/business-core.md` |
| **Purpose** | Зачем MailAgent, кто пользователь, боли QA/agents, метрики, монетизация, positioning |
| **Entities** | PlanId, PLAN_LIMITS, user personas, scenarios, KPIs |
| **When to load** | «Что такое MailAgent?», планы, лимиты, 429 quota, monetization |
| **Pairs with** | `product-core` |

---

## 2. Product Core

| | |
|---|---|
| **File** | `cores/product-core.md` |
| **Purpose** | User flows: inbox, email, OTP, QA, agent, MCP; entry points; presets; tools |
| **Entities** | Inbox flow, Email flow, OTP flow, MCP tools (26), service presets (25), scenarios |
| **When to load** | «Как работает verify?», simulate, callback, custom domain, Playwright |
| **Pairs with** | Subcores: `inbox-core`, `otp-core`, `email-core` |

---

## 3. Auth & Billing Core

| | |
|---|---|
| **File** | `subcores/auth-billing-core.md` |
| **Purpose** | Payment/Auth: API keys, teams, scopes, OAuth mat_, OIDC, Stripe, rate limits, webhooks auth |
| **Entities** | ResolvedAuth, ApiKeyScope, Team, PlanId, Stripe session, mat_ JWT, oidc_identities |
| **When to load** | 401/403, scoped keys, Stripe checkout, OAuth MCP, team keys, billing webhook |
| **Pairs with** | `security-core` (pentest), `api-core` (endpoints) |
| **Sources** | `api-key-store.ts`, `auth.ts`, `billing.ts`, `key-scope.ts`, `plans.ts`, `mcp-oauth.ts`, `oidc-oauth.ts` |

---

## 4. Data Model Core

| | |
|---|---|
| **File** | `subcores/data-model-core.md` |
| **Purpose** | ORM/schema: Neon Postgres, 11 tables, migrations, idempotency, tenant isolation, что не в БД |
| **Entities** | inboxes, messages, teams, api_keys, domains, message_search, audit_events, … |
| **When to load** | «Какие таблицы?», migrations, provider_id, FK cascade, pgvector search |
| **Pairs with** | `database-core` (alias — same content, shorter index) |
| **Sources** | `migrations/*.sql`, `db/client.ts`, `services/inbox.ts`, `api-key-store.ts` |

---

## 5. Serialization Core

| | |
|---|---|
| **File** | `subcores/serialization-core.md` |
| **Purpose** | Validation, format: OTP extract, links, verification JSON, OpenAPI, callback URL rules, Zod MCP, structured extract |
| **Entities** | verification object, extractOtp, extractLinks, OpenAPI paths, callback-url, allowlist, runId |
| **When to load** | empty OTP, OpenAPI schema, validation errors, structured extract presets |
| **Pairs with** | `otp-core`, `api-core` |
| **Sources** | `extract.ts`, `message-verify.ts`, `openapi/spec.ts`, `lib/callback-url.ts`, `lib/sender-allowlist.ts`, `structured-extract.ts`, `mcp/src/index.ts` (Zod) |

---

## 6. Deployment & Testing Core

| | |
|---|---|
| **File** | `subcores/deployment-testing-core.md` |
| **Purpose** | Deploy/Config + Testing: wrangler, secrets, CI workflows, contract tests, doctor, prod gate |
| **Entities** | Env bindings, wrangler secrets, workflows, test scripts matrix, operator checklist |
| **When to load** | deploy, env vars, CI, test:prod, doctor, Resend webhook setup |
| **Pairs with** | `deployment-core`, `operational-core` (split detail) |
| **Sources** | SETUP.md, wrangler.jsonc, `.github/workflows/`, `package.json` scripts, docs/AUTOTESTS.md |

---

## Architecture core (supporting)

| | |
|---|---|
| **File** | `cores/technical-core.md` |
| **Purpose** | Stack, Worker/Queue/DO/SSE/R2, failure modes — когда вопрос про инфра, не auth/schema |
| **When** | DLQ, SSE, Resend pipeline, Cloudflare bindings |

---

## Router priority

```
1. Match question → subcore (narrow) OR core (broad)
2. Add parent core if subcore insufficient
3. Debug prod → add deployment-testing-core
4. «Где файл» → audit/project-map (not full src/)
```

Eval set: `eval/questions.json` (45 questions, gold bullets).  
Routing: `router/routing-map.json` + `router/question-router.md`.
