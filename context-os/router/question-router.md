# Question Router — MailAgent Context OS

Правило: загружать **минимальный** набор ядер. Добавлять parent core только если subcore неполный.

**6 primary cores:** business · product · auth-billing · data-model · serialization · deployment-testing  
**Legacy subcores:** inbox · email · otp · api · worker · database · deployment · security (узкая маршрутизация)

Полная таблица: `routing-map.json` v1.2.0 · Eval: 45 вопросов в `eval/questions.json`

---

## Быстрые маршруты

| Вопрос (паттерн) | Минимальный контекст |
|------------------|----------------------|
| Зачем MailAgent / кто пользователь | `business-core` + `product-core` |
| Как работает inbox / wait / TTL | `inbox-core` |
| Письма не доходят / ingest | `email-core` + `technical-core` |
| OTP пустой / extract / verification JSON | `otp-core` + `serialization-core` |
| API endpoints / OpenAPI | `api-core` + `serialization-core` |
| Auth / 401 / scoped keys / mat_ | `auth-billing-core` |
| Stripe / billing / plan limits | `auth-billing-core` + `business-core` |
| Таблицы / migrations / provider_id | `data-model-core` |
| Deploy / env / wrangler / CI | `deployment-testing-core` |
| Contract tests / test:prod | `deployment-testing-core` |
| Worker / Queue / SSE / DLQ | `technical-core` + `worker-core` |
| MCP tools / verify_signup | `product-core` + `otp-core` |
| Security / pentest / allowlist | `security-core` + `auth-billing-core` |
| Карта репозитория | `audit/project-map` |

---

## Алгоритм

```
1. Классифицировать: business | product | auth | data | serialization | deploy/test | infra
2. Узкая тема?
   → inbox/email/otp/api/worker: legacy subcore
   → auth/stripe/scopes: auth-billing-core
   → schema/migrations: data-model-core
   → validate/extract/openapi: serialization-core
   → deploy/CI/tests: deployment-testing-core
3. Debug production?
   → deployment-testing-core (doctor, contract matrix)
4. «Где в коде»?
   → audit/project-map
```

---

## 45 eval-вопросов (gold standard)

Каждый вопрос в `eval/questions.json` имеет:
- `expected_cores` — минимальный набор для F1 router eval
- `gold` — 3–5 bullets для LLM judge (A/B/C eval)

| ID | Question (кратко) | Cores |
|----|-------------------|-------|
| MA01 | OTP extraction | otp-core |
| MA02 | Deploy to production | deployment-testing-core |
| MA03 | Not receiving emails | email-core, technical-core |
| MA04 | What is MailAgent | business-core, product-core |
| MA05 | OTP empty but message exists | otp-core |
| MA06 | Inbox creation | inbox-core |
| MA07 | REST inbox endpoints | api-core |
| MA08 | Worker structure | worker-core |
| MA09 | Critical DB tables | data-model-core |
| MA10 | Required env vars | deployment-testing-core |
| MA11 | SSE wait | technical-core, inbox-core |
| MA12 | Production tests | deployment-testing-core |
| MA13 | Security risks | security-core |
| MA14 | MCP integration | product-core, technical-core |
| MA15 | 401 unauthorized | auth-billing-core, api-core |
| MA16 | 429 rate limit | auth-billing-core, business-core |
| MA17 | Simulate for QA | email-core, api-core |
| MA18 | Email ingest pipeline | email-core |
| MA19 | Resend webhook config | deployment-testing-core, email-core |
| MA20 | Plan limits | business-core |
| MA21 | Wait timeout 408 | otp-core, inbox-core |
| MA22 | Business logic location | worker-core |
| MA23 | Sender allowlist | security-core, inbox-core |
| MA24 | CI on push main | deployment-testing-core |
| MA25 | Team API key | auth-billing-core, deployment-testing-core |
| MA26 | callbackUrl purpose | product-core, email-core |
| MA27 | Message idempotency | data-model-core, email-core |
| MA28 | Inbox expiry purge | inbox-core, worker-core |
| MA29 | Playwright + MailAgent | product-core, deployment-testing-core |
| MA30 | Duplicate docs | audit/duplicate-docs |
| MA31 | Cleanup candidates | audit/cleanup-candidates, business-core |
| MA32 | Repository map | audit/project-map |
| MA33 | Custom domain inbox | inbox-core, api-core |
| MA34 | Email queue DLQ | technical-core, email-core |
| MA35 | verify_signup MCP tool | product-core, otp-core |
| MA36 | resolveAuth / API key auth | auth-billing-core |
| MA37 | Stripe billing checkout | auth-billing-core |
| MA38 | Verification JSON object | serialization-core |
| MA39 | callbackUrl validation | serialization-core |
| MA40 | Scoped keys labelPrefix | auth-billing-core |
| MA41 | messages table indexes | data-model-core |
| MA42 | Contract test after billing | deployment-testing-core |
| MA43 | wrangler bindings | deployment-testing-core |
| MA44 | Structured extract Workers AI | serialization-core |
| MA45 | OAuth mat_ remote MCP | auth-billing-core |

---

## Комбинации по типу задачи

| Task type | Cores |
|-----------|-------|
| Onboarding new dev | `business-core` + `deployment-testing-core` + `audit/project-map` |
| Debug OTP in CI | `otp-core` + `serialization-core` + `deployment-testing-core` |
| API integration | `api-core` + `product-core` + `serialization-core` |
| Security review | `security-core` + `auth-billing-core` + `audit/risks` |
| Architecture overview | `technical-core` + `data-model-core` |
| Billing setup | `auth-billing-core` + `deployment-testing-core` |
| Schema change | `data-model-core` + `deployment-testing-core` |

---

## Не загружать по умолчанию

- Весь `docs/` (44+ файла) — только ссылки из cores
- `examples/` — только для Playwright/Codex starter вопросов
- `scripts/` — через deployment-testing-core commands
- `public/` HTML — дублирует `docs/*.md`
- `context-os/eval/results/` — eval artifacts, не продукт

---

## Проверка router

```bash
npm run eval:context-os:route        # keyword F1 на 45 вопросах
npm run eval:context-os:route-semantic  # embeddings (OPENAI_API_KEY)
npm run check:context-os-router      # CI gate
```

Определения ядер: `CORE-DEFINITIONS.md` · Аудит: `audit/codebase-audit.md`
