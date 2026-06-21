/** Run workspace monitors: rules + digests (P4.22–23). */
import type { Env } from "../env";
import { buildCalendarDailyAgenda } from "./calendar-workspace";
import { buildGmailDailyDigest, triageGmailInbox } from "./gmail-triage";
import { getWorkspaceAutonomyPolicy } from "./workspace-autonomy";
import { deliverWorkspaceDigest } from "./workspace-digest-deliver";
import {
  formatMonitor,
  listDueWorkspaceMonitors,
  markWorkspaceMonitorRun,
  monitorAuth,
  recordWorkspaceMonitorRun,
  type MonitorRow,
} from "./workspace-monitors";
import { evaluateThreadsAgainstRules, type WorkspaceRuleKind } from "./workspace-rule-engine";

export async function evaluateWorkspaceRulesForGmail(
  env: Env,
  auth: { teamId: string | null; apiKeyHint: string },
  input: {
    gmailAccountId: string;
    ruleKinds?: WorkspaceRuleKind[];
    unreadOnly?: boolean;
  }
) {
  const triage = await triageGmailInbox(env, auth, {
    accountId: input.gmailAccountId,
    unreadOnly: input.unreadOnly !== false,
  });
  if ("error" in triage) return triage;

  const threads = [
    ...triage.needsReply,
    ...triage.waitingOnThem,
    ...triage.buckets.fyi,
    ...triage.buckets.automated,
  ].map((thread) => ({
    threadId: thread.threadId,
    subject: thread.subject,
    snippet: thread.snippet,
    disposition: thread.disposition,
    from: thread.lastFrom,
  }));

  const hits = evaluateThreadsAgainstRules({
    threads,
    enabledKinds: input.ruleKinds,
  });

  return {
    accountId: input.gmailAccountId,
    generatedAt: new Date().toISOString(),
    scanned: threads.length,
    hits,
    byKind: hits.reduce<Record<string, number>>((acc, hit) => {
      acc[hit.match.kind] = (acc[hit.match.kind] ?? 0) + 1;
      return acc;
    }, {}),
  };
}

async function runSingleMonitor(env: Env, row: MonitorRow) {
  const auth = monitorAuth(row);
  const policy = await getWorkspaceAutonomyPolicy(env, auth);
  if (!policy.automationEnabled) {
    await markWorkspaceMonitorRun(env, row.id, {
      status: "denied",
      error: "automation_disabled",
      scheduleHours: row.schedule_hours,
    });
    await recordWorkspaceMonitorRun(env, {
      monitorId: row.id,
      ownerKey: row.owner_key,
      status: "denied",
      summary: { error: "automation_disabled" },
      deliveredVia: null,
      deliveryOk: null,
    });
    return { monitorId: row.id, status: "denied" as const };
  }

  let gmailDigest: Awaited<ReturnType<typeof buildGmailDailyDigest>> | null = null;
  let calendarAgenda: Awaited<ReturnType<typeof buildCalendarDailyAgenda>> | null = null;
  let ruleEvaluation: Awaited<ReturnType<typeof evaluateWorkspaceRulesForGmail>> | null = null;

  if (row.gmail_account_id) {
    ruleEvaluation = await evaluateWorkspaceRulesForGmail(env, auth, {
      gmailAccountId: row.gmail_account_id,
      ruleKinds: row.rule_kinds as WorkspaceRuleKind[],
    });
    if ("error" in ruleEvaluation) {
      await markWorkspaceMonitorRun(env, row.id, {
        status: "failed",
        error: ruleEvaluation.error,
        scheduleHours: row.schedule_hours,
      });
      await recordWorkspaceMonitorRun(env, {
        monitorId: row.id,
        ownerKey: row.owner_key,
        status: "failed",
        summary: { error: ruleEvaluation.error },
        deliveredVia: null,
        deliveryOk: false,
      });
      return { monitorId: row.id, status: "failed" as const, error: ruleEvaluation.error };
    }

    const digest = await buildGmailDailyDigest(env, auth, {
      accountId: row.gmail_account_id,
      sinceHours: Math.min(row.schedule_hours, 24),
    });
    if (!("error" in digest)) gmailDigest = digest;
  }

  if (row.calendar_account_id) {
    const agenda = await buildCalendarDailyAgenda(env, auth, {
      accountId: row.calendar_account_id,
    });
    if (!("error" in agenda)) calendarAgenda = agenda;
  }

  const ruleHits = ruleEvaluation && !("error" in ruleEvaluation) ? ruleEvaluation.hits : [];
  const summaryText = [
    `Workspace monitor "${row.name}"`,
    ruleHits.length ? `${ruleHits.length} rule hit(s)` : "No rule hits",
    gmailDigest ? `Gmail unread: ${gmailDigest.unreadCount}` : null,
    calendarAgenda ? calendarAgenda.summary : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const payload = {
    generatedAt: new Date().toISOString(),
    monitorId: row.id,
    monitorName: row.name,
    summary: summaryText,
    ruleHits,
    gmailDigest,
    calendarAgenda,
  };

  const delivery = await deliverWorkspaceDigest(env, {
    webhookUrl: row.digest_webhook_url,
    email: row.digest_email,
    payload,
  });

  await markWorkspaceMonitorRun(env, row.id, {
    status: delivery.ok ? "ok" : "delivery_failed",
    error: delivery.ok ? null : delivery.detail ?? "delivery_failed",
    scheduleHours: row.schedule_hours,
  });

  await recordWorkspaceMonitorRun(env, {
    monitorId: row.id,
    ownerKey: row.owner_key,
    status: delivery.ok ? "ok" : "delivery_failed",
    summary: {
      ruleHitCount: ruleHits.length,
      delivery,
      gmailUnread: gmailDigest?.unreadCount ?? null,
      calendarEvents: calendarAgenda?.eventCount ?? null,
    },
    deliveredVia: delivery.via,
    deliveryOk: delivery.ok,
  });

  return {
    monitorId: row.id,
    status: delivery.ok ? ("ok" as const) : ("delivery_failed" as const),
    monitor: formatMonitor(row),
    delivery,
    ruleHits,
  };
}

export async function runDueWorkspaceMonitors(env: Env, limit = 10) {
  const due = await listDueWorkspaceMonitors(env, limit);
  const results = [];
  for (const row of due) {
    results.push(await runSingleMonitor(env, row));
  }
  return { ran: results.length, results };
}

export async function runWorkspaceMonitorById(env: Env, row: MonitorRow) {
  return runSingleMonitor(env, row);
}
