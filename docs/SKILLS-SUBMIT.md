# Submit MailAgent to Agent Skills catalogs

Canonical skill: [`skills/mailagent/SKILL.md`](../skills/mailagent/SKILL.md)

## Install paths (live today)

```bash
npx skills add Alex0nder/MailAgent --skill mailagent
gh skill install Alex0nder/MailAgent mailagent --agent codex
```

After edits: `npm run sync:skills` · `npm run verify:skills`

## GitHub `gh skill publish` (recommended)

Validation uses the same layout as install (`skills/mailagent/SKILL.md`).

```bash
gh skill publish --dry-run   # validate only
gh skill publish --tag skills-0.2.5   # release tag (published on MailAgent repo)
gh skill install Alex0nder/MailAgent mailagent --pin skills-0.2.5
```

Staging entry for awesome-agent-skills PR:

```bash
npm run prepare:skills-pr
# → dist/skills-staging/README-ENTRY.md
```

Optional hardening (warnings from `gh skill publish`):

```bash
gh repo edit Alex0nder/MailAgent --add-topic agent-skills
gh repo edit --enable-secret-scanning
gh repo edit --enable-secret-scanning-push-protection
```

## Agent Skill Hub (agentskillhub.dev)

1. Push public repo with `skills/mailagent/SKILL.md`
2. Import at [agentskillhub.dev](https://agentskillhub.dev) → paste `https://github.com/Alex0nder/MailAgent`
3. Re-import after skill updates

API: `POST /api/v1/repos/analyze` then `POST /api/v1/repos/import` — see their docs.

## Curated awesome lists (optional PR)

| Catalog | Fit | Notes |
|---------|-----|--------|
| [VoltAgent/awesome-agent-skills](https://github.com/VoltAgent/awesome-agent-skills) | ✅ verification / QA | [PR #659](https://github.com/VoltAgent/awesome-agent-skills/pull/659) submitted |
| [membranedev/application-skills](https://github.com/membranedev/application-skills) | ❌ post-login SaaS integrations | Use Membrane skills after MailAgent verify |

## Not the same as Codex plugin directory

- **Skill** — `skills/mailagent/` (this doc)
- **Codex plugin** — `examples/codex/plugin/` + [CATALOG-SUBMIT.md](./CATALOG-SUBMIT.md)

Official Codex Plugin Directory also needs [privacy.html](https://webmailagent.com/privacy.html) and [terms.html](https://webmailagent.com/terms.html) in `plugin.json` — see [CODEX.md](./CODEX.md).
