# Callback cookbook (QA / CI)

Async alternative to poll: MailAgent sends `POST` to your `callbackUrl` when the message is processed.

## When to use

| Poll (`/wait`) | Callback |
|----------------|----------|
| Simple E2E, single flow | Parallel tests, long flow |
| No public URL | smee.io / staging hook / webhook.site |
| Playwright default | Custom runner waits for HTTP event |

## 1. Public URL in dev

### smee.io (recommended locally)

```bash
npx smee -u https://smee.io/YOUR_CHANNEL -t http://127.0.0.1:9999/mailagent
```

In another terminal — simple listener (Node):

```javascript
// scripts/callback-listener.mjs
import http from "node:http";
const pending = new Map();

http.createServer((req, res) => {
  if (req.method !== "POST" || req.url !== "/mailagent") {
    res.writeHead(404);
    res.end();
    return;
  }
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    const data = JSON.parse(body);
    pending.set(data.inboxId, data);
    console.log("callback", data.inboxId, data.otp ?? data.primaryLink);
    res.writeHead(200);
    res.end("ok");
  });
}).listen(9999, () => console.log("listening :9999/mailagent"));

export function waitCallback(inboxId, timeoutMs = 120_000) {
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    const iv = setInterval(() => {
      if (pending.has(inboxId)) {
        clearInterval(iv);
        resolve(pending.get(inboxId));
        pending.delete(inboxId);
      } else if (Date.now() - t0 > timeoutMs) {
        clearInterval(iv);
        reject(new Error("callback timeout"));
      }
    }, 500);
  });
}
```

Public URL for MailAgent: `https://smee.io/YOUR_CHANNEL` (smee proxies to localhost).

### webhook.site (quick manual test)

1. Open https://webhook.site → copy unique URL.
2. `callbackUrl: "https://webhook.site/xxxx-..."` on create inbox.
3. Trigger mail → view payload in UI.
4. For autotests webhook.site is awkward — prefer smee or your own endpoint.

## 2. Create inbox with callback

```bash
CALLBACK="https://smee.io/YOUR_CHANNEL"

curl -sS -X POST "$MAILAGENT_API_URL/v1/inboxes" \
  -H "Authorization: Bearer $MAILAGENT_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"label\":\"cb-test\",\"callbackUrl\":\"$CALLBACK\",\"service\":\"auth0\"}"
```

Webhook body:

```json
{
  "event": "message.received",
  "inboxId": "abc-123",
  "id": "msg-id",
  "otp": "482910",
  "primaryLink": "https://...",
  "from": "noreply@auth0.com",
  "subject": "Verify your email",
  "verification": {
    "otp": "482910",
    "primaryLink": "https://...",
    "links": ["https://..."],
    "from": "noreply@auth0.com",
    "subject": "Verify your email",
    "messageId": "msg-id",
    "hasRaw": true,
    "rawUrl": "/v1/inboxes/abc-123/messages/msg-id/raw"
  }
}
```

`verification` field — ready block for CI assert (like `GET /extract`).

## 3. Assert in test (poll API logs)

If webhook did not arrive — check delivery:

```bash
curl -sS "$MAILAGENT_API_URL/v1/inboxes/INBOX_ID/callbacks" \
  -H "Authorization: Bearer $MAILAGENT_API_KEY" | jq .
```

Fields: `deliveries[].ok`, `statusCode`, `error`, `durationMs`.

### SDK: `waitForCallback` (@mailagent/qa ≥0.1.9)

When inbox has `callbackUrl` but test does not listen to webhook directly — poll delivery log:

```typescript
import { createMailAgentQa, MailAgentQa } from "@mailagent/qa";

const mail = createMailAgentQa();
const since = new Date();

const inbox = await mail.createInbox({
  label: MailAgentQa.ciLabel(),
  service: "auth0",
  callbackUrl: "https://smee.io/YOUR_CHANNEL",
});

// ... signup with inbox.address ...

const { verification, delivery } = await mail.waitForCallback(inbox.id, {
  since,
  timeoutSeconds: 120,
});

expect(verification.otp).toMatch(/^\d+$/);
console.log("callback ok", delivery.statusCode);
```

Cypress: `cy.task("mailagentWaitCallback", { inboxId })`.

## 4. GitHub Actions

Public URL in GHA without smee is harder. Options:

1. **Poll** — `waitForVerification` / `GET /wait` (simpler).
2. **Self-hosted runner** + ngrok/smee on same machine.
3. **Staging hook** in your app that writes OTP to artifact / Redis — callback hits there.

Poll-only job example: [examples/github-actions/qa-email.yml](../examples/github-actions/qa-email.yml).

## 5. Callback debug checklist

- [ ] URL **HTTPS** (http rejected on create)
- [ ] Endpoint responds **2xx** within &lt; 10s
- [ ] Firewall does not block outbound from Cloudflare Workers
- [ ] `GET …/callbacks` — `ok: false` → check `statusCode` / `error`
- [ ] UI: [debug.html](https://webmailagent.com/debug.html) → inbox id

See [QA.md](./QA.md#callback-webhook-in-ci).
