# Question Router — MailAgent Context OS

Правило: загружать **минимальный** набор ядер. Добавлять parent core только если subcore неполный.

## Быстрые маршруты

| Вопрос (паттерн) | Минимальный контекст |
|------------------|----------------------|
| Почему не приходит OTP? | `otp-core` + `email-core` |
| Почему API отвечает 500? | `api-core` + `technical-core` + `worker-core` |
| Как работает inbox? | `inbox-core` |
| Как развернуть проект? | `deployment-core` |
| Какие риски безопасности? | `security-core` |
| Что является ядром продукта? | `product-core` + `business-core` |
| Что можно удалить? | `audit/cleanup-candidates` + `business-core` |
| Зачем существует MailAgent? | `business-core` |
| Как устроен Worker? | `worker-core` + `technical-core` |
| Какие таблицы в БД? | `database-core` |
| Как работает MCP? | `technical-core` + `api-core` |
| Как настроить CI? | `operational-core` |
| Письма не доходят | `email-core` + `technical-core` |
| Timeout на wait/open | `otp-core` + `inbox-core` |
| Как работает simulate? | `email-core` + `api-core` |
| Stripe / billing | `api-core` + `operational-core` |
| Custom domains | `inbox-core` + `api-core` |
| Agent verify flow | `product-core` + `otp-core` |
| Где бизнес-логика? | `worker-core` |
| Какие env нужны? | `deployment-core` |
| Rate limit / quota | `security-core` + `api-core` |
| SSE не работает | `technical-core` + `inbox-core` |
| Дубликаты в документации | `audit/duplicate-docs` |
| Карта репозитория | `audit/project-map` |

## Алгоритм

```
1. Классифицировать вопрос: business | product | technical | operational
2. Есть ли узкая тема (inbox, email, otp, api, worker, db, deploy, security)?
   → да: subcore + при необходимости parent core
   → нет: один из 4 cores
3. Debug/production issue?
   → добавить operational-core (testing commands)
4. «Где в коде»?
   → audit/project-map (не весь src/)
```

## Комбинации по типу задачи

| Task type | Cores |
|-----------|-------|
| Onboarding new dev | `business-core` + `deployment-core` + `audit/project-map` |
| Debug OTP in CI | `otp-core` + `operational-core` (QA-TROUBLESHOOTING refs) |
| API integration | `api-core` + `product-core` |
| Security review | `security-core` + `audit/risks` |
| Architecture overview | `technical-core` + `audit/project-map` |
| Product PM question | `business-core` + `product-core` |

## Не загружать по умолчанию

- Весь `docs/` (42 файла) — только ссылка из core
- `examples/` — только если вопрос про Playwright/Codex starter
- `scripts/` — только через operational-core commands
- `public/` HTML docs — дублируют `docs/*.md`

Полная таблица эксперимента (30+ примеров): `../REPORT.md` § Experiment.
