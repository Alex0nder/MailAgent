# Workspace Agent PBR

MailAgent Core stays focused on QA inboxes, OTP, magic links, CI, and autonomous test agents.
Workspace Agent is a new product layer for real work mail and calendar automation.

Default posture: read-only or draft-only. Autonomous reply execution requires an explicit admin policy, immutable guardrails, idempotency, and audit logs. Calendar writes remain disabled.

Preferred model providers: DeepSeek and Qwen through OpenAI-compatible chat completions.

## North Star

An autonomous inbox and calendar agent for busy teams:

- reads and summarizes threads;
- extracts action items and decisions;
- drafts replies;
- suggests reminders and follow-ups;
- reasons over calendar availability;
- eventually executes approved mail/calendar actions.

## P0 — Safe Read/Draft Core

| # | Feature | Status |
|---|---------|--------|
| 1 | Provider adapter for DeepSeek/Qwen/OpenAI-compatible chat completions | done |
| 2 | Redaction before LLM call (OTP, API keys, bearer tokens, card-like numbers) | done |
| 3 | `POST /v1/workspace/summarize` for supplied messages/thread | done |
| 4 | `POST /v1/workspace/draft-reply` returns draft only, never sends | done |
| 5 | `POST /v1/workspace/reminders/suggest` returns follow-up/reminder candidates | done |
| 6 | Contract tests with deterministic fallback when no LLM key is configured | done |

Done when: a QA/dev can paste a thread payload and get summary, action items, draft reply, and reminder suggestions without connecting Gmail.

## P1 — Gmail Read Connector

| # | Feature | Status |
|---|---------|--------|
| 7 | OAuth account connection with least-privilege Gmail read scopes | backlog |
| 8 | Thread search/list/read via Gmail API | backlog |
| 9 | Daily digest and unread triage | backlog |
| 10 | "Needs reply" and "waiting on them" classifiers | backlog |
| 11 | Per-team retention controls | backlog |

Done when: connected user can ask for unread summaries and reply-needed list without write scopes.

## P2 — Calendar Read Connector

| # | Feature | Status |
|---|---------|--------|
| 12 | Google Calendar read scopes | backlog |
| 13 | Availability windows and conflict detection | backlog |
| 14 | Meeting-time suggestions from email thread context | backlog |
| 15 | Daily agenda digest | backlog |

Done when: the agent can propose meeting slots from calendar availability without writing events.

## P3 — Approval-Based Write Actions

| # | Feature | Status |
|---|---------|--------|
| 16 | Draft creation in Gmail | backlog |
| 17 | Policy-gated idempotent reply from a MailAgent inbox | done |
| 18 | Create/update calendar events only after approval | backlog |
| 19 | Audit/action log for policy, send, denial, and failure | done |
| 20 | Team kill switch (`draft_only`) for all Workspace writes | done |

Done when: a team can safely enable write actions with approval gates and auditability.

## P4 — Autonomous Rules

| # | Feature | Status |
|---|---------|--------|
| 21 | Rule engine: invoices, support, meetings, follow-ups | backlog |
| 22 | Scheduled reminders and monitors | backlog |
| 23 | Slack/email digests | backlog |
| 24 | Admin policy: mode, recipient domains, confidence, hourly limit | done |

Done when: teams can run low-risk automations without prompt-by-prompt babysitting.

## Non-Goals For MVP

- No direct access to personal Gmail until P1.
- No autonomous sending unless an admin explicitly enables a persisted policy.
- No calendar write.
- No training on customer content.
- No raw secrets in LLM prompts.

## Model Policy

Use a provider abstraction:

- `deepseek`: default base URL `https://api.deepseek.com`, key `DEEPSEEK_API_KEY`.
- `qwen`: default base URL `https://dashscope.aliyuncs.com/compatible-mode/v1`, key `QWEN_API_KEY` or `DASHSCOPE_API_KEY`.
- `custom`: `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL`.

All providers are called through `/chat/completions` with JSON-only prompts where possible. If no model key is configured, return deterministic rule-based output so QA and CI remain stable.
