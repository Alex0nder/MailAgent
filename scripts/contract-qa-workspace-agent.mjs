#!/usr/bin/env node
/** Contract: Workspace Agent preview — summarize/draft/reminder fallback works without LLM keys. */
import "./load-env.mjs";
import {
  contractApi,
  contractBase,
  contractHeaders,
  contractSimulate,
} from "./lib/contract-api.mjs";

const base = contractBase();
const headers = contractHeaders();
if (!headers) {
  console.error("contract-qa-workspace-agent: set MAILAGENT_API_KEY");
  process.exit(1);
}

const sample = {
  threadId: `contract-workspace-${Date.now()}`,
  goal: "Prepare a concise reply and follow-up plan",
  messages: [
    {
      id: "m1",
      from: "alice@example.com",
      to: ["qa@example.com"],
      subject: "Cryptopay merchant onboarding",
      text:
        "Hi, please review the KYB checklist and confirm if we can schedule onboarding tomorrow. We agreed the sandbox API key should not be shared in email.",
      receivedAt: "2026-06-18T10:00:00Z",
    },
    {
      id: "m2",
      from: "qa@example.com",
      to: ["alice@example.com"],
      subject: "Re: Cryptopay merchant onboarding",
      text: "Can you send the preferred time slots? I need to follow up with compliance.",
      receivedAt: "2026-06-18T10:05:00Z",
    },
  ],
};

