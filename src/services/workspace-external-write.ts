/** Approval-gated Gmail draft + Calendar event writes (P3). */
import type { Env } from "../env";
import { upsertCalendarEvent, type CalendarEventWriteInput } from "./calendar-event-write";
import { createGmailDraft } from "./gmail-draft-write";
import { readGmailThread } from "./gmail-read";
import { draftWorkspaceReply } from "./workspace-agent";
import { logWorkspaceAction } from "./workspace-actions";
import { getWorkspaceAutonomyPolicy } from "./workspace-autonomy";
import type { WorkspaceReminderAuth } from "./workspace-reminders";
import {
  claimWorkspaceWriteExecution,
  finishWorkspaceWriteExecution,
} from "./workspace-write-executions";

export type WorkspaceExecuteGmailDraftInput = {
  gmailAccountId?: string;
  threadId?: string;
  to?: string;
  subject?: string;
  body?: string;
  instruction?: string;
  tone?: "concise" | "friendly" | "formal";
  dryRun?: boolean;
  idempotencyKey?: string;
};

export type WorkspaceExecuteCalendarEventInput = CalendarEventWriteInput & {
  dryRun?: boolean;
  idempotencyKey?: string;
};

function cleanString(value?: string, max = 256): string | undefined {
  const clean = value?.trim();
  return clean ? clean.slice(0, max) : undefined;
}

function emailAddress(value: string): string | null {
  const match = value.trim().match(/<?([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})>?/i);
  return match?.[1]?.toLowerCase() ?? null;
}

export function evaluateGmailDraftWritePolicy(policy: {
  gmailDraftWrites: boolean;
}) {
  if (!policy.gmailDraftWrites) {
    return {
      allowed: false as const,
      code: "gmail_draft_writes_disabled",
      reason: "Admin must enable gmailDraftWrites on workspace policy.",
    };
  }
  return {
    allowed: true as const,
    code: "allowed",
    reason: "Gmail draft write approved by policy.",
  };
}

export function evaluateCalendarEventWritePolicy(policy: {
  calendarEventWrites: boolean;
}) {
  if (!policy.calendarEventWrites) {
    return {
      allowed: false as const,
      code: "calendar_event_writes_disabled",
      reason: "Admin must enable calendarEventWrites on workspace policy.",
    };
  }
  return {
    allowed: true as const,
    code: "allowed",
    reason: "Calendar event write approved by policy.",
  };
}

export async function executeWorkspaceGmailDraft(
  env: Env,
  auth: WorkspaceReminderAuth,
  input: WorkspaceExecuteGmailDraftInput
) {
  const accountId = cleanString(input.gmailAccountId, 120);
  const threadId = cleanString(input.threadId, 120);
  const idempotencyKey = cleanString(input.idempotencyKey, 160);
  if (!accountId) {
    return { ok: false as const, status: 400 as const, error: "gmail_account_id_required" };
  }
  if (!input.dryRun && (!idempotencyKey || !/^[A-Za-z0-9._:-]+$/.test(idempotencyKey))) {
    return { ok: false as const, status: 400 as const, error: "valid_idempotency_key_required" };
  }

  const policy = await getWorkspaceAutonomyPolicy(env, auth);
  const decision = evaluateGmailDraftWritePolicy(policy);

  let execution: Awaited<ReturnType<typeof claimWorkspaceWriteExecution>>["execution"] | undefined;
  if (!input.dryRun) {
    const claim = await claimWorkspaceWriteExecution(env, auth, {
      kind: "gmail_draft",
      idempotencyKey: idempotencyKey!,
      accountId,
      request: { threadId, instruction: input.instruction, tone: input.tone },
    });
    if (!claim.claimed) {
      return {
        ok: true as const,
        replayed: true,
        executed: claim.execution.status === "executed",
        execution: claim.execution,
      };
    }
    execution = claim.execution;
  }

  if (!decision.allowed) {
    const finished = execution
      ? await finishWorkspaceWriteExecution(env, auth, execution.id, {
          status: "denied",
          denialCode: decision.code,
          result: { decision },
        })
      : undefined;
    return {
      ok: true as const,
      dryRun: input.dryRun,
      executed: false,
      decision,
      execution: finished,
    };
  }

  let to = cleanString(input.to, 320);
  let subject = cleanString(input.subject, 320);
  let body = cleanString(input.body, 8000);

  if (threadId && (!to || !subject || !body)) {
    const thread = await readGmailThread(env, auth, { accountId, threadId });
    if ("error" in thread) {
      return { ok: false as const, status: thread.status, error: thread.error };
    }
    const lastInbound = [...thread.messages]
      .reverse()
      .find((message) => {
        const addr = emailAddress(message.from ?? "");
        return addr && !addr.includes("@mailagent");
      });
    if (!to) to = lastInbound?.from ?? thread.messages.at(-1)?.from;
    if (!subject) {
      const base = thread.messages[0]?.subject ?? "Follow up";
      subject = base.match(/^re:/i) ? base : `Re: ${base}`;
    }
    if (!body) {
      const draft = await draftWorkspaceReply(env, {
        threadId,
        instruction: cleanString(input.instruction, 2000),
        tone: input.tone,
        messages: thread.messages,
      });
      body = draft.draft;
    }
  }

  if (!to || !subject || !body) {
    return { ok: false as const, status: 400 as const, error: "to_subject_body_or_thread_required" };
  }

  const preview = { to, subject, body, threadId: threadId ?? null, requiresApproval: true };

  if (input.dryRun) {
    return { ok: true as const, dryRun: true, executed: false, decision, preview };
  }

  const created = await createGmailDraft(env, auth, {
    accountId,
    to,
    subject,
    body,
    threadId,
  });

  if ("error" in created) {
    const finished = await finishWorkspaceWriteExecution(env, auth, execution!.id, {
      status: "failed",
      denialCode: created.error,
      result: { decision, preview, error: created.error },
    });
    return {
      ok: true as const,
      executed: false,
      decision: { allowed: false, code: created.error, reason: created.error },
      preview,
      execution: finished,
    };
  }

  const finished = await finishWorkspaceWriteExecution(env, auth, execution!.id, {
    status: "executed",
    result: { decision, preview, draft: created },
  });

  await logWorkspaceAction(env, auth, {
    threadId: created.threadId ?? threadId,
    actionType: "draft_prepared",
    title: `Gmail draft created: ${subject}`,
    note: decision.reason,
    meta: { draftId: created.draftId, executionId: execution!.id, provider: "gmail" },
  });

  return {
    ok: true as const,
    executed: true,
    decision,
    preview,
    draft: created,
    execution: finished,
  };
}

