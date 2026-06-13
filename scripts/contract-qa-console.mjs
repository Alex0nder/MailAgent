#!/usr/bin/env node
/** Contract: hosted console summary + scoped usage meters */
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
  console.error("contract-qa-console: set MAILAGENT_API_KEY");
  process.exit(1);
}

async function main() {
  console.log("contract-qa-console →", base);

  const summary0 = await contractApi(base, headers, "/v1/console/summary");
  if (!summary0.ok) {
    console.error("console/summary failed", summary0.status, summary0.json);
    process.exit(1);
  }

  const s0 = summary0.json;
  if (
    !s0.limits?.maxActiveInboxes ||
    !s0.limits?.notifyEmailsPerDay ||
    s0.usage?.messagesLast24h == null ||
    s0.usage?.notifyEmailsLast24h == null
  ) {
    console.error("summary shape invalid", s0);
    process.exit(1);
  }
  if (!s0.billing?.checkoutPath || !s0.billing?.portalPath) {
    console.error("billing paths missing", s0.billing);
    process.exit(1);
  }
  if (s0.policies?.auditRetentionDays == null) {
    console.error("audit retention policy missing", s0.policies);
    process.exit(1);
  }
  if (s0.capabilities?.outbound?.enabled == null) {
    console.error("console capabilities.outbound missing", s0.capabilities);
    process.exit(1);
  }
  if (s0.teamId && s0.dedicatedResend?.webhookUrl == null) {
    console.error("dedicatedResend missing for team key", s0.dedicatedResend);
    process.exit(1);
  }
  console.log("console summary OK", {
    plan: s0.plan,
    messagesLast24h: s0.usage.messagesLast24h,
    notifyEmailsLast24h: s0.usage.notifyEmailsLast24h,
  });

  const me = await contractApi(base, headers, "/v1/me");
  if (
    !me.ok ||
    me.json?.usage?.messagesLast24h == null ||
    me.json?.usage?.notifyEmailsLast24h == null ||
    !me.json?.limits?.notifyEmailsPerDay
  ) {
    console.error("/v1/me usage meters failed", me.status, me.json);
    process.exit(1);
  }
  if (me.json?.capabilities?.outbound?.enabled == null) {
    console.error("/v1/me outbound capabilities missing", me.json?.capabilities);
    process.exit(1);
  }
  console.log("me usage meters OK");

  const created = await contractApi(base, headers, "/v1/inboxes", {
    method: "POST",
    body: JSON.stringify({ label: `console-${Date.now()}`, ttlMinutes: 15 }),
  });
  if (!created.ok) {
    console.error("create inbox failed", created.status, created.json);
    process.exit(1);
  }

  const inboxId = created.json.id;
  const root = await contractSimulate(base, headers, inboxId, {
    otp: "445566",
    subject: "Console thread root",
    rfcMessageId: `console-root-${Date.now()}@sim.mailagent`,
  });
  if (!root.ok || !root.json?.messageId) {
    console.error("simulate failed", root.status);
    process.exit(1);
  }

  const threadId = root.json.threadId ?? root.json.messageId;
  const reply = await contractSimulate(base, headers, inboxId, {
    otp: "445567",
    subject: "Re: Console thread root",
    inReplyToMessageId: root.json.messageId,
  });
  if (!reply.ok) {
    console.error("thread reply simulate failed", reply.status);
    process.exit(1);
  }

  const threadsApi = await contractApi(
    base,
    headers,
    "/v1/console/threads?limit=10"
  );
  if (!threadsApi.ok || !Array.isArray(threadsApi.json?.threads)) {
    console.error("console/threads failed", threadsApi.status, threadsApi.json);
    process.exit(1);
  }

  const summary1 = await contractApi(base, headers, "/v1/console/summary");
  if (!summary1.ok) {
    console.error("summary after simulate failed", summary1.status);
    process.exit(1);
  }

  const recent = summary1.json.recentInboxes ?? [];
  const found = recent.some((i) => i.id === inboxId);
  if (!found) {
    console.error("recentInboxes missing new inbox", { inboxId, recent });
    process.exit(1);
  }

  if (summary1.json.usage.messagesLast24h < summary0.json.usage.messagesLast24h) {
    console.error("messagesLast24h did not increase");
    process.exit(1);
  }

  const threadHit =
    summary1.json.recentThreads?.find(
      (t) => t.inboxId === inboxId && t.threadId === threadId
    ) ??
    threadsApi.json.threads.find(
      (t) => t.inboxId === inboxId && t.threadId === threadId
    );
  if (!threadHit || threadHit.messageCount < 2) {
    console.error("recentThreads missing threaded conversation", {
      inboxId,
      threadId,
      recentThreads: summary1.json.recentThreads,
    });
    process.exit(1);
  }

  console.log("contract-qa-console OK", {
    inboxId,
    threadId,
    messageCount: threadHit.messageCount,
    messagesLast24h: summary1.json.usage.messagesLast24h,
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
