# Agent-native PBR

Product backlog requirements for making MailAgent easier for autonomous agents, Cursor/Codex workflows, and QA bots. Stripe stays on hold.

## Goal

Reduce agent dead ends during signup, login, password reset, invite, and magic-link flows. The API should tell the agent what happened, what to try next, and which payload to retry with.

## Success metrics

| Metric | Target |
|--------|--------|
| Timeout debug time | < 5 min |
| Agent can choose next step without human OTP check | 95%+ failures |
| Wrong OTP/link selection | < 1% known scenario runs |
| New agent flow setup | < 15 min |

## PBR-1 — Failure recovery hints

**Problem:** `diagnose` returns useful clues, but agents still need to infer whether to wait, change `subjectContains`, adjust `messageIndex`, inspect callbacks, or simulate a retry.

**Requirement:** Extend `GET /v1/inboxes/:id/diagnose` and `mailagent_diagnose_inbox` with additive machine-readable fields:

| Field | Purpose |
|-------|---------|
| `failureSummary` | Stable reason code and concise explanation |
| `recommendedAction` | One best next step with confidence |
| `retry` | Ready-to-use wait/simulate payloads |
| `nextActions` | Ordered alternatives for agents and humans |

**Acceptance:**

- Existing diagnose response remains backward compatible.
- No-message timeout returns `failureSummary.code = "no_messages"` and a wait retry payload.
- Subject mismatch returns `subject_filter_no_match`.
- High `messageIndex` returns `message_index_too_high`.
- Callback failures return `callback_failed` when callback logs fail.
- `smoke:qa` asserts recovery fields exist.

## PBR-2 — Verification confidence

**Status:** implemented.

Add confidence metadata to extracted verification:

| Field | Purpose |
|-------|---------|
| `confidence` | `high`, `medium`, or `low` |
| `matchedRule` | Which rule chose OTP/link |
| `alternatives` | Other plausible OTPs/links |
| `reason` | Short explanation for agent logs |

Acceptance: verify/open/wait-and-extract responses expose confidence without breaking existing `otp` and `primaryLink`.

## PBR-3 — Agent flow templates

**Status:** implemented.

Expose recipes for common flows:

- `signup`
- `login_2fa`
- `password_reset`
- `invite_accept`
- `magic_link_login`

Acceptance: `GET /v1/agent`, `GET /v1/agent/flows`, and MCP docs expose flow templates with subject hints, expected sender hints, recommended timeouts, and recovery strategy.

## PBR-4 — Run timeline

Add an agent-readable timeline for a `runId`:

- inbox created
- wait started
- message received
- extraction success/failure
- callback/notify delivery
- diagnose run

Acceptance: API and console can show the timeline for a run without agents scraping logs.

## PBR-5 — Auto-cleanup policies

Add inbox lifecycle options:

- `deleteAfterSuccess`
- `deleteAfterMinutes`
- `keepOnFailure`
- label-prefix cleanup helpers

Acceptance: QA starters can keep failed inboxes and auto-delete successful runs.

## PBR-6 — Agent-safe HTML actions

Return sanitized CTA/action candidates from email HTML:

- `buttons[]`
- `primaryButton`
- `visibleText`
- filtered noise links

Acceptance: agents can choose "Verify email" or "Reset password" without parsing raw HTML.

## Priority

1. PBR-1 Failure recovery hints
2. PBR-2 Verification confidence
3. PBR-3 Agent flow templates
4. PBR-4 Run timeline
5. PBR-5 Auto-cleanup policies
6. PBR-6 Agent-safe HTML actions