export async function executeWorkspaceCalendarEvent(
  env: Env,
  auth: WorkspaceReminderAuth,
  input: WorkspaceExecuteCalendarEventInput
) {
  const accountId = cleanString(input.accountId, 120);
  const idempotencyKey = cleanString(input.idempotencyKey, 160);
  const summary = cleanString(input.summary, 320);
  const start = cleanString(input.start, 64);
  const end = cleanString(input.end, 64);
  if (!accountId || !summary || !start || !end) {
    return {
      ok: false as const,
      status: 400 as const,
      error: "account_id_summary_start_end_required",
    };
  }
  if (!input.dryRun && (!idempotencyKey || !/^[A-Za-z0-9._:-]+$/.test(idempotencyKey))) {
    return { ok: false as const, status: 400 as const, error: "valid_idempotency_key_required" };
  }

  const policy = await getWorkspaceAutonomyPolicy(env, auth);
  const decision = evaluateCalendarEventWritePolicy(policy);
  const kind = input.eventId?.trim() ? "calendar_update" : "calendar_create";

  let execution: Awaited<ReturnType<typeof claimWorkspaceWriteExecution>>["execution"] | undefined;
  if (!input.dryRun) {
    const claim = await claimWorkspaceWriteExecution(env, auth, {
      kind,
      idempotencyKey: idempotencyKey!,
      accountId,
      request: { summary, start, end, eventId: input.eventId },
    });
    if (!claim.claimed) {
      return {
        ok: true as const,
        replayed: true,
        executed: claim.execution.status === "executed",
        execution: claim.execution,
      };
    }
    execution = claim.execution;
  }

  const preview = {
    summary,
    start,
    end,
    timeZone: input.timeZone ?? "UTC",
    description: input.description ?? null,
    location: input.location ?? null,
    eventId: input.eventId ?? null,
    requiresApproval: true,
  };

  if (!decision.allowed) {
    const finished = execution
      ? await finishWorkspaceWriteExecution(env, auth, execution.id, {
          status: "denied",
          denialCode: decision.code,
          result: { decision, preview },
        })
      : undefined;
    return {
      ok: true as const,
      dryRun: input.dryRun,
      executed: false,
      decision,
      preview,
      execution: finished,
    };
  }

  if (input.dryRun) {
    return { ok: true as const, dryRun: true, executed: false, decision, preview };
  }

  const written = await upsertCalendarEvent(env, auth, {
    accountId,
    summary,
    start,
    end,
    timeZone: input.timeZone,
    description: input.description,
    location: input.location,
    eventId: input.eventId,
  });

  if ("error" in written) {
    const finished = await finishWorkspaceWriteExecution(env, auth, execution!.id, {
      status: "failed",
      denialCode: written.error,
      result: { decision, preview, error: written.error },
    });
    return {
      ok: true as const,
      executed: false,
      decision: { allowed: false, code: written.error, reason: written.error },
      preview,
      execution: finished,
    };
  }

  const finished = await finishWorkspaceWriteExecution(env, auth, execution!.id, {
    status: "executed",
    result: { decision, preview, event: written },
  });

  await logWorkspaceAction(env, auth, {
    actionType: "completed",
    title: `Calendar event ${written.status}: ${summary}`,
    note: decision.reason,
    meta: { eventId: written.eventId, executionId: execution!.id, provider: "google_calendar" },
  });

  return {
    ok: true as const,
    executed: true,
    decision,
    preview,
    event: written,
    execution: finished,
  };
}
