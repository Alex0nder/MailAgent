# CI alerts: Slack + PR comments

When the email step fails in nightly or PR, the team should quickly see inbox id and debug UI.

## Label convention

In tests use label with run id prefix:

```typescript
import { MailAgentQa } from "@mailagent/qa";

const label = MailAgentQa.ciLabel(); // ci-{GITHUB_RUN_ID}-0-{timestamp}
await mail.createInbox({ label, service: "auth0" });
```

Cleanup after job: `DELETE /v1/inboxes?labelPrefix=ci-$GITHUB_RUN_ID`

## Slack (Incoming Webhook)

1. Slack → Apps → Incoming Webhooks → URL
2. GitHub secret: `MAILAGENT_SLACK_WEBHOOK`
3. Workflow step `if: failure()`:

```yaml
- name: MailAgent Slack alert
  if: failure()
  env:
    MAILAGENT_API_URL: ${{ secrets.MAILAGENT_API_URL }}
    MAILAGENT_API_KEY: ${{ secrets.MAILAGENT_API_KEY }}
    MAILAGENT_SLACK_WEBHOOK: ${{ secrets.MAILAGENT_SLACK_WEBHOOK }}
    GITHUB_RUN_ID: ${{ github.run_id }}
    GITHUB_WORKFLOW: ${{ github.workflow }}
    GITHUB_SERVER_URL: ${{ github.server_url }}
    GITHUB_REPOSITORY: ${{ github.repository }}
  run: npm run ci:mailagent-alerts
```

Or from code:

```typescript
import { notifySlackOnMailFailure, formatSlackMailFailure } from "@mailagent/qa/notify";

const ctx = await mail.getDebugContext(inbox.id);
await notifySlackOnMailFailure(process.env.MAILAGENT_SLACK_WEBHOOK, [ctx], {
  workflow: "nightly-e2e",
  runUrl: "...",
});
```

## Failure artifact

For each failed email step, write a safe artifact that GitHub Actions can upload
and append the human summary to the job page:

```typescript
import { writeFailureArtifact } from "@mailagent/qa";

const ctx = await mail.getDebugContext(inbox.id, { subjectContains: "verify" });
await writeFailureArtifact(ctx, {
  testName: "signup email",
  runId: process.env.GITHUB_RUN_ID,
  writeGitHubStepSummary: true,
});
```

Output defaults to `test-results/mailagent/<inbox>.mailagent-failure.json`.
OTP values and full magic links are redacted unless explicitly enabled.

## PR comment

On `pull_request` the same script posts a comment via `gh pr comment` if `GITHUB_TOKEN` / `GH_TOKEN` exists.

```yaml
permissions:
  pull-requests: write

- name: MailAgent PR debug comment
  if: failure() && github.event_name == 'pull_request'
  env:
    MAILAGENT_API_URL: ${{ secrets.MAILAGENT_API_URL }}
    MAILAGENT_API_KEY: ${{ secrets.MAILAGENT_API_KEY }}
    GITHUB_TOKEN: ${{ github.token }}
    GITHUB_EVENT_NAME: ${{ github.event_name }}
    GITHUB_EVENT_PATH: ${{ github.event_path }}
    GITHUB_RUN_ID: ${{ github.run_id }}
  run: npm run ci:mailagent-alerts
```

Comment includes:

- inbox id and address
- link to [debug.html](https://webmailagent.com/debug.html)
- message list (from, subject)
- link to workflow run

## Screenshot (optional)

Playwright on failure:

```typescript
await page.screenshot({ path: "test-results/failure.png", fullPage: true });
```

Attach artifact in workflow:

```yaml
- uses: actions/upload-artifact@v4
  if: failure()
  with:
    name: playwright-failure
    path: |
      test-results/
      test-results/mailagent/
```

Artifact link can be added to PR body manually or extend `ci-mailagent-alerts.mjs`.

## API: list by prefix

```bash
curl -sS "$MAILAGENT_API_URL/v1/inboxes?labelPrefix=ci-12345" \
  -H "Authorization: Bearer $MAILAGENT_API_KEY" | jq .
```

See [examples/github-actions/qa-email.yml](../examples/github-actions/qa-email.yml).
