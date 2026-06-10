# QA Pilot #1 — operator runbook

Onboard an external test repo onto hosted MailAgent (Stripe on hold). Consumer guide: [QA-PILOT.md](./QA-PILOT.md).

## Operator checklist

| # | Task | Command / link |
|---|------|----------------|
| 1 | Baseline green | `npm run wizard:qa-pilot` |
| 2 | Issue scoped pilot key | `npm run issue:pilot-key -- <pilot-slug>` (needs `DATABASE_URL`) |
| 3 | Send pilot package | section below → Slack/email |
| 4 | They green CI | `npm test` in copied starter |
| 5 | Staging E2E | `APP_SIGNUP_URL` + `service` preset |
| 6 | Collect feedback | [Feedback](#feedback) → backlog v0.70 |

Full wizard (smoke + print package):

```bash
npm run wizard:qa-pilot:onboard
npm run wizard:qa-pilot:onboard -- --issue-key acme-pilot   # also mint key
```

## Issue pilot key

Scoped to `labelPrefix=ci-` (recommended for CI isolation):

```bash
# requires DATABASE_URL in .env
npm run issue:pilot-key -- acme-pilot
```

Save the `ma_…` token once. Optional plan bump: `npm run team:plan -- TEAM_ID pro`.

Dashboard alternative: [dashboard.html](https://webmailagent.com/dashboard.html) → team keys.

## Pilot package (copy to external team)

```text
MailAgent QA pilot — ~30 min setup

1. Copy starter into your test repo:
   https://github.com/Alex0nder/MailAgent/tree/main/examples/qa-pilot-starter

   cp -R mailagent/examples/qa-pilot-starter ./mailagent-qa && cd mailagent-qa

2. Local:
   cp .env.example .env
   # MAILAGENT_API_KEY=<we send separately>
   npm install && npm test

3. GitHub Actions secrets (your repo → Settings → Secrets):
   MAILAGENT_API_KEY = <scoped key>
   (optional later) APP_SIGNUP_URL = https://your-staging.app/signup

4. Conventions:
   - label: ci-$GITHUB_RUN_ID per job
   - match `service` preset to your mail sender (auth0, github, …)

Docs: https://webmailagent.com/docs/qa.html
Troubleshooting: https://webmailagent.com/docs/qa-troubleshooting.html (timeouts → diagnose)
```

Cypress track: [qa-pilot-cypress-starter](../examples/qa-pilot-cypress-starter).

## Feedback

After simulate + (optional) staging E2E, ask the pilot team:

| # | Question | Target |
|---|----------|--------|
| 1 | Minutes from clone to green CI? | < 30 |
| 2 | Where did you get stuck? | docs / preset / allowlist / timeout |
| 3 | Flaky on email step? | < 2% runs |
| 4 | Missing API or MCP tool? | backlog v0.70 |
| 5 | Playwright vs Cypress preference? | starter priority |

Record answers in a GitHub issue titled `pilot: <team> feedback` or paste into chat — then triage into [ROADMAP.md](./ROADMAP.md) v0.70.

## Success metrics

From [QA-ROADMAP.md](./QA-ROADMAP.md):

| Metric | Target |
|--------|--------|
| Flaky email step | < 2% |
| Wait p95 | < 90 s |
| Debug time | < 5 min |
| New repo setup | < 30 min |

## After pilot #1

- Pilot #2 (second team or Cypress starter)
- Triage feedback → product tasks
- Then Context OS Phase 2 ([ROADMAP.md](./ROADMAP.md) v0.70)
