# MailAgent — guide for AI agents

Temporary inboxes for signup verification (OTP, magic links). Works in **Cursor**, **Codex**, and any MCP client.

## Quick commands

```bash
npm run doctor              # local env check
npm run smoke:qa            # prod API lifecycle
npm run smoke:agent         # MCP + OAuth smoke
npm run test:contract:qa    # API + DB simulate (needs DATABASE_URL)
npm run verify:codex        # Codex plugin scaffold
```

## MCP tools (12)

`mailagent_verify_signup` · `mailagent_create_inbox` · `mailagent_wait_for_message` · `mailagent_wait_and_extract` · `mailagent_extract_verification` · `mailagent_list_messages` · `mailagent_get_raw_message` · `mailagent_list_attachments` · `mailagent_get_attachment` · `mailagent_list_inboxes` · `mailagent_get_inbox` · `mailagent_delete_inbox`

Source of truth: `src/mcp/manifest.ts` → `GET /v1/agent`.

## Connect clients

| Client | Config |
|--------|--------|
| Cursor | `.cursor/mcp.json` → `node mcp/dist/index.js` |
| Codex | `examples/codex/config.toml.example` or [docs/CODEX.md](docs/CODEX.md) |
| Remote | `POST https://api.webmailagent.com/mcp` + Bearer |

```bash
codex mcp add mailagent -- npx -y @mailagent/mcp@0.2.0
```

## npm packages

| Package | Use |
|---------|-----|
| `@mailagent/mcp` | stdio MCP |
| `@mailagent/agent` | REST verify SDK |
| `@mailagent/qa` | Playwright / Cypress |

## Typical verify flow

1. Create inbox (`label`, `service` preset).
2. Fill signup form with `address`.
3. Wait (`subjectContains`, optional `messageIndex`).
4. Use `otp` or `primaryLink`.
5. Delete inbox when done.

## Docs

- [docs/agents](https://webmailagent.com/docs/agents.html) · [docs/qa](https://webmailagent.com/docs/qa.html)
- [docs/CODEX.md](docs/CODEX.md) · [docs/QA-RELEASE.md](docs/QA-RELEASE.md)
- Skill (Cursor): `.cursor/skills/mailagent-mcp/SKILL.md`
