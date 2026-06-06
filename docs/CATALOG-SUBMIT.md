# Submit MailAgent to curated Codex catalogs

MailAgent is already installable via **repo marketplace** (`.agents/plugins/marketplace.json`).  
This doc is for **third-party curated lists** like [awesome-codex-plugins](https://github.com/hashgraph-online/awesome-codex-plugins).

## Our install paths (live today)

| Channel | Command |
|---------|---------|
| GitHub marketplace | `codex plugin marketplace add Alex0nder/MailAgent` |
| Agent Skills | `npx skills add Alex0nder/MailAgent --skill mailagent` |
| npm MCP | `npx -y -p @mailagent/mcp@0.2.5 mailagent-mcp` |

Docs: https://webmailagent.com/docs/codex.html · https://webmailagent.com/docs/agents.html

## awesome-codex-plugins (optional PR)

That repo mirrors plugin bundles under `plugins/` and lists them in `.agents/plugins/marketplace.json`.  
Upstream expects a **fork + PR**, not a raw tarball URL.

### Steps

1. Fork https://github.com/hashgraph-online/awesome-codex-plugins
2. Build fresh plugin bundle:

   ```bash
   npm run package:codex
   tar -xzf dist/mailagent-codex-plugin-0.2.5.tar.gz -C /tmp
   ```

3. Copy `/tmp/plugin` → `plugins/Alex0nder/mailagent` in your fork (keep `.codex-plugin/`, `skills/`, `.mcp.json`, `scripts/`)
4. Add marketplace entry (adjust path to match their convention):

   ```json
   {
     "name": "mailagent",
     "displayName": "MailAgent",
     "source": {
       "source": "local",
       "path": "./plugins/Alex0nder/mailagent"
     },
     "policy": {
       "installation": "AVAILABLE",
       "authentication": "ON_INSTALL"
     },
     "category": "Development & Workflow",
     "description": "Temporary inboxes for Codex — OTP, magic links, signup QA, simulate-first autotests (23 MCP tools)."
   }
   ```

5. Open PR with title: `Add MailAgent plugin (email verification for agents)`

### PR body template

```markdown
## MailAgent

Disposable inboxes for agent signup flows — OTP and magic link extraction via MCP.

- Repo: https://github.com/Alex0nder/MailAgent
- Docs: https://webmailagent.com/docs/codex.html
- MCP tools: 23 (verify_signup, simulate, diagnose, threads, domains, …)
- MIT license

Install after merge:
`codex plugin marketplace add hashgraph-online/awesome-codex-plugins`
→ browse **mailagent**
```

## Agent Skills aggregators

For [Agent Skills](https://agentskills.io/) catalogs, point maintainers at:

- Canonical skill: `skills/mailagent/SKILL.md`
- Install: `npx skills add Alex0nder/MailAgent --skill mailagent`
- Guide: [AGENT-SKILLS.md](./AGENT-SKILLS.md)

## Official OpenAI Plugin Directory

Self-serve publish is **coming soon** (OpenAI). Watch [Build plugins](https://developers.openai.com/codex/plugins/build) and [CODEX.md](./CODEX.md).

When available: use `npm run package:codex` tarball + dashboard submission (privacy/terms URLs on webmailagent.com may be required).
