# MailAgent for QA / E2E

Temporary inbox in CI: signup, OTP, magic link — without shared mailboxes and manual checks.

## Tester pain → how we solve it

| Pain | Solution |
|------|---------|
| Shared test@company.com — races, other people's mail | **Inbox per test** (`label` = CI run id) |
| Wait 60–120 s for mail in test | **POST /v1/inboxes/open** — one call |
| Flaky: mail arrived, poll missed it | **SSE** + poll; optional **callbackUrl** |
| Need OTP / link, not HTML parsing | **verification.otp**, **primaryLink**, **primaryButton** |
| Test failed — what's in inbox? | **GET /v1/inboxes?label=...** + messages |
| Mail not from staging | **expectFrom** / **service** allowlist |

## Quick scenario (CI)

```bash
export MAILAGENT_API_URL=https://api.webmailagent.com
export MAILAGENT_API_KEY=your_key
export RUN_ID="${GITHUB_RUN_ID:-local-$(date +%s)}"

# 1. Create inbox and wait for mail
RESULT=$(curl -sS -X POST "$MAILAGENT_API_URL/v1/inboxes/open" \
  -H "Authorization: Bearer $MAILAGENT_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"label\": \"ci-$RUN_ID\",
    \"service\": \"auth0\",
    \"subjectContains\": \"verification\",
    \"timeoutSeconds\": 120,
    \"deleteAfter\": false
  }")

echo "$RESULT" | jq .
OTP=$(echo "$RESULT" | jq -r '.verification.otp')
LINK=$(echo "$RESULT" | jq -r '.verification.primaryLink')
BUTTON_TEXT=$(echo "$RESULT" | jq -r '.verification.primaryButton.text // empty')
ADDRESS=$(echo "$RESULT" | jq -r '.address')

# 2. Put $ADDRESS in signup form in Playwright/Cypress
# 3. If open was called BEFORE form submit — wait separately:
# curl "$MAILAGENT_API_URL/v1/inboxes/$INBOX_ID/wait?timeout=120&subjectContains=code"
```

## Playwright (`@mailagent/qa`)

```bash
npm run build:qa   # in MailAgent repo
# in test project:
npm install file:../MailAgent/packages/mailagent-qa
```

```typescript
import { test, expect } from "@playwright/test";
import { createMailAgentQa, MailAgentQa } from "@mailagent/qa";

const mail = createMailAgentQa();

test("signup with email verify", async ({ page }) => {
  const inbox = await mail.createInbox({
    label: MailAgentQa.runLabel("signup"),
    service: "auth0",
  });

  await page.goto("/signup");
  await page.fill('[name=email]', inbox.address);
  await page.click('button[type=submit]');

  const verification = await mail.waitForVerification(inbox.id, {
    subjectContains: "verify",
    timeoutSeconds: 120,
  });

  if (verification.otp) {
    await page.fill('[name=code]', verification.otp);
    await page.click('button[type=submit]');
  }

  await mail.deleteInbox(inbox.id);
});
```

Full example: [examples/playwright/signup-email.spec.example.ts](../examples/playwright/signup-email.spec.example.ts).

**Fixture:** [examples/playwright/mailagent.fixture.ts](../examples/playwright/mailagent.fixture.ts) — `testInbox` with auto-delete.

**CI:** [examples/github-actions/qa-email.yml](../examples/github-actions/qa-email.yml) — at end of job `DELETE /v1/inboxes?labelPrefix=ci-$RUN_ID`.

**Cleanup after suite:**

```typescript
// one prefix per CI run
const label = mail.runLabel(); // ci-1234567890-1
await mail.cleanupLabelPrefix(label.split("-").slice(0, 2).join("-")); // ci-1234567890
// or for GitHub Actions run id:
await mail.cleanupRun(process.env.GITHUB_RUN_ID!);
```

```bash
curl -X DELETE "$MAILAGENT_API_URL/v1/inboxes?labelPrefix=ci-$GITHUB_RUN_ID" \
  -H "Authorization: Bearer $MAILAGENT_API_KEY"
```

**QA roadmap:** [QA-ROADMAP.md](./QA-ROADMAP.md) — P0/P1/P2.

**More guides:**

- [QA-PRESETS.md](./QA-PRESETS.md) — `service` / `expectFrom` matrix
- [QA-CALLBACK.md](./QA-CALLBACK.md) — smee.io, webhook, `/callbacks`
- [QA-TROUBLESHOOTING.md](./QA-TROUBLESHOOTING.md) — timeout / OTP / webhook
- [QA-LOCAL-SMTP.md](./QA-LOCAL-SMTP.md) — Mailpit for local dev
- [QA-ONBOARDING.md](./QA-ONBOARDING.md) — separate QA key and team
- [QA-MIGRATION.md](./QA-MIGRATION.md) — Mailosaur / MailSlurp
- [QA-CI-ALERTS.md](./QA-CI-ALERTS.md) — Slack webhook, PR comment on failure
- Contract test without SMTP: `npm run test:contract:qa` (`MAILAGENT_API_KEY` only; `POST …/simulate` → wait/extract + `messageIndex`)
- Simulate without Resend: [QA-SIMULATE.md](./QA-SIMULATE.md) · `mail.simulateAndVerify()`
- Callback contract: `npm run test:contract:qa:callback` — simulate + `POST` to `callbackUrl` (default `https://httpbin.org/post`), poll `GET …/callbacks`
- Attachments contract: `npm run test:contract:qa:attachments` — simulate + `--with-attachment=…`, list/meta without Resend
- Simulate with callback: `node scripts/simulate-inbound.mjs <inboxId> <otp> <from> --fire-callback`
- Simulate with attachment: `… --with-attachment=invoice.pdf`
- Cypress: [examples/cypress/](../examples/cypress/)

