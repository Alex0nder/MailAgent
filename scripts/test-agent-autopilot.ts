import { buildAgentAutopilotPlan } from "../src/lib/agent-autopilot";
import type { InboxDiagnoseResult } from "../src/services/inbox-diagnose";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const diagnoseNoMessages: InboxDiagnoseResult = {
  inboxId: "inb_1",
  address: "inbox-inb_1@example.test",
  label: "ci-1",
  expiresAt: new Date(Date.now() + 60_000).toISOString(),
  callbackUrl: null,
  messageCount: 0,
  messages: [],
  callbacks: [],
  waitDebug: { messageCount: 0, hint: "No messages yet." },
  troubleshooting: ["No messages yet."],
  failureSummary: {
    code: "no_messages",
    message: "No messages have reached this inbox yet.",
    confidence: "high",
  },
  recommendedAction: {
    type: "wait",
    confidence: "high",
    label: "Retry wait on this inbox",
    reason: "Keep the same inbox and retry wait.",
    payload: {
      method: "GET",
      path: "/v1/inboxes/inb_1/wait",
      query: { timeoutSeconds: 120, subjectContains: "verify", messageIndex: 0 },
    },
  },
  retry: {
    keepInbox: true,
    wait: {
      method: "GET",
      path: "/v1/inboxes/inb_1/wait",
      query: { timeoutSeconds: 120, subjectContains: "verify", messageIndex: 0 },
    },
    simulate: {
      method: "POST",
      path: "/v1/inboxes/inb_1/simulate",
      body: { subject: "MailAgent retry: verify", otp: "482910" },
    },
  },
  nextActions: [],
  debugUiUrl: "https://webmailagent.com/debug.html?inbox=inb_1",
  apiMessagesUrl: "https://api.webmailagent.com/v1/inboxes/inb_1/messages",
};

function main() {
  const start = buildAgentAutopilotPlan({
    service: "auth0",
    subject: "Verify your email",
    runId: "agent-run-1",
  });
  assert(start.mode === "create_inbox", "start creates inbox");
  assert(start.nextTool === "mailagent_create_inbox", "start next tool");
  assert(start.payloads.verifySignup?.inboxId === "<created inbox id>", "start verify placeholder");
  assert(start.presetAdvice.service === "auth0", "auth0 preset advice");

  const verify = buildAgentAutopilotPlan({
    inboxId: "inb_1",
    service: "github",
    status: "form_submitted",
  });
  assert(verify.mode === "verify", "existing inbox verifies");
  assert(verify.nextTool === "mailagent_verify_signup", "verify next tool");
  assert(verify.nextPayload.inboxId === "inb_1", "verify inbox id");
  assert(verify.nextPayload.keepOnFailure === true, "verify keeps failure");

  const recover = buildAgentAutopilotPlan(
    {
      inboxId: "inb_1",
      service: "github",
      status: "timeout",
      subjectContains: "verify",
    },
    diagnoseNoMessages
  );
  assert(recover.mode === "recover", "timeout recovers");
  assert(recover.nextTool === "mailagent_verify_signup", "no messages retries verify");
  assert(recover.payloads.simulateMessage?.otp === "482910", "simulate fallback payload");
  assert(recover.diagnose?.failureSummary.code === "no_messages", "diagnose included");

  const done = buildAgentAutopilotPlan({
    status: "verified",
    runId: "agent-run-1",
  });
  assert(done.mode === "done", "verified done");
  assert(done.nextTool === "mailagent_cleanup_inboxes", "done cleanup");

  console.log("test-agent-autopilot OK");
}

main();
