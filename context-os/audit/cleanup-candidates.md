# Cleanup Candidates — MailAgent

**Классификация only.** Ничего не удалено. Требует human review перед любым действием.

## Дубликаты контента

| Category | Locations | Notes |
|----------|-----------|-------|
| Agent Skill | `skills/mailagent/SKILL.md`, `.cursor/skills/mailagent-mcp/SKILL.md`, `examples/codex/plugin/skills/mailagent/SKILL.md` | Sync via `npm run sync:skills` — intentional copies, not dead |
| Service presets | `src/lib/service-presets.ts`, `mcp/src/service-presets.ts` | Duplicate enum — drift risk |
| Docs MD vs HTML | `docs/*.md` ↔ `public/docs/*.html` | Generated/mirrored for site — keep both if site deploys from public/ |
| README vs SETUP vs docs | Overlapping setup instructions | README summary, SETUP detail — consolidate links only |
| AGENTS.md vs docs/AUTOTESTS.md | Test command matrix duplicated | AGENTS is agent entry; AUTOTESTS is full guide |

## Устаревшие / historical документы (проверить актуальность)

| File | Signal |
|------|--------|
| `docs/YOUR-TURN.md` | Operator checklist — may stale after setup done |
| `docs/DISTRIBUTION-STATUS.md` | Catalog PR status — time-sensitive |
| `docs/QA-ROADMAP.md` | Roadmap items may be completed (check ROADMAP.md) |
| `docs/HOSTING-CLOUDFLARE.md` | References Netlify migration — verify if complete |
| `README.md` "Moving from Netlify" | May be historical |

## Потенциальный dead code (низкий приоритет — verify usage)

| Item | Reason |
|------|--------|
| `scripts/prepare-catalog-pr.mjs` | One-time catalog submission helper |
| `scripts/prepare-skills-pr.mjs` | One-time PR helper |
| `scripts/import-skill-hub.mjs` | Import utility — rare use |
| `scripts/check-catalog-prs.mjs` | External PR status checker |
| `public/debug.html` | Debug UI — prod exposure review |
| `examples/docker-compose.mailpit.yml` | Alternative to Resend — docs/QA-LOCAL-SMTP.md overlap |

**Not dead (confirmed used):** All `contract-qa*.mjs` referenced in package.json; all `src/routes/*` mounted in index.ts.

## Неиспользуемые / redundant config candidates

| Item | Notes |
|------|-------|
| `.env.example` + `.dev.vars.example` | Both needed (MCP vs Worker) — not redundant |
| Multiple `playwright.*.config.ts` in examples | Intentional variants |

## Test / example sprawl

| Area | Count | Recommendation class |
|------|-------|---------------------|
| `examples/playwright/*.example.ts` | 6+ | Keep as templates — not production code |
| `contract-qa*.mjs` | 14 scripts | Keep — each covers distinct API surface |
| `examples/qa-pilot-*` | 2 starters | Product distribution — keep |

## Documentation overlap matrix

| Topic | Primary | Secondary (could link only) |
|-------|---------|----------------------------|
| MCP setup | README § MCP | docs/CODEX.md, mcp/README.md |
| QA | docs/QA.md | docs/QA-PILOT.md, examples/ |
| Security | docs/PENTEST-PREP.md | public/docs/security.html |
| Operator | docs/OPERATOR.md | docs/OPERATOR-ACCESS.md, YOUR-TURN.md |

## Files safe to exclude from AI context (not delete)

- `package-lock.json`, `*/package-lock.json` — lockfiles
- `public/*.png`, `public/*.svg` — binary assets
- `examples/*/node_modules/` — if present
- Generated `mcp/dist/`, `packages/*/dist/` — build output (git may track)

## Priority for cleanup review

1. **High:** Service presets duplication (`src` vs `mcp`) — drift risk
2. **Medium:** Historical Netlify migration docs
3. **Low:** One-time catalog/skills PR scripts after PRs merged
4. **Low:** SKILL.md triple-copy — automated sync exists
