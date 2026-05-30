/** Лимиты hosted-планов */
export type PlanId = "free" | "pro" | "legacy";

export const PLAN_LIMITS: Record<
  PlanId,
  { rateLimitPerMinute: number; maxActiveInboxes: number }
> = {
  free: { rateLimitPerMinute: 60, maxActiveInboxes: 10 },
  pro: { rateLimitPerMinute: 300, maxActiveInboxes: 100 },
  /** Ключи только из wrangler API_KEY / API_KEYS (без строки в api_keys) */
  legacy: { rateLimitPerMinute: 120, maxActiveInboxes: 500 },
};

export function normalizePlan(raw: string | null | undefined): PlanId {
  if (raw === "pro") return "pro";
  if (raw === "legacy") return "legacy";
  return "free";
}
