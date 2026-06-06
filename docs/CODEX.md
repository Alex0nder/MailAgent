# MailAgent × OpenAI Codex

Codex поддерживает MCP через `~/.codex/config.toml` и **plugins** (bundled MCP + skills).  
У MailAgent уже есть всё нужное для агентов — остаётся упаковать под Codex.

## Что уже есть

| Компонент | Назначение |
|-----------|------------|
| `@mailagent/mcp` (stdio) | Локальный MCP — тот же стек, что Cursor (`.cursor/mcp.json`) |
| Remote MCP `POST https://api.webmailagent.com/mcp` | Streamable HTTP + OAuth `mat_` tokens |
| `@mailagent/agent` | REST verify + MCP helpers |
| Skill `.cursor/skills/mailagent-mcp/` | Подсказки агенту для Cursor |

## Два способа подключения (v0.11)

### A. Быстро — config.toml (stdio)

Скопируй [examples/codex/config.toml.example](../examples/codex/config.toml.example) в `~/.codex/config.toml` или `.codex/config.toml` в trusted-проекте.

```bash
codex mcp list
# или в сессии Codex: tools должны включать mailagent_*
```

Переменные:

- `MAILAGENT_API_URL` — `https://api.webmailagent.com` (prod) или `http://127.0.0.1:8787` (local)
- `MAILAGENT_API_KEY` — team key (`ma_…` / `mak_…`)

### B. Без локального процесса — remote HTTP

В `config.toml`:

```toml
[mcp_servers.mailagent-remote]
url = "https://api.webmailagent.com/mcp"

[mcp_servers.mailagent-remote.http_headers]
Authorization = "Bearer YOUR_API_KEY"
Accept = "application/json, text/event-stream"
```

OAuth (team keys): `POST /v1/oauth/token` → `mat_…` вместо legacy key. См. [agents docs](https://webmailagent.com/docs/agents.html).

## Codex Plugin (v0.11+)

**Цель:** один install — inbox + verify tools в Codex UI (marketplace / local plugin).

Структура в репо: [examples/codex/plugin/](../examples/codex/plugin/)

| Файл | Роль |
|------|------|
| `.codex-plugin/plugin.json` | Манифест plugin |
| `.mcp.json` | MCP server entry (stdio → `@mailagent/mcp`) |
| `scripts/run-mailagent-mcp.sh` | Launcher: env из `.env` / shell |
| `skills/mailagent/SKILL.md` | Когда вызывать create/wait/verify |

### Этапы реализации

| # | Задача | Статус |
|---|--------|--------|
| 1 | `config.toml.example` + docs | ✅ |
| 2 | Plugin scaffold (local test) | ✅ |
| 3 | Skill для Codex (signup / OTP flow) | ✅ scaffold |
| 4 | `npm run smoke:codex` — проверка что `@mailagent/mcp` стартует | ✅ |
| 5 | `npm run verify:codex` в CI | ✅ |
| 6 | Remote MCP + OAuth preset (`config.remote-oauth.toml.example`) | ✅ |
| 7 | `AGENTS.md` one-pager | ✅ |
| 8 | Playwright `global-setup` + attachment spec | ✅ |
| 9 | Локальный тест plugin в Codex CLI | manual (Codex not in CI) |
| 10 | Publish `@mailagent/agent@0.1.5` | manual (`npm run publish:agent`) |
| 11 | Marketplace / `codex plugin install` publish | planned |

### Локальный тест plugin

```bash
cd examples/codex/plugin
export MAILAGENT_API_KEY=...
export MAILAGENT_API_URL=https://api.webmailagent.com

# Codex: открыть этот каталог как trusted project
# Settings → MCP → должен появиться mailagent из plugin manifest

# Или только MCP без plugin:
npm run codex:install   # ключ и URL из .dev.vars / .env
# codex mcp add mailagent -- npx -y -p @mailagent/mcp@0.2.1 mailagent-mcp
```

### Remote MCP + OAuth

Team keys: получи `mat_` token и подставь в remote config.

```bash
curl -sS -X POST https://api.webmailagent.com/v1/oauth/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=client_credentials&client_secret=YOUR_TEAM_KEY"
```

Пример: [examples/codex/config.remote-oauth.toml.example](../examples/codex/config.remote-oauth.toml.example) · [MCP-OAUTH.md](./MCP-OAUTH.md).

### Troubleshooting

| Симптом | Решение |
|---------|---------|
| Tools не видны | `codex mcp list`; проверь `MAILAGENT_API_KEY` |
| 401 remote | Bearer `mat_…` или legacy key |
| Plugin не грузится | trusted project + `examples/codex/plugin` |
| Без Codex CLI | `npm run verify:codex` в CI |

### Ограничения Codex (на момент плана)

- MCP в **Codex Cloud** может быть недоступен — stdio/remote работают в **локальном** CLI/IDE.
- Секреты: не коммитить ключи; plugin launcher читает env / `.env` (gitignored).

## Рекомендуемый agent flow в Codex

1. `mailagent_create_inbox` или `mailagent_verify_signup` с `service: "github"` / `"auth0"`.
2. Агент заполняет email на форме signup.
3. `mailagent_wait_and_extract` / `mailagent_wait_for_message` с `subjectContains`.
4. OTP или `primaryLink` → следующий шаг сценария.
5. `mailagent_delete_inbox` при cleanup.

Skill: см. `examples/codex/plugin/skills/mailagent/SKILL.md`.

## Связанные документы

- [agents.html](https://webmailagent.com/docs/agents.html) — REST + remote MCP
- [mcp/README.md](../mcp/README.md) — stdio server
- [ROADMAP.md](./ROADMAP.md) — v0.11 Codex track
