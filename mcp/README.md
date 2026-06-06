# @mailagent/mcp

MCP-сервер (stdio) для Cursor и других MCP-клиентов.

## Cursor: рекомендации

| Что | Рекомендация |
|-----|----------------|
| Протокол | [MCP](https://modelcontextprotocol.io) — открытый стандарт, Cursor = **клиент** |
| SDK | `@modelcontextprotocol/sdk` + `zod` |
| Транспорт для локального dev | **stdio** (Cursor запускает процесс) |
| Конфиг | `.cursor/mcp.json` (проект) или `~/.cursor/mcp.json` (глобально) |
| Секреты | `env` / `envFile` в mcp.json, не в чат |
| Логи | только **stderr** |

Документация Cursor: [Model Context Protocol](https://docs.cursor.com/context/model-context-protocol) (Settings → MCP → Add server).

Отдельного «Cursor SDK для MCP» нет — пишете обычный MCP server, Cursor подключает его как subprocess.

## Сборка

```bash
npm install
npm run build
```

## Переменные

- `MAILAGENT_API_URL` — base URL Worker (default `http://127.0.0.1:8787`)
- `MAILAGENT_API_KEY` — Bearer token (= Worker `API_KEY`)

## Локальный запуск (отладка)

```bash
MAILAGENT_API_URL=http://127.0.0.1:8787 MAILAGENT_API_KEY=xxx node dist/index.js
```

Процесс ждёт JSON-RPC на stdin; для теста используйте Cursor MCP logs.

## OpenAI Codex

Codex читает MCP из `~/.codex/config.toml` или **plugin** (bundled `.mcp.json`).

| Способ | Файл |
|--------|------|
| config.toml (stdio / remote HTTP) | [examples/codex/config.toml.example](../examples/codex/config.toml.example) |
| Local plugin | [examples/codex/plugin/](../examples/codex/plugin/) |
| Полный план | [docs/CODEX.md](../docs/CODEX.md) |

```bash
codex mcp add mailagent -- npx -y -p @mailagent/mcp@0.2.2 mailagent-mcp
export MAILAGENT_API_KEY=...
export MAILAGENT_API_URL=https://api.webmailagent.com
```

Remote (без subprocess): `url = "https://api.webmailagent.com/mcp"` + `Authorization: Bearer …`.
