# Duplicate Docs — MailAgent

Пары документов с пересекающимся содержанием. **Не удалять** без проверки pipeline публикации на webmailagent.com.

## MD ↔ HTML mirrors (site docs)

| Markdown (`docs/`) | HTML (`public/docs/`) |
|--------------------|----------------------|
| (agents content) | `agents.html` |
| AGENT-SKILLS.md | `agent-skills.html` |
| ATTACHMENTS.md | `attachments.html` |
| RAW-MIME-R2.md | `raw-mime.html` |
| SCOPED-API-KEYS.md | `scoped-keys.html` |
| DEDICATED-DOMAINS.md | `dedicated-domains.html` |
| SLA.md | `sla.html` |
| MCP-OAUTH-IDP.md | `oauth-idp.html` |
| TEAMS.md | `teams.html` |
| (outbound) | `outbound.html` |
| (custom domain) | `custom-domain.html` |
| (security) | `security.html` (also PENTEST-PREP overlap) |

**Relationship:** HTML likely hand-maintained or built for static site. Drift risk if only MD updated.

## Setup / onboarding overlap

| Primary | Overlaps with |
|---------|---------------|
| README.md § Quick start | SETUP.md (full), .dev.vars.example |
| SETUP.md | docs/HOSTING-CLOUDFLARE.md (domain routing) |
| docs/OPERATOR.md | docs/YOUR-TURN.md, docs/OPERATOR-ACCESS.md |
| docs/QA.md | docs/QA-ONBOARDING.md, docs/QA-PILOT.md |
| docs/INTEGRATE.md | README § MCP, docs/CODEX.md |

## Agent / MCP overlap

| Primary | Overlaps with |
|---------|---------------|
| AGENTS.md | docs/AUTOTESTS.md (test commands) |
| skills/mailagent/SKILL.md | .cursor/skills/mailagent-mcp/SKILL.md, examples/codex/plugin/skills/ |
| docs/CODEX.md | examples/codex/README.md, examples/codex/plugin/README.md |
| mcp/README.md | README § MCP, docs/MCP-OAUTH.md |
| src/mcp/manifest.ts | AGENTS.md tool list, GET /v1/agent |

**Source of truth for MCP tools:** `src/mcp/manifest.ts` → `GET /v1/agent`.

## QA overlap

| Primary | Overlaps with |
|---------|---------------|
| docs/QA.md | docs/QA-SIMULATE.md, docs/QA-CALLBACK.md, docs/QA-TROUBLESHOOTING.md |
| docs/AUTOTESTS.md | AGENTS.md test matrix |
| docs/QA-RELEASE.md | docs/CI.md |
| packages/mailagent-qa/README.md | docs/QA.md Playwright section |

## Platform / roadmap overlap

| Primary | Overlaps with |
|---------|---------------|
| docs/ROADMAP.md | docs/QA-ROADMAP.md, README § Next |
| docs/V1-PLATFORM.md | docs/TEAMS.md, docs/BILLING.md |
| docs/BILLING.md | docs/STRIPE-SETUP.md |

## Distribution / meta docs

| File | Overlap |
|------|---------|
| docs/DISTRIBUTION-STATUS.md | docs/CATALOG-SUBMIT.md, docs/CODEX-DIRECTORY-SUBMIT.md, docs/SKILLS-SUBMIT.md |
| docs/PUBLISH.md | docs/CI.md § publish |

## Recommended canonical sources (for Context OS)

| Topic | Canonical file |
|-------|----------------|
| Product purpose | README.md + business-core |
| Agent autonomy | AGENTS.md |
| API endpoints | src/openapi/spec.ts + api-core |
| MCP tools | src/mcp/manifest.ts |
| Setup | SETUP.md |
| CI | docs/CI.md |
| QA flows | docs/QA.md |
| Troubleshooting | docs/QA-TROUBLESHOOTING.md |
| Security scope | docs/PENTEST-PREP.md |
| Agent skill | skills/mailagent/SKILL.md |

## Drift detection commands

```bash
npm run verify:skills      # SKILL.md copies in sync
npm run verify:codex       # Codex plugin scaffold
npm run doctor:security    # trust + audit
```
