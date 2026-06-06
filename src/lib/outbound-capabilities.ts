/** Outbound send status for API discovery (console / agents) */
import type { Env } from "../env";

export function outboundCapabilities(env: Env) {
  const enabled = Boolean(env.RESEND_API_KEY?.trim());
  return {
    enabled,
    verifiedFrom: Boolean(env.OUTBOUND_FROM?.trim()),
    hint: enabled
      ? env.OUTBOUND_FROM?.trim()
        ? null
        : "Set OUTBOUND_FROM on the Worker for a verified send domain"
      : "Resend not configured on API",
  };
}
