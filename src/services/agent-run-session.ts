/** Multi-step agent run state (scoped by team or api key hint) */
import type { Env } from "../env";
import { getDb } from "../db/client";
import { normalizeRunId, validateRunId } from "../lib/validate-run-id";

export interface AgentRunStep {
  name: string;
  at: string;
  data?: Record<string, unknown>;
}

export interface AgentRunSession {
  runId: string;
  state: Record<string, unknown>;
  steps: AgentRunStep[];
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
  return {
    runId: row.run_id,
    state: (row.state as Record<string, unknown>) ?? {},
    steps: Array.isArray(row.steps) ? row.steps : [],
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

  try {
    await patchAgentRunSession(env, runId, ownerKey, {
      step: {
        name: result.status === "verified" ? "verify.success" : "verify.timeout",
      },
      merge: { lastVerify },
    });
  } catch {
    /* session is best-effort */
  }
}

/** Record inbox creation in run session (MCP create_inbox + agents). */
export async function recordInboxRunSession(
  env: Env,
  runId: string | undefined,
  ownerKey: string,
  inbox: { id: string; address: string }
): Promise<void> {
  if (!runId?.trim() || !validateRunId(runId)) return;

  try {
    await patchAgentRunSession(env, runId, ownerKey, {
      step: { name: "inbox.created", data: { address: inbox.address } },
      merge: { inboxId: inbox.id, address: inbox.address },
    });
  } catch {
    /* best-effort */
  }
}
