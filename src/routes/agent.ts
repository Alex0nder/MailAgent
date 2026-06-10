/** REST for AI agents: verify + recipes */
import { Hono } from "hono";
import type { Env } from "../env";
import type { ApiVariables } from "../lib/api-context";
import { requireApiKey } from "../lib/auth";
import { rateLimit } from "../lib/rate-limit";
import { resolveAgentLabel, getAgentRecipe, listAgentRecipes } from "../lib/agent-recipes";
import { scopeLabelForCreate, scopeWriteDenied } from "../lib/scope-guard";
import { SERVICE_EXPECT_FROM } from "../lib/service-presets";
import { runAgentVerify } from "../services/agent-verify";
import { listAgentRuns } from "../services/agent-runs";
import {
  getAgentRunSession,
  patchAgentRunSession,
  sessionOwnerKey,
} from "../services/agent-run-session";
import { validateRunId } from "../lib/validate-run-id";
import { MCP_TOOL_NAMES } from "../mcp/manifest";
import { isOidcEnabled } from "../services/oidc-oauth";
import {
  countActiveInboxesForHint,
  countActiveInboxesForTeam,
} from "../services/inbox";
import { NPM_PACKAGES } from "../lib/npm-versions";

export const agentRoutes = new Hono<{ Bindings: Env; Variables: ApiVariables }>();

agentRoutes.use("*", requireApiKey);
agentRoutes.use("*", rateLimit);

type VerifyBody = {
  inboxId?: string;
  ttlMinutes?: number;
  service?: string;
  expectFrom?: string | string[];
  allowedSenders?: string | string[];
  label?: string;
  callbackUrl?: string;
  subjectContains?: string;
  messageIndex?: number;
  timeoutSeconds?: number;
  deleteAfter?: boolean;
  runId?: string;
};

agentRoutes.get("/", (c) => {
  const oidc = isOidcEnabled(c.env);
  return c.json({
    name: "MailAgent Agent API",
    version: "0.8.1",
    auth: {
      oidc: oidc ? "enabled" : "disabled",
      me: "GET /v1/me",
      mcpAuth: "GET /mcp/auth",
      oidcDocs: oidc
        ? "https://webmailagent.com/docs/oauth-idp.html"
        : "https://webmailagent.com/docs/agents.html#mcp-oauth",
    },
    recommended: {
      verify: {
        method: "POST",
        path: "/v1/agent/verify",
        runSession: "pass runId → response includes session",
      },
      oneShot: { method: "POST", path: "/v1/inboxes/open" },
      rawMessage: {
        method: "GET",
        path: "/v1/inboxes/:id/messages/:messageId/raw",
      },
    },
    mcpTools: MCP_TOOL_NAMES,
    services: Object.keys(SERVICE_EXPECT_FROM),
    recipes: "/v1/agent/recipes",
    runs: {
      list: "GET /v1/agent/runs",
      detail: "GET /v1/agent/runs/:runId (includes session)",
      session: {
        get: "GET /v1/agent/runs/:runId/session",
        patch: "PATCH /v1/agent/runs/:runId/session",
      },
    },
    remoteMcp: {
      endpoint: "POST /mcp",
      streamableHttp: "Mcp-Session-Id on initialize (JWT, no KV when API_KEY set)",
      sse: "GET /mcp",
      oauth: {
        token: "POST /v1/oauth/token",
        discovery: "/.well-known/oauth-protected-resource/mcp",
      },
      auth: "GET /mcp/auth",
    },
    docs: "https://webmailagent.com/docs/agents.html",
    distribution: {
      status: "https://github.com/Alex0nder/MailAgent/blob/main/docs/DISTRIBUTION-STATUS.md",
      skill: {
        path: "skills/mailagent/SKILL.md",
        install: "npx skills add Alex0nder/MailAgent --skill mailagent",
        ghPin: "gh skill install Alex0nder/MailAgent mailagent --pin skills-0.2.5",
      },
      codex: {
        marketplace: "Alex0nder/MailAgent",
        plugin: "mailagent",
        catalogPr: "https://github.com/hashgraph-online/awesome-codex-plugins/pull/195",
      },
      skillsCatalogPr: "https://github.com/VoltAgent/awesome-agent-skills/pull/659",
    },
    packages: NPM_PACKAGES,
    console: "https://webmailagent.com/dashboard.html",
    billing: "https://webmailagent.com/docs/billing.html",
    enterprise: "https://webmailagent.com/docs/enterprise.html",
    security: "https://webmailagent.com/docs/security.html",
    privacy: "https://webmailagent.com/privacy.html",
    terms: "https://webmailagent.com/terms.html",
    dedicatedDomains: "https://webmailagent.com/docs/dedicated-domains.html",
    autotests: "https://webmailagent.com/docs/autotests.html",
    tests: {
      prodGateCi: "npm run test:prod:gate",
      prodGate: "npm run test:prod",
      env: ["MAILAGENT_API_URL", "MAILAGENT_API_KEY"],
      contractAll: "npm run test:contract:all",
      repoGuide: "https://github.com/Alex0nder/MailAgent/blob/main/docs/AUTOTESTS.md",
      qaPilot: "https://github.com/Alex0nder/MailAgent/blob/main/docs/QA-PILOT.md",
      qaPilotStarter: "https://github.com/Alex0nder/MailAgent/tree/main/examples/qa-pilot-starter",
      qaPilotCypressStarter:
        "https://github.com/Alex0nder/MailAgent/tree/main/examples/qa-pilot-cypress-starter",
      qaWizard: "npm run wizard:qa-pilot",
      smokeQa: "npm run smoke:qa",
    },
    cli: "npx @mailagent/mcp mailagent open --service github --json",
  });
});

