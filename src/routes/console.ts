/** Hosted SaaS console API */
import { Hono } from "hono";
import type { Env } from "../env";
import type { ApiVariables } from "../lib/api-context";
import { requireApiKey } from "../lib/auth";
import { rateLimit } from "../lib/rate-limit";
import { buildConsoleSummary } from "../services/console-summary";

export const consoleRoutes = new Hono<{ Bindings: Env; Variables: ApiVariables }>();

consoleRoutes.use("*", requireApiKey);
consoleRoutes.use("*", rateLimit);

consoleRoutes.get("/summary", async (c) => {
  const summary = await buildConsoleSummary(c.env, {
    apiKeyHint: c.get("apiKeyHint"),
    teamId: c.get("teamId"),
    apiKeyId: c.get("apiKeyId"),
    plan: c.get("apiPlan"),
    scope: c.get("apiKeyScope"),
  });
  return c.json(summary);
});
