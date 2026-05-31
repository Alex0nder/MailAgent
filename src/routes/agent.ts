/** REST для AI-агентов: verify + recipes */
import { Hono } from "hono";
import type { Env } from "../env";
import type { ApiVariables } from "../lib/api-context";
import { requireApiKey } from "../lib/auth";
import { rateLimit } from "../lib/rate-limit";
import {
  getAgentRecipe,
  listAgentRecipes,
} from "../lib/agent-recipes";
import { SERVICE_EXPECT_FROM } from "../lib/service-presets";
import { runAgentVerify } from "../services/agent-verify";
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
  timeoutSeconds?: number;
  deleteAfter?: boolean;
  runId?: string;
};

agentRoutes.get("/", (c) => {
  return c.json({
    name: "MailAgent Agent API",
    version: "0.3.0",
    recommended: {
      verify: { method: "POST", path: "/v1/agent/verify" },
      oneShot: { method: "POST", path: "/v1/inboxes/open" },
    },
    mcpTools: [
      "mailagent_verify_signup",
      "mailagent_wait_and_extract",
      "mailagent_create_inbox",
      "mailagent_wait_for_message",
      "mailagent_extract_verification",
    ],
    services: Object.keys(SERVICE_EXPECT_FROM),
    recipes: "/v1/agent/recipes",
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

agentRoutes.post("/verify", async (c) => {
  let body: VerifyBody = {};
  try {
    body = await c.req.json();
  } catch {
    body = {};
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
  });

  if ("error" in result && result.error === "invalid_callback_url") {
    return c.json(result, 400);
  }
  if ("error" in result && result.error === "inbox_not_found") {
    return c.json(result, 404);
  }
  if (result.status === "timeout") {
    return c.json(result, 408);
  }

  return c.json(result, result.statusCode);
});