agentRoutes.get("/recipes", (c) => {
  return c.json({ recipes: listAgentRecipes() });
});

agentRoutes.get("/recipes/:service", (c) => {
  const recipe = getAgentRecipe(c.req.param("service"));
  if (!recipe) return c.json({ error: "unknown_service" }, 404);
  return c.json(recipe);
});

/** Active agent runs (label agent-*) */
agentRoutes.get("/runs", async (c) => {
  const limit = Number(c.req.query("limit") ?? "30");
  const runId = c.req.query("runId") ?? undefined;
  const runs = await listAgentRuns(c.env, c.get("apiKeyHint"), {
    limit,
    runId,
  });
  return c.json({ runs });
});

agentRoutes.get("/runs/:runId/session", async (c) => {
  const runId = c.req.param("runId");
  if (!validateRunId(runId)) {
    return c.json({ error: "invalid_run_id" }, 400);
  }
  const owner = sessionOwnerKey(c.get("teamId"), c.get("apiKeyHint"));
  const session = await getAgentRunSession(c.env, runId, owner);
  if (!session) return c.json({ error: "session_not_found" }, 404);
  return c.json(session);
});

type SessionPatchBody = {
  merge?: Record<string, unknown>;
  replaceState?: Record<string, unknown>;
  step?: { name: string; data?: Record<string, unknown> };
};

agentRoutes.patch("/runs/:runId/session", async (c) => {
  const writeErr = scopeWriteDenied(c);
  if (writeErr) return writeErr;

  const runId = c.req.param("runId");
  if (!validateRunId(runId)) {
    return c.json({ error: "invalid_run_id" }, 400);
  }

  let body: SessionPatchBody = {};
  try {
    body = await c.req.json();
  } catch {
    body = {};
  }

  const owner = sessionOwnerKey(c.get("teamId"), c.get("apiKeyHint"));
  const result = await patchAgentRunSession(c.env, runId, owner, body);
  if (!result.ok) {
    return c.json({ error: result.error }, 400);
  }
  return c.json(result.session);
});

agentRoutes.get("/runs/:runId", async (c) => {
  const runId = c.req.param("runId");
  if (!validateRunId(runId)) {
    return c.json({ error: "invalid_run_id" }, 400);
  }
  const runs = await listAgentRuns(c.env, c.get("apiKeyHint"), {
    runId: c.req.param("runId"),
    limit: 50,
  });
  const run = runs[0];
  if (!run) return c.json({ error: "run_not_found" }, 404);
  const owner = sessionOwnerKey(c.get("teamId"), c.get("apiKeyHint"));
  const session = await getAgentRunSession(c.env, runId, owner);
  return c.json({ ...run, session: session ?? null });
});

agentRoutes.post("/verify", async (c) => {
  let body: VerifyBody = {};
  try {
    body = await c.req.json();
  } catch {
    body = {};
  }

  if (!body.inboxId) {
    const writeErr = scopeWriteDenied(c);
    if (writeErr) return writeErr;
    const agentLabel = resolveAgentLabel({
      label: body.label,
      runId: body.runId,
    });
    const labelCheck = scopeLabelForCreate(c, agentLabel);
    if (labelCheck instanceof Response) return labelCheck;
    body = { ...body, label: labelCheck.label ?? undefined };
  }

  if (!body.inboxId) {
    const teamId = c.get("teamId");
    const active = teamId
      ? await countActiveInboxesForTeam(c.env, teamId)
      : await countActiveInboxesForHint(c.env, c.get("apiKeyHint"));
    const max = c.get("maxActiveInboxes");
    if (active >= max) {
      return c.json(
        {
          error: "inbox_limit_reached",
          plan: c.get("apiPlan"),
          active,
          max,
        },
        429
      );
    }
  }

  const result = await runAgentVerify(c.env, {
    ...body,
    apiKeyHint: c.get("apiKeyHint"),
    teamId: c.get("teamId"),
  });

  if ("error" in result && result.error === "invalid_callback_url") {
    return c.json(result, 400);
  }
  if (
    "error" in result &&
    (result.error === "inbox_not_found" ||
      result.error === "domain_not_found")
  ) {
    return c.json(result, 404);
  }
  if (
    "error" in result &&
    (result.error === "domain_not_verified" ||
      result.error === "username_requires_domain")
  ) {
    return c.json(result, 400);
  }
  if ("status" in result && result.status === "timeout") {
    return c.json(result, 408);
  }

  return c.json(result, "statusCode" in result ? result.statusCode : 200);
});
