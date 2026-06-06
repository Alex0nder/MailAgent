/** Usage stats for hosted / self-host monitoring */
import { Hono } from "hono";
import type { Env } from "../env";
import type { ApiVariables } from "../lib/api-context";
import { requireApiKey } from "../lib/auth";
import { rateLimit } from "../lib/rate-limit";
import { allowedApiKeys } from "../lib/api-keys";
import { getUsageStats } from "../services/stats";

export const statsRoutes = new Hono<{ Bindings: Env; Variables: ApiVariables }>();

statsRoutes.use("*", requireApiKey);
statsRoutes.use("*", rateLimit);

statsRoutes.get("/", async (c) => {
  const usage = await getUsageStats(c.env);
  return c.json({
    ...usage,
    keysConfigured: allowedApiKeys(c.env).length,
    limits: {
      maxOpenTimeoutSeconds: 120,
      defaultTtlMinutes: Number(c.env.DEFAULT_TTL_MINUTES) || 30,
      rateLimitPerMinute: Number(c.env.RATE_LIMIT_PER_MINUTE) || 120,
      rateLimitEnabled: Boolean(c.env.RATE_LIMIT),
    },
  });
});
