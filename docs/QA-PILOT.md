# QA pilot — 30-minute setup

Connect a test repo (Playwright, Cypress, or curl) to hosted MailAgent in ~30 minutes.

**Prerequisite:** API key — [dashboard](https://webmailagent.com/dashboard.html) or `npm run issue:key:db` (MailAgent operators).

## 0. Fastest path — copy starter (10 min)

```bash
cp -R examples/qa-pilot-starter /path/to/your-test-repo/mailagent-qa
cd /path/to/your-test-repo/mailagent-qa
cp .env.example .env   # MAILAGENT_API_KEY
npm install && npm test
```

Or open:

- Playwright: [examples/qa-pilot-starter](../examples/qa-pilot-starter)
- Cypress: [examples/qa-pilot-cypress-starter](../examples/qa-pilot-cypress-starter)

MailAgent CI: `npm run test:qa-pilot-starter` · `npm run test:qa-pilot-cypress-starter`.

## 1. Validate (5 min)

```bash
export MAILAGENT_API_URL=https://api.webmailagent.com
export MAILAGENT_API_KEY=ma_…   # or mak_… team key

npm run wizard:qa-pilot
```

Runs `doctor:qa` + `smoke:qa` (simulate flow, no real SMTP).

## 2. CI secrets (5 min)

In your **test repo** → Settings → Secrets:

| Secret | Value |
|--------|--------|
| `MAILAGENT_API_URL` | `https://api.webmailagent.com` |
| `MAILAGENT_API_KEY` | scoped key, `labelPrefix: ci-` recommended |

Starter already includes workflow. Alternatives:

- [qa-email.yml](../examples/github-actions/qa-email.yml) — full E2E
- [qa-simulate-only.yml](../examples/github-actions/qa-simulate-only.yml) — inline node script

## 3. Real signup E2E (after simulate works)

Starter includes `tests/signup-staging.spec.ts` + `mailagent.fixture.ts`:

```bash
# .env
APP_SIGNUP_URL=https://your-staging.app/signup
npm run test:staging
```

Skipped in CI until you add `APP_SIGNUP_URL` as a secret. Match `service` preset to your mail sender — [QA-PRESETS.md](./QA-PRESETS.md).

**curl one-shot** (after staging sends mail):

```bash
curl -sS -X POST "$MAILAGENT_API_URL/v1/inboxes/open" \
  -H "Authorization: Bearer $MAILAGENT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"label":"ci-'"$GITHUB_RUN_ID"'","service":"auth0","subjectContains":"verify","timeoutSeconds":120}'
```

## 4. Conventions

| Practice | Why |
|----------|-----|
| `label: ci-$GITHUB_RUN_ID` | isolate parallel jobs |
| `service` preset or `expectFrom` | sender allowlist |
| `subjectContains` | avoid wrong message |
| `deleteAfter: false` while debugging | keep inbox for `/debug.html` |
| `DELETE /v1/inboxes?labelPrefix=ci-` after nightly | quota cleanup |

## 5. Pilot checklist

- [ ] `wizard:qa-pilot` green locally
- [ ] CI secrets set in test repo
- [ ] Staging sends from allowed domain (or use simulate examples first)
- [ ] `label` unique per job
- [ ] On failure → `/debug.html?inbox=` or `GET /v1/inboxes?label=`
- [ ] `smoke:qa` green after MailAgent deploy (operators)

## 6. Success metrics

| Metric | Target |
|--------|--------|
| Flaky email step | < 2% |
| Wait p95 | < 90 s |
| Debug time | < 5 min |
| New repo setup | < 30 min |

## More

- [QA-ONBOARDING.md](./QA-ONBOARDING.md) — team keys  
- [QA-TROUBLESHOOTING.md](./QA-TROUBLESHOOTING.md) — timeouts  
- [QA-PRESETS.md](./QA-PRESETS.md) — `service` matrix  
- [public/docs/qa.html](https://webmailagent.com/docs/qa.html)

Discovery: `GET /v1/agent` → `tests` · `distribution`
