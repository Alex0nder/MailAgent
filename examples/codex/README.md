# Codex examples

Full plan: [docs/CODEX.md](../../docs/CODEX.md)

```bash
# 1. Build MCP
npm run build:mcp

# 2. Add MCP (Codex CLI) — key from .dev.vars
npm run codex:install

# or manually:
codex mcp add mailagent -- npx -y -p @mailagent/mcp mailagent-mcp
```
