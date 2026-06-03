import type { PlanId } from "./plans";
import type { ApiKeyScope } from "./key-scope";

/** Hono context после Bearer-auth */
export type ApiVariables = {
  apiKeyHint: string;
  apiPlan: PlanId;
  rateLimitPerMinute: number;
  maxActiveInboxes: number;
  teamId: string | null;
  apiKeyId: string | null;
  apiKeyScope: ApiKeyScope;
};
