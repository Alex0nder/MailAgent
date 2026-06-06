#!/usr/bin/env node
/**
 * Contract: inbound threading via simulate (In-Reply-To + Re: subject fallback).
 * Needs MAILAGENT_API_URL + MAILAGENT_API_KEY only.
 */
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
  console.error("contract-qa-threads: set MAILAGENT_API_KEY");
  process.exit(1);
}

async function main() {
  console.log("contract-qa-threads →", base);

  const created = await contractApi(base, headers, "/v1/inboxes", {
    method: "POST",
    body: JSON.stringify({
      label: `thread-${Date.now()}`,
      ttlMinutes: 15,
      service: "auth0",
    }),
  });
  if (!created.ok) {
    console.error("create inbox failed", created.status, created.json);
    process.exit(1);
  }

  const inboxId = created.json.id;

  const root = await contractSimulate(base, headers, inboxId, {
    otp: "100001",
    subject: "Thread contract root",
    rfcMessageId: `contract-root-${Date.now()}@sim.mailagent`,
  });
  if (!root.ok || !root.json?.messageId) {
    console.error("simulate root failed", root.status, root.json);
    process.exit(1);
  }

  const rootThreadId = root.json.threadId ?? root.json.messageId;
  console.log("root message", root.json.messageId, "threadId", rootThreadId);

  const reply = await contractSimulate(base, headers, inboxId, {
    otp: "100002",
    subject: "Re: Thread contract root",
    inReplyToMessageId: root.json.messageId,
  });
  if (!reply.ok || !reply.json?.messageId) {
    console.error("simulate reply failed", reply.status, reply.json);
    process.exit(1);
  }

  if (reply.json.threadId !== rootThreadId) {
    console.error("In-Reply-To thread mismatch", {
      expected: rootThreadId,
      got: reply.json.threadId,
    });
    process.exit(1);
  }
  console.log("In-Reply-To threading OK");

  const subjectOnly = await contractSimulate(base, headers, inboxId, {
    otp: "200001",
    subject: "Subject-only thread",
  });
  if (!subjectOnly.ok) {
    console.error("simulate subject root failed", subjectOnly.status);
    process.exit(1);
  }

  const subjectReply = await contractSimulate(base, headers, inboxId, {
    otp: "200002",
    subject: "Re: Subject-only thread",
  });
  if (!subjectReply.ok) {
    console.error("simulate subject reply failed", subjectReply.status);
    process.exit(1);
  }

  const subjectThread = subjectOnly.json.threadId ?? subjectOnly.json.messageId;
  if (subjectReply.json.threadId !== subjectThread) {
    console.error("Re: subject fallback failed", {
      expected: subjectThread,
      got: subjectReply.json.threadId,
    });
    process.exit(1);
  }
  console.log("Re: subject fallback OK");

  const threads = await contractApi(base, headers, `/v1/inboxes/${inboxId}/threads`);
  if (!threads.ok) {
    console.error("list threads failed", threads.status, threads.json);
    process.exit(1);
  }

  const list = threads.json.threads ?? threads.json;
  if (!Array.isArray(list)) {
    console.error("unexpected threads payload", threads.json);
    process.exit(1);
  }

  const rootSummary = list.find((t) => t.threadId === rootThreadId);
  if (!rootSummary || rootSummary.messageCount < 2) {
    console.error("root thread summary missing or too few messages", {
      rootThreadId,
      rootSummary,
      list,
    });
    process.exit(1);
  }

  const threadMsgs = await contractApi(
    base,
    headers,
    `/v1/inboxes/${inboxId}/threads/${rootThreadId}/messages`
  );
  if (!threadMsgs.ok) {
    console.error("thread messages failed", threadMsgs.status, threadMsgs.json);
    process.exit(1);
  }

  const msgs = threadMsgs.json.messages ?? [];
  if (msgs.length < 2) {
    console.error("expected ≥2 messages in thread", msgs.length);
    process.exit(1);
  }

  await contractApi(base, headers, `/v1/inboxes/${inboxId}`, { method: "DELETE" });

  console.log("contract-qa-threads OK", {
    inboxId,
    rootThreadId,
    messageCount: rootSummary.messageCount,
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
