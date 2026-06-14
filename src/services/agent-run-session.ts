/** Multi-step agent run state (scoped by team or api key hint) */
import type { Env } from "../env";
import { getDb } from "../db/client";
import { parseRunIdFromLabel } from "../lib/agent-recipes";
import { normalizeRunId, validateRunId } from "../lib/validate-run-id";

export interface AgentRunStep {
  name: string;
  at: string;
  data?: Record<string, unknown>;
}

export interface AgentRunTimelineEvent {
  id: string;
  type:
    | "inbox_created"
    | "wait_started"
    | "message_received"
    | "extraction_success"
    | "extraction_failure"
    | "callback_delivery"
    | "notify_delivery"
    | "diagnose_run"
    | "session_step";
  at: string;
  title: string;
  status: "info" | "success" | "failure" | "timeout";
  inboxId?: string;
  messageId?: string;
  data?: Record<string, unknown>;
}

export interface AgentRunSession {
  runId: string;
  state: Record<string, unknown>;
  steps: AgentRunStep[];
  timeline: AgentRunTimelineEvent[];
  createdAt: string;
  updatedAt: string;
}

const MAX_STEPS = 50;
const MAX_STATE_CHARS = 32_000;

type SessionRow = {
  run_id: string;
  state: Record<string, unknown> | null;
  steps: AgentRunStep[] | null;
  created_at: string;
  updated_at: string;
};

export function sessionOwnerKey(
  teamId: string | null | undefined,
  apiKeyHint: string
): string {
  return teamId?.trim() || apiKeyHint;
}

