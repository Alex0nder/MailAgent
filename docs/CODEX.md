# MailAgent × OpenAI Codex

Codex supports MCP via `~/.codex/config.toml` and **plugins** (bundled MCP + skills).  
MailAgent already has everything agents need — packaging for Codex remains.

## What exists

| Component | Purpose |
|-----------|------------|
| `@mailagent/mcp` (stdio) | Local MCP — same stack as Cursor (`.cursor/mcp.json`) |
| Remote MCP `POST https://api.webmailagent.com/mcp` | Streamable HTTP + OAuth `mat_` tokens |
| `@mailagent/agent` | REST verify + MCP helpers |
| Skill `.cursor/skills/mailagent-mcp/` | Agent hints for Cursor |

## Two connection methods (v0.11)

### A. Quick — config.toml (stdio)

Copy [examples/codex/config.toml.example](../examples/codex/config.toml.example) to `~/.codex/config.toml` or `.codex/config.toml` in a trusted project.

```bash
codex mcp list
# or in Codex session: tools should include mailagent_*
```

Variables:

- `MAILAGENT_API_URL` — `https://api.webmailagent.com` (prod) or `http://127.0.0.1:8787` (local)
- `MAILAGENT_API_KEY` — team key (`ma_…` / `mak_…`)

### B. No local process — remote HTTP

In `config.toml`:

```toml
[mcp_servers.mailagent-remote]
url = "https://api.webmailagent.com/mcp"

[mcp_servers.mailagent-remote.http_headers]
Authorization = "Bearer YOUR_API_KEY"
Accept = "application/json, text/event-stream"
```

OAuth (team keys): `POST /v1/oauth/token` → `mat_…` instead of legacy key. See [agents docs](https://webmailagent.com/docs/agents.html).

## Codex Plugin (v0.11+)

**Goal:** one install — inbox + verify tools in Codex UI (marketplace / local plugin).

Repo structure: [examples/codex/plugin/](../examples/codex/plugin/)

| File | Role |
|------|------|
| `.codex-plugin/plugin.json` | Plugin manifest |
| `.mcp.json` | MCP server entry (stdio → `@mailagent/mcp`) |
| `scripts/run-mailagent-mcp.sh` | Launcher: env from `.env` / shell |
| `skills/mailagent/SKILL.md` | When to call create/wait/verify |

### Implementation stages

| # | Task | Status |
|---|--------|--------|
| 1 | `config.toml.example` + docs | ✅ |
| 2 | Plugin scaffold (local test) | ✅ |
| 3 | Skill for Codex (signup / OTP flow) | ✅ scaffold |
| 4 | `npm run smoke:codex` — verify `@mailagent/mcp` starts | ✅ |
| 5 | `npm run verify:codex` in CI | ✅ |
| 6 | Remote MCP + OAuth preset (`config.remote-oauth.toml.example`) | ✅ |
| 7 | `AGENTS.md` one-pager | ✅ |
| 8 | Playwright `global-setup` + attachment spec | ✅ |
| 9 | Local plugin test in Codex CLI | manual (Codex not in CI) |
| 10 | Publish `@mailagent/agent@0.1.5` | manual (`npm run publish:agent`) |
| 11 | Repo marketplace (`.agents/plugins/marketplace.json`) | ✅ |
| 12 | `privacyPolicyURL` + `termsOfServiceURL` in plugin.json | ✅ |
| 13 | Official Plugin Directory submit | checklist: [CODEX-DIRECTORY-SUBMIT.md](./CODEX-DIRECTORY-SUBMIT.md) |

### Install from GitHub (repo marketplace)

```bash
codex plugin marketplace add Alex0nder/MailAgent
codex plugin install mailagent --source mailagent
codex mcp list
```

Marketplace manifest: [`.agents/plugins/marketplace.json`](../.agents/plugins/marketplace.json).

### Local plugin test

```bash
cd examples/codex/plugin
export MAILAGENT_API_KEY=...
export MAILAGENT_API_URL=https://api.webmailagent.com

# Codex: open this directory as trusted project
# Settings → MCP → mailagent should appear from plugin manifest

# Or MCP only without plugin:
npm run codex:install   # key and URL from .dev.vars / .env
# codex mcp add mailagent -- npx -y -p @mailagent/mcp@0.2.2 mailagent-mcp
```

### Remote MCP + OAuth

Team keys: get `mat_` token and use in remote config.

```bash
curl -sS -X POST https://api.webmailagent.com/v1/oauth/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=client_credentials&client_secret=YOUR_TEAM_KEY"
```

Example: [examples/codex/config.remote-oauth.toml.example](../examples/codex/config.remote-oauth.toml.example) · [MCP-OAUTH.md](./MCP-OAUTH.md).

### Troubleshooting

| Symptom | Fix |
|---------|---------|
| Tools not visible | `codex mcp list`; check `MAILAGENT_API_KEY` |
| 401 remote | Bearer `mat_…` or legacy key |
| Plugin won't load | trusted project + `examples/codex/plugin` |
| No Codex CLI | `npm run verify:codex` in CI |

### Codex limitations (at plan time)

- MCP in **Codex Cloud** may be unavailable — stdio/remote work in **local** CLI/IDE.
- Secrets: do not commit keys; plugin launcher reads env / `.env` (gitignored).

## Recommended agent flow in Codex

1. `mailagent_create_inbox` or `mailagent_verify_signup` with `service: "github"` / `"auth0"`.
2. Agent fills email on signup form.
3. `mailagent_wait_and_extract` / `mailagent_wait_for_message` with `subjectContains`.
4. OTP or `primaryLink` → next scenario step.
5. `mailagent_delete_inbox` on cleanup.

Skill: see `examples/codex/plugin/skills/mailagent/SKILL.md`.

## Related docs

- [agents.html](https://webmailagent.com/docs/agents.html) — REST + remote MCP
- [mcp/README.md](../mcp/README.md) — stdio server
- [ROADMAP.md](./ROADMAP.md) — v0.11 Codex track
