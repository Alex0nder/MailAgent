/** Agent run workflow: server-side state machine over agent_run_sessions. */
import type { Env } from "../env";
import {
  buildAgentAutopilotPlan,
  type AgentAutopilotInput,
} from "../lib/agent-autopilot";
import { validateRunId } from "../lib/validate-run-id";
import {
  getAgentRunSession,
  patchAgentRunSession,
  type AgentRunSession,
} from "./agent-run-session";
import { buildInboxDiagnose } from "./inbox-diagnose";
import { listWorkspaceReminders } from "./workspace-reminders";

export type AgentRunStartInput = AgentAutopilotInput & {
  runId?: string;
  appUrl?: string;
  notes?: string;
};

export type AgentRunReportInput = AgentAutopilotInput & {
  status?: string;
  step?: string;
  error?: string;
  result?: Record<string, unknown>;
};

export type AgentRunNextInput = AgentAutopilotInput & {
  status?: string;
};

export type AgentRunWorkflowAuth = {
  ownerKey: string;
  teamId: string | null;
  apiKeyHint: string;
  apiBaseUrl: string;
};

function generatedRunId(): string {
  return `run-${Date.now().toString(36)}`;
}

function cleanRunId(input?: string): string {
  const runId = input?.trim() || generatedRunId();
  if (!validateRunId(runId)) {
    throw new Error("invalid_run_id");
  }
  return runId;
}

