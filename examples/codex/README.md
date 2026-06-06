# Codex integration examples

Полный план: [docs/CODEX.md](../../docs/CODEX.md)

## Quick start (CLI)

```bash
# 1. API key from MailAgent dashboard or npm run issue:key:db
export MAILAGENT_API_KEY='ma_...'
export MAILAGENT_API_URL='https://api.webmailagent.com'

# 2. Add MCP (Codex CLI) — ключ из .dev.vars
npm run codex:install

# или вручную:
# codex mcp add mailagent --env MAILAGENT_API_KEY=... -- npx -y -p @mailagent/mcp@0.2.2 mailagent-mcp

# 3. Or merge config.toml.example into ~/.codex/config.toml
```

## Local plugin (dev)

```bash
cd examples/codex/plugin
cp .env.example .env   # create with MAILAGENT_API_KEY=
chmod +x scripts/run-mailagent-mcp.sh
```

Open `examples/codex/plugin` as a **trusted** Codex project — plugin manifest + `.mcp.json` should register the server.

## Remote MCP (no npx)

See `config.toml.example` option C — `https://api.webmailagent.com/mcp` with Bearer token.
