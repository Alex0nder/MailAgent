/** Stripe Checkout для upgrade free → pro */
import { Hono } from "hono";
import type { Env } from "../env";
import type { ApiVariables } from "../lib/api-context";
import { requireApiKey } from "../lib/auth";
import { scopeAdminDenied } from "../lib/scope-guard";
import { rateLimit } from "../lib/rate-limit";
import {
  createBillingPortalSession,
  createCheckoutSession,
  stripeConfigured,
} from "../services/billing";
import { getTeamBilling } from "../services/api-key-store";

export const billingRoutes = new Hono<{ Bindings: Env; Variables: ApiVariables }>();

billingRoutes.use("*", requireApiKey);
billingRoutes.use("*", rateLimit);

billingRoutes.post("/checkout", async (c) => {
  const adminErr = scopeAdminDenied(c);
  if (adminErr) return adminErr;

  if (!stripeConfigured(c.env)) {
    return c.json({ error: "stripe_not_configured" }, 503);
  }

  const teamId = c.get("teamId");
  if (!teamId) {
    return c.json(
      {
        error: "billing_requires_registered_key",
        hint: "npm run issue:key -- --register",
      },
      400
    );
  }

  if (c.get("apiPlan") === "pro") {
    return c.json({ error: "already_pro" }, 400);
  }

  let body: { successUrl?: string; cancelUrl?: string } = {};
  try {
    body = await c.req.json();
  } catch {
    body = {};
  }

  const successUrl =
    body.successUrl ?? "https://webmailagent.com/dashboard.html?billing=success";
  const cancelUrl =
    body.cancelUrl ?? "https://webmailagent.com/dashboard.html?billing=cancel";

  try {
    const session = await createCheckoutSession(c.env, {
      teamId,
      successUrl,
      cancelUrl,
    });
    return c.json({ url: session.url, sessionId: session.sessionId });
  } catch (e) {
    const message = e instanceof Error ? e.message : "checkout_failed";
    return c.json({ error: "checkout_failed", message }, 502);
  }
});

billingRoutes.post("/portal", async (c) => {
  const adminErr = scopeAdminDenied(c);
  if (adminErr) return adminErr;

  if (!stripeConfigured(c.env)) {
    return c.json({ error: "stripe_not_configured" }, 503);
  }

  const teamId = c.get("teamId");
  if (!teamId) {
    return c.json(
      {
        error: "billing_requires_registered_key",
        hint: "npm run issue:key -- --register",
      },
      400
    );
  }

  const bill = await getTeamBilling(c.env, teamId);
  if (!bill?.stripe_customer_id) {
    return c.json({ error: "no_stripe_customer" }, 400);
  }

  let body: { returnUrl?: string } = {};
  try {
    body = await c.req.json();
  } catch {
    body = {};
  }

  const returnUrl =
    body.returnUrl ?? "https://webmailagent.com/dashboard.html?billing=portal";

  try {
    const session = await createBillingPortalSession(c.env, {
      customerId: bill.stripe_customer_id,
      returnUrl,
    });
    return c.json({ url: session.url });
  } catch (e) {
    const message = e instanceof Error ? e.message : "portal_failed";
    return c.json({ error: "portal_failed", message }, 502);
  }
});
