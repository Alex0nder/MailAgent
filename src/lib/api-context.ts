import type { PlanId } from "./plans";

/** Hono context после Bearer-auth */
export type ApiVariables = {
  apiKeyHint: string;
  apiPlan: PlanId;
  rateLimitPerMinute: number;
  maxActiveInboxes: number;
  teamId: string | null;
  apiKeyId: string | null;
};
