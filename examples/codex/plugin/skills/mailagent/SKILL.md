---
name: mailagent
description: Use MailAgent MCP when the user needs a disposable email for signup, OTP, magic link, or email verification in agent/automation flows.
---

# MailAgent for Codex

## When to use

- Signup / login flows that send verification email
- Need OTP or magic link without parsing HTML
- E2E or agent task: "register with temp email"

## Tools (MCP)

Prefer **`mailagent_verify_signup`** when the user already has an `inboxId` and wants the full
wait/extract behavior in one tool call.

Use the explicit inbox lifecycle when Codex controls the signup from the beginning:

1. `mailagent_create_inbox` — `label`, `service` (github, auth0, …), optional `callbackUrl`
2. Use returned `address` on the signup form
3. `mailagent_wait_for_message` when you need the raw message, or `mailagent_wait_and_extract` when you need OTP/link directly
4. `mailagent_extract_verification` if the message already exists and only parsing is needed
5. `mailagent_delete_inbox` when the flow is complete or the test fails

Use `mailagent_create_inbox` instead of `mailagent_verify_signup` when the email address must be
created before submitting a signup form. Use `wait` before `extract` unless the message is already
available from a previous tool call.

## Env

Requires `MAILAGENT_API_KEY` (and optionally `MAILAGENT_API_URL`). Never print, log, echo, or paste
the API key in chat, command output, screenshots, or error summaries.

## Docs

https://webmailagent.com/docs/agents.html
