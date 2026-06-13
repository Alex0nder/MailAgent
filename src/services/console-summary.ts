/** Hosted console: aggregated summary for dashboard UI */
import type { Env } from "../env";
import type { ApiKeyScope } from "../lib/key-scope";
import { isRestrictedScope } from "../lib/key-scope";
import type { PlanId } from "../lib/plans";
import { PLAN_LIMITS } from "../lib/plans";
import {
  getTeam,
  getTeamBilling,
  listTeamKeys,
} from "./api-key-store";
import { listDomains } from "./domains";
import { listInboxes } from "./inbox";
import { getScopedUsage } from "./console-stats";
import { listAuditEvents, auditRetentionDays } from "./audit-log";
import { listRecentThreadsForScope } from "./console-threads";
import { outboundCapabilities } from "../lib/outbound-capabilities";
import { canUpgradeViaStripe, stripeConfigured } from "./billing";
import { getDedicatedResendStatus } from "./team-resend";
import { getRateLimitUsage } from "../lib/rate-limit-usage";
import { getTeamEventWebhook } from "./team-event-webhook";

export async function buildConsoleSummary(
  env: Env,
  input: {
    apiKeyHint: string;
    teamId: string | null;
    apiKeyId: string | null;
    plan: PlanId;
    scope: ApiKeyScope;
  }
) {
  const limits = PLAN_LIMITS[input.plan];
  const usageRaw = await getScopedUsage(env, {
    teamId: input.teamId,
    apiKeyHint: input.apiKeyHint,
    plan: input.plan,
  });

  const usage = {
    activeInboxes: usageRaw.activeInboxes,
    inboxesRemaining: Math.max(0, limits.maxActiveInboxes - usageRaw.activeInboxes),
    customDomains: usageRaw.customDomains,
    domainsRemaining: Math.max(0, limits.maxCustomDomains - usageRaw.customDomains),
    teamKeys: usageRaw.teamKeys,
    teamKeysRemaining: input.teamId
      ? Math.max(0, limits.maxTeamKeys - usageRaw.teamKeys)
      : null,
    messagesLast24h: usageRaw.messagesLast24h,
    notifyEmailsLast24h: usageRaw.notifyEmailsLast24h,
    notifyEmailsRemaining: Math.max(
      0,
      limits.notifyEmailsPerDay - usageRaw.notifyEmailsLast24h
    ),
  };

  const recentInboxes = await listInboxes(env, {
    limit: 8,
    apiKeyHint: input.apiKeyHint,
  });

  const domains = await listDomains(env, {
    teamId: input.teamId,
    apiKeyHint: input.apiKeyHint,
    plan: input.plan,
  });

  const recentAudit = await listAuditEvents(
    env,
    { teamId: input.teamId, apiKeyHint: input.apiKeyHint },
    { limit: 10 }
  );

  const recentThreads = await listRecentThreadsForScope(
    env,
    { teamId: input.teamId, apiKeyHint: input.apiKeyHint },
    { limit: 12 }
  );

  let team: {
    id: string;
    name: string;
    plan: string;
    canManageKeys: boolean;
    keys: {
      id: string;
      hint: string;
      label: string | null;
      createdAt: string;
      current: boolean;
      scope: { labelPrefix: string | null; readOnly: boolean };
    }[];
  } | null = null;

  let billing = {
    stripeEnabled: false,
    canUpgrade: false,
    canManagePortal: false,
    checkoutPath: "/v1/billing/checkout",
    portalPath: "/v1/billing/portal",
    subscriptionId: null as string | null,
  };

  if (input.teamId) {
    const teamRow = await getTeam(env, input.teamId);
    const keys = await listTeamKeys(env, input.teamId);
    const bill = await getTeamBilling(env, input.teamId);
    const stripeOn = stripeConfigured(env);

    billing = {
      stripeEnabled: stripeOn,
      canUpgrade: stripeOn && canUpgradeViaStripe(input.plan),
      canManagePortal: stripeOn && Boolean(bill?.stripe_customer_id),
      checkoutPath: "/v1/billing/checkout",
      portalPath: "/v1/billing/portal",
      subscriptionId: bill?.stripe_subscription_id ?? null,
    };

    if (teamRow) {
      team = {
        id: teamRow.id,
        name: teamRow.name,
        plan: teamRow.plan,
        canManageKeys: !isRestrictedScope(input.scope),
        keys: keys.map((k) => ({
          id: k.id,
          hint: k.key_hint,
          label: k.label,
          createdAt: k.created_at,
          current: k.id === input.apiKeyId,
          scope: {
            labelPrefix: k.scope_label_prefix,
            readOnly: k.scope_read_only,
          },
        })),
      };
    }
  }

  const rateLimit = await getRateLimitUsage(
    env,
    input.apiKeyHint,
    limits.rateLimitPerMinute
  );

  const teamWebhook =
    input.teamId ? await getTeamEventWebhook(env, input.teamId) : null;

  return {
    plan: input.plan,
    teamId: input.teamId,
    apiKeyId: input.apiKeyId,
    scope: input.scope,
    rateLimit,
    teamWebhook,
    limits: {
      rateLimitPerMinute: limits.rateLimitPerMinute,
      maxActiveInboxes: limits.maxActiveInboxes,
      maxTeamKeys: limits.maxTeamKeys,
      maxCustomDomains: limits.maxCustomDomains,
      notifyEmailsPerDay: limits.notifyEmailsPerDay,
      dedicatedResend: limits.dedicatedResend,
    },
    dedicatedResend: input.teamId
      ? await getDedicatedResendStatus(env, input.teamId)
      : null,
    usage,
    billing,
    recentInboxes: recentInboxes.map((i) => ({
      id: i.id,
      address: i.address,
      label: i.label,
      expiresAt: i.expires_at,
      createdAt: i.created_at,
      consoleUrl: `/console-inbox.html?inbox=${i.id}`,
      debugUrl: `/debug.html?inbox=${i.id}`,
    })),
    domains: domains.map((d) => ({
      id: d.id,
      name: d.name,
      status: d.status,
      verifiedAt: d.verifiedAt,
    })),
    recentAudit,
    recentThreads,
    policies: {
      auditRetentionDays: auditRetentionDays(env),
    },
    capabilities: {
      outbound: await outboundCapabilities(env, {
        teamId: input.teamId,
        plan: input.plan,
      }),
    },
    team,
    links: {
      debug: "/debug.html",
      agentRuns: "/agent-runs.html",
      audit: "/audit.html",
      docsBilling: "/docs/BILLING.html",
      docsEnterprise: "/docs/enterprise.html",
    },
  };
}
