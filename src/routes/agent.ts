/** REST для AI-агентов: verify + recipes */
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
import { MCP_TOOL_NAMES } from "../mcp/manifest";
import {
  countActiveInboxesForHint,
  countActiveInboxesForTeam,
} from "../services/inbox";

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
  return c.json({
    name: "MailAgent Agent API",
    version: "0.7.0",
    recommended: {
      verify: { method: "POST", path: "/v1/agent/verify" },
      oneShot: { method: "POST", path: "/v1/inboxes/open" },
      rawMessage: {
        method: "GET",
        path: "/v1/inboxes/:id/messages/:messageId/raw",
      },
    },
    mcpTools: MCP_TOOL_NAMES,
    services: Object.keys(SERVICE_EXPECT_FROM),
    recipes: "/v1/agent/recipes",
    runs: "GET /v1/agent/runs",
    remoteMcp: {
      endpoint: "POST /mcp",
      streamableHttp: "Mcp-Session-Id on initialize",
      sse: "GET /mcp",
      oauth: {
        token: "POST /v1/oauth/token",
        discovery: "/.well-known/oauth-protected-resource/mcp",
      },
      auth: "GET /mcp/auth",
    },
    docs: "https://webmailagent.com/docs/agents.html",
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

/** Активные прогоны агентов (label agent-*) */
agentRoutes.get("/runs", async (c) => {
  const limit = Number(c.req.query("limit") ?? "30");
  const runId = c.req.query("runId") ?? undefined;
  const runs = await listAgentRuns(c.env, c.get("apiKeyHint"), {
    limit,
    runId,
  });
  return c.json({ runs });
});

agentRoutes.get("/runs/:runId", async (c) => {
  const runs = await listAgentRuns(c.env, c.get("apiKeyHint"), {
    runId: c.req.param("runId"),
    limit: 50,
  });
  const run = runs[0];
  if (!run) return c.json({ error: "run_not_found" }, 404);
  return c.json(run);
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
  if (result.status === "timeout") {
    return c.json(result, 408);
  }

  return c.json(result, result.statusCode);
});
