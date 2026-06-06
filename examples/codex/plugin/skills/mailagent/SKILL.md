---
name: mailagent
description: Use MailAgent MCP when the user needs a disposable email for signup, OTP, magic link, threads, custom domains, or email verification in agent/automation flows.
---

# MailAgent for Codex

## When to use

- Signup / login flows that send verification email
- Need OTP or magic link without parsing HTML
- Outbound send / reply in a thread (support, agent mail)
- Custom domain inboxes for staging
- E2E or agent task: "register with temp email"

## Tools (MCP) — 21 tools

Prefer **`mailagent_verify_signup`** when the user already has an `inboxId` and wants the full
wait/extract behavior in one tool call.

Use the explicit inbox lifecycle when Codex controls the signup from the beginning:

1. `mailagent_create_inbox` — `label`, `service` (github, auth0, …), optional `callbackUrl`, optional `domainId` + `username`
2. Use returned `address` on the signup form
3. `mailagent_wait_for_message` when you need the raw message, or `mailagent_wait_and_extract` when you need OTP/link directly
4. `mailagent_extract_verification` or **`mailagent_extract_structured`** (presets `2fa`, `invoice`, `receipt`)
5. **`mailagent_search_messages`** for keyword/semantic search in large inboxes
6. **`mailagent_send_message`** / **`mailagent_list_threads`** for outbound + conversation view
7. **`mailagent_add_domain`** / **`mailagent_list_domains`** / **`mailagent_verify_domain`** for custom domains
8. `mailagent_delete_inbox` when the flow is complete or the test fails

When wait/verify fails, call **`mailagent_diagnose_inbox`** with the same
`subjectContains` / `messageIndex` — it returns messages, callbacks, hints, and
`debugUiUrl` for humans.

For local QA without real SMTP, use **`mailagent_simulate_message`** (or
`POST …/simulate`) to inject a test OTP, then `wait` / `extract` as usual.

Use `mailagent_create_inbox` instead of `mailagent_verify_signup` when the email address must be
created before submitting a signup form. Use `wait` before `extract` unless the message is already
available from a previous tool call.

## Env

Requires `MAILAGENT_API_KEY` (and optionally `MAILAGENT_API_URL`). Never print, log, echo, or paste
the API key in chat, command output, screenshots, or error summaries.

## Docs

https://webmailagent.com/docs/agents.html · Autotests: https://webmailagent.com/docs/autotests.html · Codex: https://webmailagent.com/docs/codex.html

## Verify prod (after MailAgent changes)

```bash
MAILAGENT_API_URL=https://api.webmailagent.com \
MAILAGENT_API_KEY=ma_… \
  npm run test:prod
```

Repo guide: `docs/AUTOTESTS.md` · `GET /v1/agent` → `tests`, `autotests`.
