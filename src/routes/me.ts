/** Профиль ключа: план, лимиты, usage */
import { Hono } from "hono";
import type { Env } from "../env";
import type { ApiVariables } from "../lib/api-context";
import { requireApiKey } from "../lib/auth";
import { rateLimit } from "../lib/rate-limit";
import { PLAN_LIMITS } from "../lib/plans";
import { countActiveInboxesForHint, countActiveInboxesForTeam } from "../services/inbox";

export const meRoutes = new Hono<{ Bindings: Env; Variables: ApiVariables }>();

meRoutes.use("*", requireApiKey);
meRoutes.use("*", rateLimit);

meRoutes.get("/", async (c) => {
  const hint = c.get("apiKeyHint");
  const plan = c.get("apiPlan");
  const teamId = c.get("teamId");
  const limits = PLAN_LIMITS[plan];
  const activeInboxes = teamId
    ? await countActiveInboxesForTeam(c.env, teamId)
    : await countActiveInboxesForHint(c.env, hint);

  return c.json({
    plan,
    teamId: c.get("teamId"),
    apiKeyId: c.get("apiKeyId"),
    limits: {
      rateLimitPerMinute: limits.rateLimitPerMinute,
      maxActiveInboxes: limits.maxActiveInboxes,
    },
    usage: {
      activeInboxes,
      inboxesRemaining: Math.max(0, limits.maxActiveInboxes - activeInboxes),
    },
    billing: {
      stripeEnabled: Boolean(
        c.env.STRIPE_SECRET_KEY && c.env.STRIPE_PRICE_PRO && c.get("teamId")
      ),
      checkoutPath: "/v1/billing/checkout",
    },
  });
});
