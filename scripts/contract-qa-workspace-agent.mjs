#!/usr/bin/env node
/** Contract: Workspace Agent preview — summarize/draft/reminder fallback works without LLM keys. */
import "./load-env.mjs";
import {
  contractApi,
  contractBase,
  contractHeaders,
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
  if (!hub.ok || hub.json?.safety?.sendAllowed !== false || !hub.json?.endpoints?.summarize) {
    console.error("workspace hub failed", hub.status, hub.json);
    process.exit(1);
  }

  const agentHub = await contractApi(base, headers, "/v1/agent");
  for (const tool of [
    "mailagent_workspace_summarize",
    "mailagent_workspace_draft_reply",
    "mailagent_workspace_suggest_reminders",
  ]) {
    if (!agentHub.json?.mcpTools?.includes(tool)) {
      console.error(`agent hub missing ${tool}`, agentHub.json?.mcpTools);
      process.exit(1);
    }
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

  const reminders = await contractApi(base, headers, "/v1/workspace/reminders/suggest", {
    method: "POST",
    body: JSON.stringify({ ...sample, timezone: "Asia/Tbilisi" }),
  });
  if (!reminders.ok || !Array.isArray(reminders.json?.reminders)) {
    console.error("workspace reminders failed", reminders.status, reminders.json);
    process.exit(1);
  }

  console.log("contract-qa-workspace-agent OK", {
    mode: summary.json.mode,
    reminders: reminders.json.reminders.length,
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