function rowToSession(row: SessionRow): AgentRunSession {
  const steps = Array.isArray(row.steps) ? row.steps : [];
  return {
    runId: row.run_id,
    state: (row.state as Record<string, unknown>) ?? {},
    steps,
    timeline: buildAgentRunTimeline(steps),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function stateSizeOk(state: Record<string, unknown>): boolean {
  return JSON.stringify(state).length <= MAX_STATE_CHARS;
}

export async function getAgentRunSession(
  env: Env,
  runId: string,
  ownerKey: string
): Promise<AgentRunSession | null> {
  const sql = getDb(env);
  const id = normalizeRunId(runId);
  const rows = (await sql`
    SELECT run_id, state, steps, created_at, updated_at
    FROM agent_run_sessions
    WHERE run_id = ${id} AND owner_key = ${ownerKey}
    LIMIT 1
  `) as SessionRow[];
  const row = rows[0];
  return row ? rowToSession(row) : null;
}

export type PatchAgentRunSessionInput = {
  merge?: Record<string, unknown>;
  replaceState?: Record<string, unknown>;
  step?: { name: string; data?: Record<string, unknown> };
};

export async function patchAgentRunSession(
  env: Env,
  runId: string,
  ownerKey: string,
  patch: PatchAgentRunSessionInput
): Promise<
  | { ok: true; session: AgentRunSession }
  | { ok: false; error: "state_too_large" | "invalid_step" }
> {
  const sql = getDb(env);
  const id = normalizeRunId(runId);
  const existing = await getAgentRunSession(env, id, ownerKey);

  let state: Record<string, unknown> = existing?.state ?? {};
  if (patch.replaceState !== undefined) {
    state = patch.replaceState;
  } else if (patch.merge && typeof patch.merge === "object") {
    state = { ...state, ...patch.merge };
  }

  if (!stateSizeOk(state)) {
    return { ok: false, error: "state_too_large" };
  }

  let steps = [...(existing?.steps ?? [])];
  if (patch.step) {
    const name = patch.step.name?.trim();
    if (!name || name.length > 128) {
      return { ok: false, error: "invalid_step" };
    }
    steps.push({
      name,
      at: new Date().toISOString(),
      ...(patch.step.data ? { data: patch.step.data } : {}),
    });
    if (steps.length > MAX_STEPS) {
      steps = steps.slice(-MAX_STEPS);
    }
  }

  const rows = (await sql`
    INSERT INTO agent_run_sessions (run_id, owner_key, state, steps)
    VALUES (${id}, ${ownerKey}, ${JSON.stringify(state)}::jsonb, ${JSON.stringify(steps)}::jsonb)
    ON CONFLICT (run_id, owner_key) DO UPDATE SET
      state = EXCLUDED.state,
      steps = EXCLUDED.steps,
      updated_at = NOW()
    RETURNING run_id, state, steps, created_at, updated_at
  `) as SessionRow[];

  return { ok: true, session: rowToSession(rows[0]!) };
}

export function buildAgentRunTimeline(
  steps: AgentRunStep[]
): AgentRunTimelineEvent[] {
  return steps.map((step, index) => {
    const data = step.data;
    const inboxId = stringField(data, "inboxId");
    const messageId = stringField(data, "messageId");
    const event = timelineShapeForStep(step.name, data);
    return {
      id: `${index + 1}-${step.name}`,
      type: event.type,
      at: step.at,
      title: event.title,
      status: event.status,
      ...(inboxId ? { inboxId } : {}),
      ...(messageId ? { messageId } : {}),
      ...(data ? { data } : {}),
    };
  });
}

function timelineShapeForStep(
  name: string,
  data?: Record<string, unknown>
): Pick<AgentRunTimelineEvent, "type" | "title" | "status"> {
  switch (name) {
    case "inbox.created":
    case "inbox_created":
      return { type: "inbox_created", title: "Inbox created", status: "success" };
    case "wait.started":
      return { type: "wait_started", title: "Wait started", status: "info" };
    case "message.received":
      return { type: "message_received", title: "Message received", status: "success" };
    case "verify.success":
    case "extraction.success":
      return {
        type: "extraction_success",
        title: "Verification extracted",
        status: "success",
      };
    case "verify.timeout":
    case "extraction.failure":
      return {
        type: "extraction_failure",
        title: name === "verify.timeout" ? "Verification timed out" : "Extraction failed",
        status: name === "verify.timeout" ? "timeout" : "failure",
      };
    case "callback.delivery":
      return {
        type: "callback_delivery",
        title: Boolean(data?.ok) ? "Callback delivered" : "Callback failed",
        status: Boolean(data?.ok) ? "success" : "failure",
      };
    case "notify.delivery":
      return {
        type: "notify_delivery",
        title: Boolean(data?.ok) ? "Notify email delivered" : "Notify email failed",
        status: Boolean(data?.ok) ? "success" : "failure",
      };
    case "diagnose.run":
      return { type: "diagnose_run", title: "Diagnose run", status: "info" };
    default:
      return { type: "session_step", title: name, status: "info" };
  }
}

function stringField(
  data: Record<string, unknown> | undefined,
  key: string
): string | null {
  const value = data?.[key];
  return typeof value === "string" && value.trim() ? value : null;
}

async function recordRunStep(
  env: Env,
  runId: string | undefined,
  ownerKey: string,
  step: { name: string; data?: Record<string, unknown> },
  merge?: Record<string, unknown>
): Promise<void> {
  if (!runId?.trim() || !validateRunId(runId)) return;
  try {
    await patchAgentRunSession(env, runId, ownerKey, {
      step,
      ...(merge ? { merge } : {}),
    });
  } catch {
    /* session is best-effort */
  }
}

async function sessionOwnerKeyForInbox(
  env: Env,
  inbox: { api_key_hint?: string | null }
): Promise<string | null> {
  const apiKeyHint = inbox.api_key_hint?.trim();
  if (!apiKeyHint) return null;
  const teamId = await getTeamIdByApiKeyHint(env, apiKeyHint);
  return sessionOwnerKey(teamId, apiKeyHint);
}

async function getTeamIdByApiKeyHint(
  env: Env,
  hint: string | null | undefined
): Promise<string | null> {
  if (!hint?.trim()) return null;
  const sql = getDb(env);
  const rows = (await sql`
    SELECT team_id FROM api_keys WHERE key_hint = ${hint.trim()} LIMIT 1
  `) as { team_id: string }[];
  return rows[0]?.team_id ?? null;
}

async function recordInboxLabelRunStep(
  env: Env,
  inbox: { id: string; label: string | null; api_key_hint?: string | null },
  step: { name: string; data?: Record<string, unknown> },
  merge?: Record<string, unknown>
): Promise<void> {
  try {
    const runId = parseRunIdFromLabel(inbox.label);
    if (!runId) return;
    const ownerKey = await sessionOwnerKeyForInbox(env, inbox);
    if (!ownerKey) return;
    await recordRunStep(env, runId, ownerKey, step, merge);
  } catch {
    /* timeline is best-effort */
  }
}

type VerifySessionResult =
  | {
      status: "verified";
      email: { inboxId: string };
      verification: { otp: string | null; primaryLink: string | null };
    }
  | { status: "timeout"; email: { inboxId: string } };

/** Best-effort session update after verify (REST + MCP). */
export async function recordVerifyRunSession(
  env: Env,
  runId: string | undefined,
  ownerKey: string,
  service: string | undefined,
  result: VerifySessionResult
): Promise<void> {
  if (!runId?.trim() || !validateRunId(runId)) return;

  const lastVerify: Record<string, unknown> = {
    status: result.status,
    at: new Date().toISOString(),
    service: service ?? null,
    inboxId: result.email.inboxId,
  };
  if (result.status === "verified") {
    lastVerify.otp = result.verification.otp ?? null;
    lastVerify.primaryLink = result.verification.primaryLink ?? null;
  }

  await recordRunStep(
    env,
    runId,
    ownerKey,
    {
      name: result.status === "verified" ? "verify.success" : "verify.timeout",
      data: {
        inboxId: result.email.inboxId,
        status: result.status,
        service: service ?? null,
        ...(result.status === "verified"
          ? {
              otp: result.verification.otp ?? null,
              primaryLink: result.verification.primaryLink ?? null,
            }
          : {}),
      },
    },
    { lastVerify }
  );
}

/** Record inbox creation in run session (MCP create_inbox + agents). */
export async function recordInboxRunSession(
  env: Env,
  runId: string | undefined,
  ownerKey: string,
  inbox: { id: string; address: string }
): Promise<void> {
  if (!runId?.trim() || !validateRunId(runId)) return;

  await recordRunStep(
    env,
    runId,
    ownerKey,
    {
      name: "inbox.created",
      data: { inboxId: inbox.id, address: inbox.address },
    },
    { inboxId: inbox.id, address: inbox.address }
  );
}

export async function recordWaitStartedRunSession(
  env: Env,
  runId: string | undefined,
  ownerKey: string,
  input: {
    inboxId: string;
    timeoutSeconds: number;
    subjectContains?: string;
    messageIndex?: number;
  }
): Promise<void> {
  await recordRunStep(env, runId, ownerKey, {
    name: "wait.started",
    data: input as Record<string, unknown>,
  });
}

export async function recordMessageReceivedRunSession(
  env: Env,
  runId: string | undefined,
  ownerKey: string,
  input: {
    inboxId: string;
    messageId: string;
    from: string;
    subject: string;
    receivedAt: string;
  }
): Promise<void> {
  await recordRunStep(env, runId, ownerKey, {
    name: "message.received",
    data: input,
  });
}

export async function recordDiagnoseRunSession(
  env: Env,
  inbox: {
    id: string;
    label: string | null;
    api_key_hint?: string | null;
  },
  input: {
    failureCode?: string | null;
    recommendedAction?: string | null;
    messageCount?: number;
    subjectContains?: string;
    messageIndex?: number;
  }
): Promise<void> {
  await recordInboxLabelRunStep(env, inbox, {
    name: "diagnose.run",
    data: { inboxId: inbox.id, ...input },
  });
}

export async function recordCallbackRunSession(
  env: Env,
  inbox: {
    id: string;
    label: string | null;
    api_key_hint?: string | null;
  },
  input: {
    messageId: string;
    ok: boolean;
    statusCode: number | null;
    source?: string;
  }
): Promise<void> {
  await recordInboxLabelRunStep(env, inbox, {
    name: "callback.delivery",
    data: { inboxId: inbox.id, ...input },
  });
}

export async function recordNotifyRunSession(
  env: Env,
  inbox: {
    id: string;
    label: string | null;
    api_key_hint?: string | null;
  },
  input: {
    messageId: string;
    ok: boolean;
    resendId: string | null;
    error?: string;
  }
): Promise<void> {
  await recordInboxLabelRunStep(env, inbox, {
    name: "notify.delivery",
    data: { inboxId: inbox.id, ...input },
  });
}
