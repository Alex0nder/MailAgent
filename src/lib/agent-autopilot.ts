import type { InboxDiagnoseResult } from "../services/inbox-diagnose";
import { suggestPreset, type PresetAdviceInput } from "./preset-advisor";

export type AgentAutopilotStatus =
  | "start"
  | "address_ready"
  | "form_submitted"
  | "timeout"
  | "message_received"
  | "verified"
  | "failed";

export type AgentAutopilotInput = PresetAdviceInput & {
  inboxId?: string;
  runId?: string;
  label?: string;
  subjectContains?: string;
  messageIndex?: number;
  timeoutSeconds?: number;
  deleteAfterSuccess?: boolean;
  keepOnFailure?: boolean;
  allowSimulate?: boolean;
  status?: AgentAutopilotStatus | string;
  lastError?: string;
};

export interface AgentAutopilotPlan {
  mode: "create_inbox" | "verify" | "recover" | "extract" | "done";
  confidence: "high" | "medium" | "low";
  summary: string;
  nextTool: string;
  nextPayload: Record<string, unknown>;
  steps: string[];
  payloads: {
    createInbox?: Record<string, unknown>;
    verifySignup?: Record<string, unknown>;
    diagnoseInbox?: Record<string, unknown>;
    simulateMessage?: Record<string, unknown>;
    extractVerification?: Record<string, unknown>;
    cleanup?: Record<string, unknown>;
  };
  guardrails: string[];
  stopWhen: string[];
  presetAdvice: ReturnType<typeof suggestPreset>;
  diagnose?: {
    failureSummary: InboxDiagnoseResult["failureSummary"];
    recommendedAction: InboxDiagnoseResult["recommendedAction"];
    nextActions: InboxDiagnoseResult["nextActions"];
    debugUiUrl: string;
  };
}

