# Agent autonomy — verify prod without human OTP checks

Temporary inboxes for signup verification (OTP, magic links). Works in **Cursor**, **Codex**, and any MCP client.

**Operator (human):** one-time secrets only → [docs/OPERATOR.md](docs/OPERATOR.md)

## Autotests (verify prod without human)

Full guide: **[docs/AUTOTESTS.md](docs/AUTOTESTS.md)** · [autotests.html](https://webmailagent.com/docs/autotests.html)

```bash
MAILAGENT_API_URL=https://api.webmailagent.com \
MAILAGENT_API_KEY=ma_… \
  npm run test:prod
```

Same as CI post-deploy gate. Step-by-step: `smoke:agent` → `smoke:qa` → `test:contract:all`.

| After changing… | Run |
|-----------------|-----|
| `src/routes/agent.ts`, MCP hub | `npm run test:contract:qa:agent` |
| inbox / simulate / extract | `npm run test:contract:qa` |
| attachments / raw MIME | `npm run test:contract:qa:attachments` |
| team keys / dashboard | `npm run test:contract:qa:team-keys` |
| anything before merge | `npm run test:prod` |

Contract tests use `POST …/simulate` — no real SMTP, no `DATABASE_URL`. On failure: `npm run doctor:qa`.

## Quick commands

```bash
npm run doctor              # local env check
npm run doctor:qa           # QA consumer: API key + diagnose smoke
npm run codex:install       # Codex MCP from .dev.vars
npm run smoke:qa            # prod API lifecycle
npm run smoke:agent         # MCP + OAuth smoke
npm run test:contract:all   # all contract-qa (simulate, no DATABASE_URL)
npm run verify:codex        # Codex plugin scaffold
```

## Discovery (start here)

```bash
curl -s -H "Authorization: Bearer $MAILAGENT_API_KEY" \
  https://api.webmailagent.com/v1/agent | jq .
```

Returns `mcpTools`, `auth.oidc`, `remoteMcp`, `docs`.

## MCP tools (23)

`mailagent_verify_signup` · `mailagent_create_inbox` · `mailagent_wait_for_message` · `mailagent_wait_and_extract` · `mailagent_extract_verification` · `mailagent_extract_structured` · `mailagent_list_messages` · `mailagent_get_raw_message` · `mailagent_list_attachments` · `mailagent_get_attachment` · `mailagent_diagnose_inbox` · `mailagent_simulate_message` · `mailagent_send_message` · `mailagent_list_threads` · `mailagent_add_domain` · `mailagent_list_domains` · `mailagent_verify_domain` · `mailagent_search_messages` · `mailagent_list_inboxes` · `mailagent_get_inbox` · `mailagent_delete_inbox` · `mailagent_get_run_session` · `mailagent_patch_run_session`

Source of truth: `src/mcp/manifest.ts` → `GET /v1/agent`.

## Connect clients

| Client | Config |
|--------|--------|
| Cursor | `.cursor/mcp.json` → `node mcp/dist/index.js` |
| Codex | [docs/codex.html](https://webmailagent.com/docs/codex.html) |
| Remote | `POST https://api.webmailagent.com/mcp` + Bearer |

```bash
codex mcp add mailagent -- npx -y -p @mailagent/mcp@0.2.3 mailagent-mcp
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

On failure: `mailagent_diagnose_inbox` or `POST …/simulate` then retry.

## Docs

- [docs/agents](https://webmailagent.com/docs/agents.html) · [docs/autotests](https://webmailagent.com/docs/autotests.html) · [docs/qa](https://webmailagent.com/docs/qa.html)
- [docs/AUTOTESTS.md](docs/AUTOTESTS.md) · [docs/OPERATOR.md](docs/OPERATOR.md) (human: secrets only)
- [docs/CODEX.md](docs/CODEX.md) · [docs/QA-RELEASE.md](docs/QA-RELEASE.md)
- Skill (Cursor): `.cursor/skills/mailagent-mcp/SKILL.md`
