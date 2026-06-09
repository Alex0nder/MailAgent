# Distribution status

Single source of truth for catalogs and install paths. **Install works today** — merge PRs are visibility only.

Last automated check: CI `check:catalog-prs` (weekly) · discovery: `GET /v1/agent` → `distribution`

## Adoption (QA pilots)

| Asset | Path |
|-------|------|
| Playwright starter | [examples/qa-pilot-starter](../examples/qa-pilot-starter) |
| Cypress starter | [examples/qa-pilot-cypress-starter](../examples/qa-pilot-cypress-starter) |
| 30-min guide | [QA-PILOT.md](./QA-PILOT.md) |
| Validate key | `npm run wizard:qa-pilot` |

## Install (live)

| Channel | Command |
|---------|---------|
| Agent skill | `npx skills add Alex0nder/MailAgent --skill mailagent` |
| Pinned release | `gh skill install Alex0nder/MailAgent mailagent --pin skills-0.2.5` |
| Codex marketplace | `codex plugin marketplace add Alex0nder/MailAgent` → `codex plugin install mailagent` |
| MCP npm | `npx -y -p @mailagent/mcp@latest mailagent-mcp` |
| REST SDK | `npm i @mailagent/agent @mailagent/qa` |

## Curated catalogs (pending maintainer merge)

| Catalog | PR | State |
|---------|-----|--------|
| [awesome-codex-plugins](https://github.com/hashgraph-online/awesome-codex-plugins) | [#195](https://github.com/hashgraph-online/awesome-codex-plugins/pull/195) | run `npm run check:catalog-prs` |
| [awesome-agent-skills](https://github.com/VoltAgent/awesome-agent-skills) | [#659](https://github.com/VoltAgent/awesome-agent-skills/pull/659) | run `npm run check:catalog-prs` |

```bash
npm run check:catalog-prs
```

## Blocked on external parties

| Item | Blocker | Prep doc |
|------|---------|----------|
| Codex Plugin Directory | OpenAI self-serve | [CODEX-DIRECTORY-SUBMIT.md](./CODEX-DIRECTORY-SUBMIT.md) |
| Agent Skill Hub search | Hub OAuth / their GitHub API | [SKILLS-SUBMIT.md](./SKILLS-SUBMIT.md) |
| Stripe Pro + SLA live | Stripe account | [STRIPE-SETUP.md](./STRIPE-SETUP.md) |
| Pentest report | Third-party vendor | [PENTEST-PREP.md](./PENTEST-PREP.md) |
| SOC 2 Type II | Formal audit | [SOC2.md](./SOC2.md) |

## Operator-only (optional)

See [YOUR-TURN.md](./YOUR-TURN.md) — Skill Hub import, Stripe deploy. Not required for agents.

## Repo automation

| Workflow | Purpose |
|----------|---------|
| [security-baseline.yml](../.github/workflows/security-baseline.yml) | `doctor:security` |
| [hol-plugin-scanner.yml](../.github/workflows/hol-plugin-scanner.yml) | Codex catalog score |
| [deploy-worker.yml](../.github/workflows/deploy-worker.yml) | prod deploy + `test:prod:gate` |

Roadmap freeze: [ROADMAP.md](./ROADMAP.md) v0.60+.
