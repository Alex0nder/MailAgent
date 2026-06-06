/** Hosted plan limits */
export type PlanId = "free" | "pro" | "legacy";

export const PLAN_LIMITS: Record<
  PlanId,
  {
    rateLimitPerMinute: number;
    maxActiveInboxes: number;
    maxTeamKeys: number;
    maxCustomDomains: number;
  }
> = {
  free: {
    rateLimitPerMinute: 60,
    maxActiveInboxes: 10,
    maxTeamKeys: 5,
    maxCustomDomains: 1,
  },
  pro: {
    rateLimitPerMinute: 300,
    maxActiveInboxes: 100,
    maxTeamKeys: 20,
    maxCustomDomains: 10,
  },
  legacy: {
    rateLimitPerMinute: 120,
    maxActiveInboxes: 500,
    maxTeamKeys: 0,
    maxCustomDomains: 3,
  },
};

export function normalizePlan(raw: string | null | undefined): PlanId {
  if (raw === "pro") return "pro";
  if (raw === "legacy") return "legacy";
  return "free";
}
