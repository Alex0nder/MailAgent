# MCP progress notifications

Long-running wait tools emit **`notifications/progress`** while polling for email.

## Wait tools

- `mailagent_verify_signup`
- `mailagent_wait_and_extract`
- `mailagent_wait_for_message`

## Streaming POST (recommended)

Send `Accept: application/json, text/event-stream` on `tools/call`:

```bash
curl -N -X POST https://api.webmailagent.com/mcp \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept: application/json, text/event-stream" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc":"2.0",
    "id": 2,
    "method":"tools/call",
    "params":{
      "name":"mailagent_wait_for_message",
      "arguments":{"inboxId":"INBOX_ID","timeoutSeconds":60}
    }
  }'
```

SSE stream:

```
event: message
data: {"jsonrpc":"2.0","method":"notifications/progress","params":{"progressToken":"…","progress":0,"total":60,"message":"Waiting for email (0/60s)…","status":"waiting",…}}

event: message
data: {"jsonrpc":"2.0","id":2,"result":{…}}
```

## Session GET channel

With `Mcp-Session-Id` from `initialize`, open parallel GET SSE:

```bash
curl -N https://api.webmailagent.com/mcp \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept: text/event-stream" \
  -H "Mcp-Session-Id: $SESSION"
```

Progress from streaming `tools/call` is **also pushed** to this channel (KV relay).

## Progress params

| Field | Meaning |
|-------|---------|
| `progressToken` | inbox id |
| `progress` | elapsed seconds |
| `total` | timeout seconds |
| `message` | human status |
| `status` | `waiting` \| `received` |
| `data.percent` | 0–100 |

## Initialize capability

```json
"capabilities": { "tools": {}, "progress": true }
```

См. [agents.html](https://webmailagent.com/docs/agents.html#mcp-progress).
