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

Prefer **`mailagent_verify_signup`** when the user already submitted a form and you have `inboxId`.

Otherwise:

1. `mailagent_create_inbox` — `label`, `service` (github, auth0, …), optional `callbackUrl`
2. Use returned `address` on the signup form
3. `mailagent_wait_for_message` or `mailagent_wait_and_extract` — `subjectContains`, optional `messageIndex`
4. `mailagent_extract_verification` if inbox already has mail
5. `mailagent_delete_inbox` when done

## Env

Requires `MAILAGENT_API_KEY` (and optionally `MAILAGENT_API_URL`). Never print the key in chat.

## Docs

https://webmailagent.com/docs/agents.html
