/** Hosted plan limits */
export type PlanId = "free" | "pro" | "enterprise" | "legacy";

export const PLAN_LIMITS: Record<
  PlanId,
  {
    rateLimitPerMinute: number;
    maxActiveInboxes: number;
    maxTeamKeys: number;
    maxCustomDomains: number;
    notifyEmailsPerDay: number;
    dedicatedResend: boolean;
  }
> = {
  free: {
    rateLimitPerMinute: 60,
    maxActiveInboxes: 10,
    maxTeamKeys: 5,
    maxCustomDomains: 1,
    notifyEmailsPerDay: 20,
    dedicatedResend: false,
  },
  pro: {
    rateLimitPerMinute: 300,
    maxActiveInboxes: 100,
    maxTeamKeys: 20,
    maxCustomDomains: 10,
    notifyEmailsPerDay: 500,
    dedicatedResend: false,
  },
  enterprise: {
    rateLimitPerMinute: 600,
    maxActiveInboxes: 500,
    maxTeamKeys: 50,
    maxCustomDomains: 25,
    notifyEmailsPerDay: 5000,
    dedicatedResend: true,
  },
  legacy: {
    rateLimitPerMinute: 120,
    maxActiveInboxes: 500,
    maxTeamKeys: 0,
    maxCustomDomains: 3,
    notifyEmailsPerDay: 500,
    dedicatedResend: false,
  },
};

export function normalizePlan(raw: string | null | undefined): PlanId {
  if (raw === "pro") return "pro";
  if (raw === "enterprise") return "enterprise";
  if (raw === "legacy") return "legacy";
  return "free";
}