function cleanString(value?: string): string | undefined {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

function stateFromInput(input: AgentAutopilotInput): Record<string, unknown> {
  return {
    ...(cleanString(input.inboxId) ? { inboxId: cleanString(input.inboxId) } : {}),
    ...(cleanString(input.status) ? { status: cleanString(input.status) } : {}),
    ...(cleanString(input.service) ? { service: cleanString(input.service) } : {}),
    ...(cleanString(input.from) ? { from: cleanString(input.from) } : {}),
    ...(cleanString(input.subject) ? { subject: cleanString(input.subject) } : {}),
    ...(cleanString(input.text) ? { text: cleanString(input.text) } : {}),
    ...(cleanString(input.html) ? { html: cleanString(input.html) } : {}),
    ...(cleanString(input.flow) ? { flow: cleanString(input.flow) } : {}),
    ...(cleanString(input.label) ? { label: cleanString(input.label) } : {}),
    ...(cleanString(input.subjectContains)
      ? { subjectContains: cleanString(input.subjectContains) }
      : {}),
    ...(input.messageIndex !== undefined ? { messageIndex: input.messageIndex } : {}),
    ...(input.timeoutSeconds !== undefined ? { timeoutSeconds: input.timeoutSeconds } : {}),
    ...(input.deleteAfterSuccess !== undefined
      ? { deleteAfterSuccess: input.deleteAfterSuccess }
      : {}),
    ...(input.keepOnFailure !== undefined ? { keepOnFailure: input.keepOnFailure } : {}),
    ...(input.allowSimulate !== undefined ? { allowSimulate: input.allowSimulate } : {}),
    ...(cleanString(input.lastError) ? { lastError: cleanString(input.lastError) } : {}),
    ...(Array.isArray(input.openReminders) ? { openReminders: input.openReminders } : {}),
  };
}

function hasSignupPlannerHints(input: AgentAutopilotInput): boolean {
  return Boolean(
    cleanString(input.service) ||
      cleanString(input.from) ||
      cleanString(input.subject) ||
      cleanString(input.text) ||
      cleanString(input.html) ||
      cleanString(input.flow)
  );
}

function autopilotInputFromState(
  runId: string,
  session: AgentRunSession,
  override: AgentRunNextInput = {}
): AgentAutopilotInput {
  return {
    ...(session.state as AgentAutopilotInput),
    ...override,
    runId,
  };
}

function reportStepName(status?: string, fallback?: string): string {
  const clean = status?.trim().toLowerCase();
  if (clean === "verified") return "run.verified";
  if (clean === "timeout") return "run.timeout";
  if (clean === "failed") return "run.failed";
  if (clean === "message_received") return "run.message_received";
  return fallback?.trim().slice(0, 128) || "run.report";
}

export async function startAgentRun(
  env: Env,
  auth: AgentRunWorkflowAuth,
  input: AgentRunStartInput = {}
) {
  const runId = cleanRunId(input.runId);
  const initialState = {
    status: "start",
    ...stateFromInput(input),
    runId,
    ...(cleanString(input.appUrl) ? { appUrl: cleanString(input.appUrl) } : {}),
    ...(cleanString(input.notes) ? { notes: cleanString(input.notes) } : {}),
  };

  const patched = await patchAgentRunSession(env, runId, auth.ownerKey, {
    merge: initialState,
    step: {
      name: "run.started",
      data: initialState,
    },
  });
  if (!patched.ok) return patched;

  const plan = await buildNextPlan(env, auth, runId, patched.session, {});
  return {
    ok: true as const,
    runId,
    session: patched.session,
    plan,
  };
}

export async function nextAgentRun(
  env: Env,
  auth: AgentRunWorkflowAuth,
  runIdRaw: string,
  input: AgentRunNextInput = {}
) {
  const runId = cleanRunId(runIdRaw);
  const existing = await getAgentRunSession(env, runId, auth.ownerKey);
  if (!existing) {
    return { ok: false as const, status: 404 as const, error: "session_not_found" };
  }

  const merge = stateFromInput(input);
  const patched = Object.keys(merge).length
    ? await patchAgentRunSession(env, runId, auth.ownerKey, { merge })
    : { ok: true as const, session: existing };
  if (!patched.ok) return { ok: false as const, status: 400 as const, error: patched.error };

  const plan = await buildNextPlan(env, auth, runId, patched.session, input);
  return {
    ok: true as const,
    runId,
    session: patched.session,
    plan,
  };
}

export async function reportAgentRun(
  env: Env,
  auth: AgentRunWorkflowAuth,
  runIdRaw: string,
  input: AgentRunReportInput = {}
) {
  const runId = cleanRunId(runIdRaw);
  const merge = {
    ...stateFromInput(input),
    ...(cleanString(input.error) ? { lastError: cleanString(input.error) } : {}),
    ...(input.result ? { lastResult: input.result } : {}),
  };
  const patched = await patchAgentRunSession(env, runId, auth.ownerKey, {
    merge,
    step: {
      name: reportStepName(input.status, input.step),
      data: {
        ...merge,
        ...(input.result ? { result: input.result } : {}),
      },
    },
  });
  if (!patched.ok) return { ok: false as const, status: 400 as const, error: patched.error };

  const plan = await buildNextPlan(env, auth, runId, patched.session, {});
  return {
    ok: true as const,
    runId,
    session: patched.session,
    plan,
  };
}

async function buildNextPlan(
  env: Env,
  auth: AgentRunWorkflowAuth,
  runId: string,
  session: AgentRunSession,
  override: AgentRunNextInput
) {
  const input = autopilotInputFromState(runId, session, override);
  const status = input.status?.trim().toLowerCase();
  const shouldDiagnose =
    Boolean(input.inboxId) && (status === "timeout" || status === "failed");
  const diagnose = shouldDiagnose
    ? await buildInboxDiagnose(env, input.inboxId!, {
        subjectContains: input.subjectContains,
        messageIndex: input.messageIndex,
        apiBaseUrl: auth.apiBaseUrl,
        apiKeyHint: auth.apiKeyHint,
      })
    : null;
  if (
    !input.inboxId &&
    !Array.isArray(input.openReminders) &&
    !hasSignupPlannerHints(input)
  ) {
    const reminders = await listWorkspaceReminders(
      env,
      { teamId: auth.teamId, apiKeyHint: auth.apiKeyHint },
      { status: "open", limit: 5 }
    );
    if (reminders.length > 0) {
      input.openReminders = reminders;
    }
  }
  return buildAgentAutopilotPlan(input, diagnose);
}