### Playwright (raw fetch, no package)

```typescript
// tests/helpers/mailagent.ts — if not using @mailagent/qa
const API = process.env.MAILAGENT_API_URL!;
const KEY = process.env.MAILAGENT_API_KEY!;

export async function openTestInbox(opts: {
  label: string;
  service?: string;
  subjectContains?: string;
}) {
  const res = await fetch(`${API}/v1/inboxes/open`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      label: opts.label,
      service: opts.service ?? "auth0",
      subjectContains: opts.subjectContains,
      timeoutSeconds: 120,
      deleteAfter: false,
    }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<{
    address: string;
    verification: { otp: string | null; primaryLink: string | null };
  }>;
}

// legacy one-shot (open before submit — only if API waits after create)
test("signup with email verify (one-shot)", async ({ page }) => {
  const label = `pw-${test.info().parallelIndex}-${Date.now()}`;

  await page.goto("/signup");
  const { address } = await openTestInbox({ label, subjectContains: "verify" });

  await page.fill('[name=email]', address);
  await page.click('button[type=submit]');

  const { verification } = await openTestInbox({ label }); // prefer create → submit → wait
  if (verification.otp) {
    await page.fill('[name=code]', verification.otp);
  }
});
```

Recommended E2E order:

1. `POST /v1/inboxes` with `label` → get `address`
2. Fill form on staging
3. `GET /v1/inboxes/:id/wait?subjectContains=...` or `POST /open` only if mail is already on the way

## Callback (webhook in CI)

Full guide: [QA-CALLBACK.md](./QA-CALLBACK.md) (smee.io, webhook.site, `/callbacks` debug).

Brief — if you have a public URL (smee.io, ngrok, staging hook):

```json
{
  "label": "ci-123",
  "callbackUrl": "https://your-ci-hook.example/events",
  "service": "stripe"
}
```

On message MailAgent sends `POST` with body:

```json
{
  "event": "message.received",
  "inboxId": "...",
  "otp": "123456",
  "primaryLink": "https://...",
  "subject": "..."
}
```

## Debug after failure

```bash
curl -sS "$MAILAGENT_API_URL/v1/inboxes?label=ci-12345" \
  -H "Authorization: Bearer $MAILAGENT_API_KEY" | jq .

curl -sS "$MAILAGENT_API_URL/v1/inboxes/INBOX_ID/messages" \
  -H "Authorization: Bearer $MAILAGENT_API_KEY" | jq .
```

## API (QA fields)

| Field | Where | Purpose |
|------|-----|-------|
| `label` | create, open | run / worker id |
| `subjectContains` | open, wait | subject filter |
| `callbackUrl` | create, open | HTTPS webhook on message |
| `deleteAfter` | open | `false` — keep for debug |

### Rate limit (429)

When limit exceeded API returns headers:

| Header | Value |
|--------|----------|
| `X-RateLimit-Limit` | per-minute limit per key |
| `X-RateLimit-Remaining` | remaining in current minute |
| `X-RateLimit-Reset` | Unix sec, window end |
| `Retry-After` | seconds until retry (429 only) |

In SDK: `MailAgentRateLimitError` with `retryAfterSeconds`.

### TTL in CI

```bash
export QA_TTL_MINUTES=60   # @mailagent/qa uses in create/open if ttlMinutes not set
```

### Multiple messages in inbox

```bash
curl -sS "$MAILAGENT_API_URL/v1/inboxes/ID/messages?subjectContains=verify" \
  -H "Authorization: Bearer $KEY" | jq .
```

SDK: `mail.listMessages(inboxId, { subjectContains: "verify" })`.

### Retry on flaky wait

```typescript
await mail.waitWithRetry(inbox.id, { subjectContains: "verify" }, 3);
```

### CI failure artifact / reports

```typescript
import {
  formatFailureArtifactAttachment,
  writeFailureArtifact,
} from "@mailagent/qa";

const ctx = await mail.getDebugContext(inbox.id);
const artifact = formatFailureArtifactAttachment(ctx, {
  testName: testInfo.title,
  runId: process.env.GITHUB_RUN_ID,
});
await testInfo.attach(artifact.name, {
  body: artifact.body,
  contentType: artifact.contentType,
});
await writeFailureArtifact(ctx, { writeGitHubStepSummary: true });
```

Example: [examples/playwright/allure-on-failure.example.ts](../examples/playwright/allure-on-failure.example.ts).

### Migration from Mailosaur / MailSlurp

[QA-MIGRATION.md](./QA-MIGRATION.md)

### Callback log (webhook failed?)

```bash
curl -sS "$MAILAGENT_API_URL/v1/inboxes/INBOX_ID/callbacks" \
  -H "Authorization: Bearer $MAILAGENT_API_KEY" | jq .
```

Response: `deliveries[]` with `ok`, `statusCode`, `error`, `durationMs`. UI: [/debug.html](https://webmailagent.com/debug.html).

Migrations: `npm run db:migrate` (`003_qa_fields.sql`, `005_callback_deliveries.sql`).
