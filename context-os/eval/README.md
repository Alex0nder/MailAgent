# Context OS — automated A/B evaluation

Замер **Condition A** (baseline repo) vs **Condition B** (routed cores) по протоколу [AI-Context-OS](https://github.com/Alex0nder/AI-Context-OS).

Результаты пишутся в `context-os/eval/results/` — можно **pull из MailAgent git** в окне AI-Context-OS.

## Требования

```bash
# Корневой .env (gitignored) — подхватывается автоматически:
OPENAI_API_KEY=sk-...

# Или в shell:
export OPENAI_API_KEY=sk-...
export EVAL_MODEL=gpt-4o-mini         # опционально
export OPENAI_BASE_URL=https://...    # OpenAI-compatible (опционально)
```

## Быстрый старт (из клона MailAgent)

```bash
git clone https://github.com/Alex0nder/MailAgent.git
cd MailAgent

# 1) Router only (без LLM, ~1 сек)
npm run eval:context-os:route

# 2) Dry-run — только размеры контекста
npm run eval:context-os:dry

# 3) Pilot A/B (10 вопросов, ~10–20 мин, платный API)
npm run eval:context-os:pilot

# 4) Сводка
npm run eval:context-os:aggregate
```

## Pull results в AI-Context-OS (другое окно)

```bash
# В репозитории AI-Context-OS
mkdir -p experiments/mailagent/runs
cd experiments/mailagent/runs

# Обновить клон MailAgent и скопировать последний run
git clone https://github.com/Alex0nder/MailAgent.git _mailagent 2>/dev/null || git -C _mailagent pull
LATEST=$(ls -td _mailagent/context-os/eval/results/run-* 2>/dev/null | head -1)
cp -R "$LATEST" ./$(basename "$LATEST")
cat ./$(basename "$LATEST")/SUMMARY.md
```

Или sparse checkout только eval (быстрее):

```bash
git clone --filter=blob:none --sparse https://github.com/Alex0nder/MailAgent.git _mailagent
git -C _mailagent sparse-checkout set context-os/eval
```

**Важно:** Condition B в `run-eval.mjs` берёт `expected_cores` из `questions.json` (gold routing), не keyword-router. Router F1 проверяется отдельно через `eval:context-os:route`.

Рекомендуется коммитить в AI-Context-OS: `experiments/mailagent/runs/run-*/summary.json` + `SUMMARY.md`.

## Команды

| Script | Что делает |
|--------|------------|
| `npm run eval:context-os:route` | Routing F1 vs gold cores |
| `npm run eval:context-os:dry` | Размеры A/B без API |
| `npm run eval:context-os:pilot` | A/B + judge, MA01–MA10 |
| `npm run eval:context-os` | A/B все 35 вопросов |
| `npm run eval:context-os:aggregate -- <dir>` | CCR, accuracy Δ, SUMMARY.md |

### Ручной запуск

```bash
node context-os/eval/run-eval.mjs --pilot --condition both
node context-os/eval/run-eval.mjs --ids MA01,MA03 --skip-judge
node context-os/eval/aggregate.mjs context-os/eval/results/run-1730000000000
```

## Выходные файлы

```
context-os/eval/results/run-<timestamp>/
├── run-meta.json
├── context-a-meta.json
├── results.csv          # все прогоны
├── paired.csv           # после aggregate
├── summary.json
├── SUMMARY.md           # human-readable
├── MA01-A.md
└── MA01-B.md
```

## Метрики

| Metric | Источник |
|--------|----------|
| CCR | `context_chars_A / context_chars_B` |
| Accuracy 0–3 | LLM judge vs `questions.json` gold |
| Hallucination | judge boolean |
| Latency | wall-clock per answer |
| Routing F1 | `route-eval.mjs` |

## Файлы

- `questions.json` — 35 вопросов + gold bullets
- `baseline-manifest.json` — что входит в Condition A (без `context-os/`)
- `lib/` — router, context loader, LLM, judge

## Стоимость (оценка)

Pilot 10 × 2 conditions × (answer + judge) ≈ 40 API calls.  
При `gpt-4o-mini` — порядка $0.05–0.30 в зависимости от размера baseline.
