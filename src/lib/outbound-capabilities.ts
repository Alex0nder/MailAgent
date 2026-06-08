/** Outbound send status for API discovery (console / agents) */
import type { Env } from "../env";
import type { PlanId } from "./plans";
import { teamHasDedicatedResend } from "../services/team-resend";

export type OutboundCapabilities = {
  enabled: boolean;
  verifiedFrom: boolean;
  dedicatedResend?: boolean;
  hint: string | null;
};

export async function outboundCapabilities(
  env: Env,
  scope?: { teamId: string | null; plan: PlanId }
): Promise<OutboundCapabilities> {
  if (scope?.teamId) {
    const dedicated = await teamHasDedicatedResend(env, scope.teamId);
    if (dedicated) {
      return {
        enabled: true,
        verifiedFrom: true,
        dedicatedResend: true,
        hint: "Send from custom-domain inbox addresses via team Resend",
      };
    }
  }

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
