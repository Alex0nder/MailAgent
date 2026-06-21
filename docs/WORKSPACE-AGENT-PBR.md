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
| 6b | Load thread from MailAgent inbox (`inboxId` / `messageId`) for summarize/draft/reminders | done |

Done when: an agent can pass `inboxId` (or paste messages) and get summary, action items, draft reply, and reminder suggestions without connecting Gmail.

## P0.5 — MailAgent inbox as mail source (no Gmail yet)

| # | Feature | Status |
|---|---------|--------|
| 6b | `inboxId` + optional `threadId` / `messageId` on workspace summarize/draft/reminder suggest | done |
| 6c | `GET /v1/workspace/calendar/status` (read-only roadmap stub; writes disabled) | done |

## P1 — Gmail Read Connector

| # | Feature | Status |
|---|---------|--------|
| 7 | OAuth account connection with least-privilege Gmail read scopes | done |
| 8 | Thread search/list/read via Gmail API | done |
| 8b | Workspace summarize/draft/reminders via `gmailAccountId` + `gmailThreadId` | done |
| 9 | Daily digest and unread triage | done |
| 10 | "Needs reply" and "waiting on them" classifiers | done |
| 11 | Per-team retention controls | done |

Done when: connected user can ask for unread summaries and reply-needed list without write scopes.

## P2 — Calendar Read Connector

| # | Feature | Status |
|---|---------|--------|
| 12 | Google Calendar read scopes | done |
| 13 | Availability windows and conflict detection | done |
| 14 | Meeting-time suggestions from email thread context | done |
| 15 | Daily agenda digest | done |

Done when: the agent can propose meeting slots from calendar availability without writing events.

## P3 — Approval-Based Write Actions

| # | Feature | Status |
|---|---------|--------|
| 16 | Draft creation in Gmail | done |
| 17 | Policy-gated idempotent reply from a MailAgent inbox | done |
| 18 | Create/update calendar events only after approval | done |
| 19 | Audit/action log for policy, send, denial, and failure | done |
| 20 | Team kill switch (`draft_only`) for all Workspace writes | done |

Done when: a team can safely enable write actions with approval gates and auditability.

## P4 — Autonomous Rules

| # | Feature | Status |
|---|---------|--------|
| 21 | Rule engine: invoices, support, meetings, follow-ups | done |
| 22 | Scheduled reminders and monitors | done |
| 23 | Slack/email digests | done |
| 24 | Admin policy: mode, recipient domains, confidence, hourly limit | done |

Done when: teams can run low-risk automations without prompt-by-prompt babysitting.

## Non-Goals For MVP

- Gmail send remains disabled; P3 allows **draft** creation in Gmail with compose OAuth + admin policy.
- No autonomous sending unless an admin explicitly enables a persisted policy.
- Calendar event writes require `calendarEventWrites` policy + events OAuth; no autonomous booking.
- No training on customer content.
- No raw secrets in LLM prompts.

## Model Policy

Use a provider abstraction:

- `deepseek`: default base URL `https://api.deepseek.com`, key `DEEPSEEK_API_KEY`, model `deepseek-v4-flash` (override `DEEPSEEK_MODEL`; legacy alias `deepseek-chat` still works).
- `qwen`: default base URL `https://dashscope.aliyuncs.com/compatible-mode/v1`, key `QWEN_API_KEY` or `DASHSCOPE_API_KEY`, model `qwen-turbo` (override `QWEN_MODEL`).
- `custom`: `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL`.

All providers are called through `/chat/completions` with JSON-only prompts where possible. If no model key is configured, return deterministic rule-based output so QA and CI remain stable.
