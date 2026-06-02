# CI alerts: Slack + PR comments

Когда email-шаг падает в nightly или PR, команда должна быстро увидеть inbox id и debug UI.

## Label convention

В тестах используйте label с префиксом run id:

```typescript
import { MailAgentQa } from "@mailagent/qa";

const label = MailAgentQa.ciLabel(); // ci-{GITHUB_RUN_ID}-0-{timestamp}
await mail.createInbox({ label, service: "auth0" });
```

Cleanup после job: `DELETE /v1/inboxes?labelPrefix=ci-$GITHUB_RUN_ID`

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

Или из кода:

```typescript
import { notifySlackOnMailFailure, formatSlackMailFailure } from "@mailagent/qa/notify";

const ctx = await mail.getDebugContext(inbox.id);
await notifySlackOnMailFailure(process.env.MAILAGENT_SLACK_WEBHOOK, [ctx], {
  workflow: "nightly-e2e",
  runUrl: "...",
});
```

## PR comment

На `pull_request` тот же скрипт постит комментарий через `gh pr comment`, если есть `GITHUB_TOKEN` / `GH_TOKEN`.

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

Комментарий содержит:

- inbox id и address
- ссылку на [debug.html](https://webmailagent.com/debug.html)
- список messages (from, subject)
- ссылку на workflow run

## Screenshot (optional)

Playwright при падении:

```typescript
await page.screenshot({ path: "test-results/failure.png", fullPage: true });
```

Прикрепите артефакт в workflow:

```yaml
- uses: actions/upload-artifact@v4
  if: failure()
  with:
    name: playwright-failure
    path: test-results/
```

Ссылку на artifact можно добавить в PR body вручную или расширить `ci-mailagent-alerts.mjs`.

## API: list by prefix

```bash
curl -sS "$MAILAGENT_API_URL/v1/inboxes?labelPrefix=ci-12345" \
  -H "Authorization: Bearer $MAILAGENT_API_KEY" | jq .
```

См. [examples/github-actions/qa-email.yml](../examples/github-actions/qa-email.yml).
