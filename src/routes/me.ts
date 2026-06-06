/** Профиль ключа: план, лимиты, usage */
import { Hono } from "hono";
import type { Env } from "../env";
import type { ApiVariables } from "../lib/api-context";
import { requireApiKey } from "../lib/auth";
import { rateLimit } from "../lib/rate-limit";
import { PLAN_LIMITS } from "../lib/plans";
import { stripeConfigured } from "../services/billing";
import { getTeamBilling } from "../services/api-key-store";
import { getScopedUsage } from "../services/console-stats";
import { outboundCapabilities } from "../lib/outbound-capabilities";

export const meRoutes = new Hono<{ Bindings: Env; Variables: ApiVariables }>();

meRoutes.use("*", requireApiKey);
meRoutes.use("*", rateLimit);

meRoutes.get("/", async (c) => {
  const hint = c.get("apiKeyHint");
  const plan = c.get("apiPlan");
  const teamId = c.get("teamId");
  const limits = PLAN_LIMITS[plan];
  const usageRaw = await getScopedUsage(c.env, {
    teamId,
    apiKeyHint: hint,
    plan,
  });

  let canManagePortal = false;
  if (teamId && stripeConfigured(c.env)) {
    const bill = await getTeamBilling(c.env, teamId);
    canManagePortal = Boolean(bill?.stripe_customer_id);
  }

  return c.json({
    plan,
    teamId: c.get("teamId"),
    apiKeyId: c.get("apiKeyId"),
    scope: c.get("apiKeyScope"),
    limits: {
      rateLimitPerMinute: limits.rateLimitPerMinute,
      maxActiveInboxes: limits.maxActiveInboxes,
      maxTeamKeys: limits.maxTeamKeys,
      maxCustomDomains: limits.maxCustomDomains,
    },
    usage: {
      activeInboxes: usageRaw.activeInboxes,
      inboxesRemaining: Math.max(
        0,
        limits.maxActiveInboxes - usageRaw.activeInboxes
      ),
      customDomains: usageRaw.customDomains,
      domainsRemaining: Math.max(
        0,
        limits.maxCustomDomains - usageRaw.customDomains
      ),
      teamKeys: usageRaw.teamKeys,
      messagesLast24h: usageRaw.messagesLast24h,
    },
    billing: {
      stripeEnabled: stripeConfigured(c.env) && Boolean(teamId),
      canUpgrade: stripeConfigured(c.env) && Boolean(teamId) && plan !== "pro",
      canManagePortal,
      checkoutPath: "/v1/billing/checkout",
      portalPath: "/v1/billing/portal",
      consolePath: "/v1/console/summary",
    },
    capabilities: {
      outbound: outboundCapabilities(c.env),
    },
  });
});
