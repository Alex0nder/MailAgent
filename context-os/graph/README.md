# Hermes-style graph (Condition C)

Pre-indexed **code knowledge graph** для eval Condition C — аналог подхода [CodeGraph](https://github.com/colbymchenry/codegraph) / graph-first агентов (Hermes Agent): сущности, связи, retrieval подграфа + сниппеты исходников.

**Не заменяет** Context OS cores. Это отдельная baseline-стратегия для сравнения.

## Сборка индекса

```bash
npm run eval:context-os:graph-build
```

Пишет `graph-index.json`: file nodes, concept nodes, import/document edges.

## Retrieval (в eval)

1. Keyword scoring по вопросу
2. Router seeds (как entity search)
3. BFS 2 hops → subgraph
4. Top-N файлов по score → сниппеты (budget ~80k chars)

## Условия эксперимента

| ID | Стратегия |
|----|-----------|
| A | Full repo baseline (`baseline-manifest.json`) |
| B | Context OS routed cores |
| C | Hermes-style graph (этот индекс) |