async function main() {
  console.log("contract-qa-workspace-agent →", base);

  const hub = await contractApi(base, headers, "/v1/workspace");
  if (
    !hub.ok ||
    hub.json?.safety?.sendAllowed !== "policy_gated" ||
    !hub.json?.endpoints?.executeReply
  ) {
    console.error("workspace hub failed", hub.status, hub.json);
    process.exit(1);
  }

  const agentHub = await contractApi(base, headers, "/v1/agent");
  for (const tool of [
    "mailagent_workspace_summarize",
    "mailagent_workspace_draft_reply",
    "mailagent_workspace_suggest_reminders",
    "mailagent_workspace_create_reminder",
    "mailagent_workspace_list_reminders",
    "mailagent_workspace_complete_reminder",
    "mailagent_workspace_log_action",
    "mailagent_workspace_list_actions",
    "mailagent_workspace_get_policy",
    "mailagent_workspace_model_status",
    "mailagent_workspace_set_policy",
    "mailagent_workspace_execute_reply",
    "mailagent_gmail_status",
    "mailagent_gmail_connect",
    "mailagent_gmail_list_accounts",
    "mailagent_gmail_list_threads",
    "mailagent_gmail_read_thread",
    "mailagent_gmail_triage",
    "mailagent_gmail_digest",
    "mailagent_gmail_get_settings",
    "mailagent_gmail_set_settings",
    "mailagent_calendar_status",
    "mailagent_calendar_connect",
    "mailagent_calendar_list_accounts",
    "mailagent_calendar_list_events",
    "mailagent_calendar_availability",
    "mailagent_calendar_check_conflicts",
    "mailagent_calendar_suggest_meeting",
    "mailagent_calendar_agenda",
    "mailagent_workspace_execute_gmail_draft",
    "mailagent_workspace_execute_calendar_event",
    "mailagent_workspace_rules_status",
    "mailagent_workspace_rules_evaluate",
    "mailagent_workspace_list_monitors",
    "mailagent_workspace_create_monitor",
    "mailagent_workspace_delete_monitor",
    "mailagent_workspace_run_monitor",
    "mailagent_workspace_list_monitor_runs",
  ]) {
    if (!agentHub.json?.mcpTools?.includes(tool)) {
      console.error(`agent hub missing ${tool}`, agentHub.json?.mcpTools);
      process.exit(1);
    }
  }

  const models = await contractApi(base, headers, "/v1/workspace/models");
  if (
    !models.ok ||
    !Array.isArray(models.json?.readiness?.providers) ||
    models.json.readiness.providers.length < 2 ||
    models.json.readiness.providers.some(
      (provider) => "apiKey" in provider || "baseUrl" in provider
    )
  ) {
    console.error("workspace model readiness failed", models.status, models.json);
    process.exit(1);
  }

  const summary = await contractApi(base, headers, "/v1/workspace/summarize", {
    method: "POST",
    body: JSON.stringify(sample),
  });
  if (
    !summary.ok ||
    typeof summary.json?.summary !== "string" ||
    !Array.isArray(summary.json?.actionItems) ||
    summary.json?.redaction !== "enabled"
  ) {
    console.error("workspace summarize failed", summary.status, summary.json);
    process.exit(1);
  }
  if ("apiKey" in (summary.json?.provider ?? {}) || "baseUrl" in (summary.json?.provider ?? {})) {
    console.error("workspace provider metadata leaked private configuration", summary.json?.provider);
    process.exit(1);
  }

  const draft = await contractApi(base, headers, "/v1/workspace/draft-reply", {
    method: "POST",
    body: JSON.stringify({ ...sample, tone: "concise" }),
  });
  if (
    !draft.ok ||
    typeof draft.json?.draft !== "string" ||
    draft.json?.requiresApproval !== true ||
    draft.json?.sendAllowed !== false
  ) {
    console.error("workspace draft failed", draft.status, draft.json);
    process.exit(1);
  }
  if (
    !["high", "medium", "low"].includes(draft.json?.confidence) ||
    "apiKey" in (draft.json?.provider ?? {})
  ) {
    console.error("workspace draft safety metadata failed", draft.status, draft.json);
    process.exit(1);
  }

  const policy = await contractApi(base, headers, "/v1/workspace/policy");
  if (
    !policy.ok ||
    !["draft_only", "auto_send_safe", "full_auto"].includes(policy.json?.policy?.mode) ||
    policy.json?.safety?.idempotencyRequired !== true ||
    policy.json?.policy?.gmailDraftWrites !== false ||
    policy.json?.policy?.calendarEventWrites !== false ||
    policy.json?.policy?.automationEnabled !== false
  ) {
    console.error("workspace autonomy policy failed", policy.status, policy.json);
    process.exit(1);
  }

  const executionInbox = await contractApi(base, headers, "/v1/inboxes", {
    method: "POST",
    body: JSON.stringify({ label: `contract-autonomy-${Date.now()}`, ttlMinutes: 15 }),
  });
  if (!executionInbox.ok || !executionInbox.json?.id) {
    console.error("workspace execution inbox failed", executionInbox.status, executionInbox.json);
    process.exit(1);
  }
  const executionMessage = await contractSimulate(base, headers, executionInbox.json.id, {
    from: "alice@example.com",
    subject: "Workspace autonomy dry run",
    text: "Please send a short confirmation that the QA review is complete.",
  });
  if (!executionMessage.ok || !executionMessage.json?.messageId) {
    console.error("workspace execution message failed", executionMessage.status, executionMessage.json);
    process.exit(1);
  }
  const dryRun = await contractApi(base, headers, "/v1/workspace/execute-reply", {
    method: "POST",
    body: JSON.stringify({
      inboxId: executionInbox.json.id,
      messageId: executionMessage.json.messageId,
      instruction: "Confirm completion without making new commitments.",
      dryRun: true,
    }),
  });
  if (!dryRun.ok || dryRun.json?.sent !== false || !dryRun.json?.decision?.code) {
    console.error("workspace execution dry run failed", dryRun.status, dryRun.json);
    process.exit(1);
  }
  if (policy.json.policy.mode === "draft_only") {
    const idempotencyKey = `contract:workspace:${Date.now()}`;
    const deniedExecution = await contractApi(base, headers, "/v1/workspace/execute-reply", {
      method: "POST",
      body: JSON.stringify({
        inboxId: executionInbox.json.id,
        messageId: executionMessage.json.messageId,
        idempotencyKey,
      }),
    });
    if (
      !deniedExecution.ok ||
      deniedExecution.json?.sent !== false ||
      deniedExecution.json?.decision?.code !== "policy_draft_only" ||
      deniedExecution.json?.execution?.status !== "denied"
    ) {
      console.error(
        "workspace draft-only execution guard failed",
        deniedExecution.status,
        deniedExecution.json
      );
      process.exit(1);
    }
    const replay = await contractApi(base, headers, "/v1/workspace/execute-reply", {
      method: "POST",
      body: JSON.stringify({
        inboxId: executionInbox.json.id,
        messageId: executionMessage.json.messageId,
        idempotencyKey,
      }),
    });
    if (!replay.ok || replay.json?.replayed !== true || replay.json?.execution?.status !== "denied") {
      console.error("workspace execution idempotency failed", replay.status, replay.json);
      process.exit(1);
    }
  }
  await contractApi(base, headers, `/v1/inboxes/${encodeURIComponent(executionInbox.json.id)}`, {
    method: "DELETE",
  });

  const inboxSummarize = await contractApi(base, headers, "/v1/inboxes", {
    method: "POST",
    body: JSON.stringify({ label: `contract-workspace-inbox-${Date.now()}`, ttlMinutes: 15 }),
  });
  if (!inboxSummarize.ok || !inboxSummarize.json?.id) {
    console.error("workspace inbox summarize setup failed", inboxSummarize.status, inboxSummarize.json);
    process.exit(1);
  }
  const inboxMessage = await contractSimulate(base, headers, inboxSummarize.json.id, {
    from: "partner@example.com",
    subject: "Quarterly review follow-up",
    text: "Please confirm the QA review is complete and share any blockers.",
  });
  if (!inboxMessage.ok || !inboxMessage.json?.messageId) {
    console.error("workspace inbox message failed", inboxMessage.status, inboxMessage.json);
    process.exit(1);
  }
  const inboxThreadSummary = await contractApi(base, headers, "/v1/workspace/summarize", {
    method: "POST",
    body: JSON.stringify({
      inboxId: inboxSummarize.json.id,
      messageId: inboxMessage.json.messageId,
      goal: "Extract action items",
    }),
  });
  if (
    !inboxThreadSummary.ok ||
    typeof inboxThreadSummary.json?.summary !== "string" ||
    inboxThreadSummary.json?.mailSource !== "inbox"
  ) {
    console.error(
      "workspace inbox summarize failed",
      inboxThreadSummary.status,
      inboxThreadSummary.json
    );
    process.exit(1);
  }
  await contractApi(base, headers, `/v1/inboxes/${encodeURIComponent(inboxSummarize.json.id)}`, {
    method: "DELETE",
  });

  const reminders = await contractApi(base, headers, "/v1/workspace/reminders/suggest", {
    method: "POST",
    body: JSON.stringify({ ...sample, timezone: "Asia/Tbilisi" }),
  });
  if (!reminders.ok || !Array.isArray(reminders.json?.reminders)) {
    console.error("workspace reminders failed", reminders.status, reminders.json);
    process.exit(1);
  }

  const created = await contractApi(base, headers, "/v1/workspace/reminders", {
    method: "POST",
    body: JSON.stringify({
      title: `Follow up contract ${Date.now()}`,
      dueHint: "tomorrow",
      source: "contract",
      sourceThreadId: sample.threadId,
      meta: { contract: true },
    }),
  });
  if (created.status !== 201 || !created.json?.id || created.json?.status !== "open") {
    console.error("workspace create reminder failed", created.status, created.json);
    process.exit(1);
  }

  const listed = await contractApi(base, headers, "/v1/workspace/reminders?status=open&limit=20");
  if (
    !listed.ok ||
    !listed.json?.reminders?.some((r) => r.id === created.json.id)
  ) {
    console.error("workspace list reminders failed", listed.status, listed.json);
    process.exit(1);
  }

  const action = await contractApi(base, headers, "/v1/workspace/actions", {
    method: "POST",
    body: JSON.stringify({
      title: "Draft prepared for contract follow-up",
      actionType: "draft_prepared",
      status: "done",
      reminderId: created.json.id,
      threadId: sample.threadId,
      messageId: "m2",
      note: "Contract verified that action log persists agent progress.",
      meta: { contract: true },
    }),
  });
  if (
    action.status !== 201 ||
    action.json?.reminderId !== created.json.id ||
    action.json?.actionType !== "draft_prepared"
  ) {
    console.error("workspace log action failed", action.status, action.json);
    process.exit(1);
  }

  const actions = await contractApi(
    base,
    headers,
    `/v1/workspace/actions?reminderId=${encodeURIComponent(created.json.id)}&limit=10`
  );
  if (
    !actions.ok ||
    !actions.json?.actions?.some((item) => item.id === action.json.id)
  ) {
    console.error("workspace list actions failed", actions.status, actions.json);
    process.exit(1);
  }

  const invalidAction = await contractApi(base, headers, "/v1/workspace/actions", {
    method: "POST",
    body: JSON.stringify({
      title: "Invalid contract action",
      actionType: "unknown_action",
    }),
  });
  if (invalidAction.status !== 400 || invalidAction.json?.error !== "invalid_action_type") {
    console.error("workspace action validation failed", invalidAction.status, invalidAction.json);
    process.exit(1);
  }

  const completed = await contractApi(
    base,
    headers,
    `/v1/workspace/reminders/${encodeURIComponent(created.json.id)}/complete`,
    { method: "PATCH", body: JSON.stringify({}) }
  );
  if (!completed.ok || completed.json?.status !== "completed" || !completed.json?.completedAt) {
    console.error("workspace complete reminder failed", completed.status, completed.json);
    process.exit(1);
  }

  const gmailStatus = await contractApi(base, headers, "/v1/workspace/gmail/status");
  if (
    !gmailStatus.ok ||
    gmailStatus.json?.provider !== "gmail" ||
    gmailStatus.json?.writeAllowed !== false
  ) {
    console.error("workspace gmail status failed", gmailStatus.status, gmailStatus.json);
    process.exit(1);
  }

  const gmailAccounts = await contractApi(base, headers, "/v1/workspace/gmail/accounts");
  if (!gmailAccounts.ok || !Array.isArray(gmailAccounts.json?.accounts)) {
    console.error("workspace gmail accounts failed", gmailAccounts.status, gmailAccounts.json);
    process.exit(1);
  }

  const gmailSettings = await contractApi(base, headers, "/v1/workspace/gmail/settings");
  if (
    !gmailSettings.ok ||
    typeof gmailSettings.json?.settings?.threadLookbackDays !== "number" ||
    typeof gmailSettings.json?.settings?.maxThreadsPerScan !== "number"
  ) {
    console.error("workspace gmail settings failed", gmailSettings.status, gmailSettings.json);
    process.exit(1);
  }

  const calendarStatus = await contractApi(base, headers, "/v1/workspace/calendar/status");
  if (
    !calendarStatus.ok ||
    calendarStatus.json?.provider !== "google_calendar" ||
    calendarStatus.json?.writeAllowed !== false
  ) {
    console.error("workspace calendar status failed", calendarStatus.status, calendarStatus.json);
    process.exit(1);
  }

  const calendarAccounts = await contractApi(base, headers, "/v1/workspace/calendar/accounts");
  if (!calendarAccounts.ok || !Array.isArray(calendarAccounts.json?.accounts)) {
    console.error("workspace calendar accounts failed", calendarAccounts.status, calendarAccounts.json);
    process.exit(1);
  }

  const rulesStatus = await contractApi(base, headers, "/v1/workspace/rules/status");
  if (
    !rulesStatus.ok ||
    rulesStatus.json?.automationEnabled !== false ||
    !Array.isArray(rulesStatus.json?.ruleKinds) ||
    rulesStatus.json.ruleKinds.length !== 4
  ) {
    console.error("workspace rules status failed", rulesStatus.status, rulesStatus.json);
    process.exit(1);
  }

  const monitors = await contractApi(base, headers, "/v1/workspace/monitors");
  if (!monitors.ok || !Array.isArray(monitors.json?.monitors)) {
    console.error("workspace monitors list failed", monitors.status, monitors.json);
    process.exit(1);
  }

  console.log("contract-qa-workspace-agent OK", {
    mode: summary.json.mode,
    reminders: reminders.json.reminders.length,
    persistedReminder: completed.json.id,
    action: action.json.id,
    gmailConfigured: gmailStatus.json?.configured,
    gmailAccounts: gmailAccounts.json.accounts.length,
    gmailLookbackDays: gmailSettings.json.settings.threadLookbackDays,
    calendarConfigured: calendarStatus.json?.configured,
    calendarAccounts: calendarAccounts.json.accounts.length,
    ruleKinds: rulesStatus.json.ruleKinds.length,
    monitors: monitors.json.monitors.length,
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
