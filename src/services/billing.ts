/** Stripe Checkout + webhook (optional) */
import type { Env } from "../env";
import type { PlanId } from "../lib/plans";
import { findTeamByStripeSubscription, setTeamPlan } from "./api-key-store";

export function stripeConfigured(env: Env): boolean {
  return Boolean(env.STRIPE_SECRET_KEY?.trim() && env.STRIPE_PRICE_PRO?.trim());
}

/** Self-serve Stripe checkout: free → pro only */
export function canUpgradeViaStripe(plan: PlanId): boolean {
  return plan === "free";
}

export async function createCheckoutSession(
  env: Env,
  input: { teamId: string; successUrl: string; cancelUrl: string }
): Promise<{ url: string; sessionId: string }> {
  const secret = env.STRIPE_SECRET_KEY!.trim();
  const price = env.STRIPE_PRICE_PRO!.trim();

  const body = new URLSearchParams({
    mode: "subscription",
    "line_items[0][price]": price,
    "line_items[0][quantity]": "1",
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    client_reference_id: input.teamId,
    "metadata[team_id]": input.teamId,
  });

  const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  const data = (await res.json()) as {
    url?: string;
    id?: string;
    error?: { message?: string };
  };
  if (!res.ok || !data.url) {
    throw new Error(data.error?.message ?? `Stripe ${res.status}`);
  }
  return { url: data.url, sessionId: data.id! };
}

export async function createBillingPortalSession(
  env: Env,
  input: { customerId: string; returnUrl: string }
): Promise<{ url: string }> {
  const secret = env.STRIPE_SECRET_KEY!.trim();
  const body = new URLSearchParams({
    customer: input.customerId,
    return_url: input.returnUrl,
  });

  const res = await fetch("https://api.stripe.com/v1/billing_portal/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  const data = (await res.json()) as {
    url?: string;
    error?: { message?: string };
  };
  if (!res.ok || !data.url) {
    throw new Error(data.error?.message ?? `Stripe ${res.status}`);
  }
  return { url: data.url };
}

export async function handleStripeWebhook(
  env: Env,
  payload: string,
  signatureHeader: string | undefined
): Promise<void> {
  const secret = env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!secret) throw new Error("stripe_webhook_not_configured");

  const ok = await verifyStripeSignature(payload, signatureHeader, secret);
  if (!ok) throw new Error("invalid_stripe_signature");

  const event = JSON.parse(payload) as {
    type: string;
    data: { object: Record<string, unknown> };
  };

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;
      const teamId =
        (session.client_reference_id as string) ||
        (session.metadata as { team_id?: string })?.team_id;
      if (teamId) {
        await setTeamPlan(env, teamId, "pro", {
          customerId: session.customer as string | undefined,
          subscriptionId: session.subscription as string | undefined,
        });
      }
      break;
    }
    case "customer.subscription.deleted":
    case "customer.subscription.updated": {
      const sub = event.data.object;
      const subId = sub.id as string;
      const status = sub.status as string;
      const team = await findTeamByStripeSubscription(env, subId);
      if (!team) break;
      const inactive = status === "canceled" || status === "unpaid" || status === "incomplete_expired";
      if (event.type === "customer.subscription.deleted" || inactive) {
        await setTeamPlan(env, team.id, "free", { subscriptionId: null });
      }
      break;
    }
    default:
      break;
  }
}

async function verifyStripeSignature(
  payload: string,
  header: string | undefined,
  secret: string
): Promise<boolean> {
  if (!header) return false;
  const parts: Record<string, string> = {};
  for (const piece of header.split(",")) {
    const [k, v] = piece.split("=");
    if (k && v) parts[k.trim()] = v.trim();
  }
  const t = parts.t;
  const v1 = parts.v1;
  if (!t || !v1) return false;

  const keyBytes = secret.startsWith("whsec_")
    ? base64ToBytes(secret.slice(6))
    : new TextEncoder().encode(secret);

  const expected = await hmacSha256Hex(keyBytes, `${t}.${payload}`);
  return timingSafeEqualHex(v1, expected);
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function hmacSha256Hex(key: Uint8Array, message: string): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    cryptoKey,
    new TextEncoder().encode(message)
  );
  return [...new Uint8Array(sig)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