function cleanString(value?: string): string | undefined {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

function statusOf(input: AgentAutopilotInput): AgentAutopilotStatus {
  const raw = input.status?.trim().toLowerCase();
  if (
    raw === "address_ready" ||
    raw === "form_submitted" ||
    raw === "timeout" ||
    raw === "message_received" ||
    raw === "verified" ||
    raw === "failed"
  ) {
    return raw;
  }
  if (input.lastError?.toLowerCase().includes("timeout")) return "timeout";
  return input.inboxId ? "form_submitted" : "start";
}

function baseCreatePayload(input: AgentAutopilotInput, known: boolean, advice: ReturnType<typeof suggestPreset>) {
  return {
    ...(known ? { service: advice.service } : advice.expectFrom.length ? { expectFrom: advice.expectFrom } : {}),
    ...(cleanString(input.label) ? { label: cleanString(input.label) } : {}),
    ...(cleanString(input.runId) ? { runId: cleanString(input.runId) } : {}),
    deleteAfterMinutes: input.keepOnFailure ? 60 : 30,
  };
}

function baseVerifyPayload(input: AgentAutopilotInput, advice: ReturnType<typeof suggestPreset>) {
  const subjectContains = cleanString(input.subjectContains) ?? advice.subjectContains;
  return {
    ...(cleanString(input.inboxId) ? { inboxId: cleanString(input.inboxId) } : {}),
    ...(advice.knownPreset ? { service: advice.service } : advice.expectFrom.length ? { expectFrom: advice.expectFrom } : {}),
    flow: advice.flow,
    subjectContains,
    messageIndex: Math.max(0, Math.floor(Number(input.messageIndex ?? 0))),
    timeoutSeconds: Math.min(Math.max(Number(input.timeoutSeconds ?? advice.timeoutSeconds), 5), 120),
    deleteAfterSuccess: input.deleteAfterSuccess ?? true,
    keepOnFailure: input.keepOnFailure ?? true,
    ...(cleanString(input.runId) ? { runId: cleanString(input.runId) } : {}),
  };
}

function diagnosePayload(input: AgentAutopilotInput, advice: ReturnType<typeof suggestPreset>) {
  return {
    inboxId: cleanString(input.inboxId),
    subjectContains: cleanString(input.subjectContains) ?? advice.subjectContains,
    messageIndex: Math.max(0, Math.floor(Number(input.messageIndex ?? 0))),
  };
}

function actionToTool(actionType: string): string {
  switch (actionType) {
    case "extract_verification":
      return "mailagent_extract_verification";
    case "simulate_message":
      return "mailagent_simulate_message";
    case "open_debug_ui":
    case "fix_callback":
      return "mailagent_diagnose_inbox";
    default:
      return "mailagent_verify_signup";
  }
}

function actionToPayload(
  input: AgentAutopilotInput,
  advice: ReturnType<typeof suggestPreset>,
  diagnose: InboxDiagnoseResult
): Record<string, unknown> {
  const action = diagnose.recommendedAction;
  if (action.type === "extract_verification") {
    return { inboxId: input.inboxId };
  }
  if (action.type === "simulate_message") {
    return { inboxId: input.inboxId, ...diagnose.retry.simulate.body };
  }
  if (action.type === "open_debug_ui" || action.type === "fix_callback") {
    return {
      ...diagnosePayload(input, advice),
      debugUiUrl: diagnose.debugUiUrl,
    };
  }
  return baseVerifyPayload(input, advice);
}

export function buildAgentAutopilotPlan(
  input: AgentAutopilotInput = {},
  diagnose?: InboxDiagnoseResult | null
): AgentAutopilotPlan {
  const presetAdvice = suggestPreset(input);
  const createInbox = baseCreatePayload(input, presetAdvice.knownPreset, presetAdvice);
  const verifySignup = baseVerifyPayload(input, presetAdvice);
  const status = statusOf(input);
  const guardrails = [
    "Never use Gmail or a shared human mailbox for OTP checks.",
    "Do not call mailagent_check_email on MailAgent temporary inboxes.",
    "Keep failed inboxes while debugging; clean up successful CI runs.",
    "Do not paste API keys, OTPs, or magic links into public logs.",
  ];
  const stopWhen = [
    "agent.primaryAction.type is otp, magic_link, or link and the app accepts it.",
    "diagnose recommends open_debug_ui or fix_callback after automated retries are exhausted.",
    "inbox limit, auth, or domain verification errors require operator action.",
  ];

  if (status === "verified") {
    return {
      mode: "done",
      confidence: "high",
      summary: "Verification is already complete; clean up if the inbox was kept.",
      nextTool: "mailagent_cleanup_inboxes",
      nextPayload: cleanString(input.runId)
        ? { runId: cleanString(input.runId) }
        : cleanString(input.label)
          ? { labelPrefix: cleanString(input.label) }
          : {},
      steps: ["Stop waiting for email.", "Clean up retained test inboxes if any."],
      payloads: { cleanup: cleanString(input.runId) ? { runId: cleanString(input.runId) } : {} },
      guardrails,
      stopWhen,
      presetAdvice,
    };
  }

  if (!input.inboxId) {
    return {
      mode: "create_inbox",
      confidence: presetAdvice.confidence,
      summary: "Create a disposable inbox, submit its address in the app, then verify with the returned inboxId.",
      nextTool: "mailagent_create_inbox",
      nextPayload: createInbox,
      steps: [
        "Call mailagent_create_inbox with the recommended sender allowlist.",
        "Fill the target app email field with the returned address.",
        "Submit the form.",
        "Call mailagent_verify_signup with inboxId and the recommended verify payload.",
      ],
      payloads: { createInbox, verifySignup: { ...verifySignup, inboxId: "<created inbox id>" } },
      guardrails,
      stopWhen,
      presetAdvice,
    };
  }

  if (diagnose && (status === "timeout" || status === "failed")) {
    const nextTool = actionToTool(diagnose.recommendedAction.type);
    const nextPayload = actionToPayload(input, presetAdvice, diagnose);
    const allowSimulate = input.allowSimulate !== false;
    return {
      mode: diagnose.recommendedAction.type === "extract_verification" ? "extract" : "recover",
      confidence: diagnose.recommendedAction.confidence,
      summary: diagnose.failureSummary.message,
      nextTool,
      nextPayload,
      steps: [
        diagnose.recommendedAction.label,
        diagnose.recommendedAction.reason,
        allowSimulate
          ? "If the app-side test wiring is the question, use simulate to validate without SMTP."
          : "Simulation is disabled for this plan; keep retries on the real inbox.",
      ],
      payloads: {
        verifySignup,
        diagnoseInbox: diagnosePayload(input, presetAdvice),
        ...(allowSimulate ? { simulateMessage: { inboxId: input.inboxId, ...diagnose.retry.simulate.body } } : {}),
        ...(diagnose.recommendedAction.type === "extract_verification"
          ? { extractVerification: { inboxId: input.inboxId } }
          : {}),
      },
      guardrails,
      stopWhen,
      presetAdvice,
      diagnose: {
        failureSummary: diagnose.failureSummary,
        recommendedAction: diagnose.recommendedAction,
        nextActions: diagnose.nextActions,
        debugUiUrl: diagnose.debugUiUrl,
      },
    };
  }

  return {
    mode: "verify",
    confidence: presetAdvice.confidence,
    summary: "Use the existing inbox and wait for verification data.",
    nextTool: "mailagent_verify_signup",
    nextPayload: verifySignup,
    steps: [
      "Call mailagent_verify_signup with the existing inboxId.",
      "Use agent.primaryAction directly when status is verified.",
      "If it times out, call this autopilot plan again with status=timeout or call mailagent_diagnose_inbox.",
    ],
    payloads: {
      verifySignup,
      diagnoseInbox: diagnosePayload(input, presetAdvice),
    },
    guardrails,
    stopWhen,
    presetAdvice,
  };
}
