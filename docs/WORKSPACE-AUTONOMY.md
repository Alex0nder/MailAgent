# Workspace Agent autonomy

Workspace Agent can draft and execute replies to messages already stored in a MailAgent inbox. Autonomous sending is disabled by default and cannot be enabled by a scoped run key.

## Modes

| Mode | Behavior |
|------|----------|
| `draft_only` | Default. Drafts and dry runs only; every send is denied. |
| `auto_send_safe` | Replies only to allowlisted domains, requires LLM mode, high confidence, no risks/missing context, and hourly capacity. |
| `full_auto` | Replies to stored inbound messages using the configured confidence threshold and optional domain allowlist. |

All modes reject automated `no-reply` recipients. Rule-based fallback drafts are never sent automatically.

## Configure

An unrestricted team/admin key is required:

```bash
curl -X PUT "$MAILAGENT_API_URL/v1/workspace/policy" \
  -H "Authorization: Bearer $MAILAGENT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "mode": "auto_send_safe",
    "allowedRecipientDomains": ["company.com"],
    "minConfidence": "high",
    "maxSendsPerHour": 5
  }'
```

MCP: `mailagent_workspace_get_policy` and admin-only `mailagent_workspace_set_policy`.

## Model readiness

`GET /v1/workspace/models` and MCP `mailagent_workspace_model_status` expose secret-free readiness and fallback priority. DeepSeek and Qwen automatically fall back to each other when both keys are configured. An unrestricted admin may run `POST /v1/workspace/models/probe` for a live JSON-completion check.

Provider-specific model overrides: `DEEPSEEK_MODEL` (default `deepseek-v4-flash`) and `QWEN_MODEL` (default `qwen-turbo`). `LLM_MODEL` remains the primary/custom override.

**Local dev (no cloud API):** `WORKSPACE_LLM_PROVIDER=local` with Ollama or LM Studio — see [WORKSPACE-LOCAL-LLM.md](./WORKSPACE-LOCAL-LLM.md). Not available on prod Cloudflare Worker.

## Execute

Run a dry evaluation first:

```json
{
  "inboxId": "inb_...",
  "messageId": "msg_...",
  "instruction": "Confirm the QA review is complete without new commitments.",
  "dryRun": true
}
```

For a real attempt, remove `dryRun` and add a stable `idempotencyKey`. The server loads the stored inbound message, creates the draft through DeepSeek/Qwen, applies the persisted policy, and sends at most once. Reusing the same key returns the original execution and never sends again.

MCP: `mailagent_workspace_execute_reply`.

Successful execution records a `sent` action and completes the supplied `reminderId`. Denials and failures are persisted for audit/debugging.

## Immutable guardrails

- Default policy is `draft_only`.
- Scoped keys cannot change policy.
- Real sends require idempotency.
- Reply context must be a stored inbound message accessible to the current key.
- Rule fallback is never auto-sent.
- `auto_send_safe` requires an explicit recipient-domain allowlist and high confidence.
- Existing outbound domain/Resend restrictions still apply.
