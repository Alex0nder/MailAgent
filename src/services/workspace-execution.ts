/** Policy-gated autonomous reply execution using a real stored inbound message. */
import type { Env } from "../env";
import { getInbox, getMessage } from "./inbox";
import { sendFromInbox } from "./outbound-mail";
import { draftWorkspaceReply } from "./workspace-agent";
import { logWorkspaceAction } from "./workspace-actions";
import {
  claimWorkspaceExecution,
  countRecentWorkspaceExecutions,
  finishWorkspaceExecution,
  getWorkspaceAutonomyPolicy,
  type WorkspaceAutonomyMode,
  type WorkspaceConfidence,
} from "./workspace-autonomy";
import {
  completeWorkspaceReminder,
  type WorkspaceReminderAuth,
} from "./workspace-reminders";

export type WorkspaceExecuteReplyInput = {
  inboxId?: string;
  messageId?: string;
  reminderId?: string;
  idempotencyKey?: string;
  instruction?: string;
  tone?: "concise" | "friendly" | "formal";
  dryRun?: boolean;
};

export type WorkspacePolicyDecisionInput = {
  mode: WorkspaceAutonomyMode;
  recipient: string;
  allowedRecipientDomains: string[];
  minConfidence: WorkspaceConfidence;
  confidence: WorkspaceConfidence;
  draftMode: string;
  risks: string[];
  missingContext: string[];
  recentExecutions: number;
  maxSendsPerHour: number;
};

const CONFIDENCE_RANK: Record<WorkspaceConfidence, number> = {
  low: 0,
  medium: 1,
  high: 2,
};

function emailAddress(value: string): string | null {
  const match = value.trim().match(/<?([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})>?/i);
  return match?.[1]?.toLowerCase() ?? null;
}

export function evaluateWorkspaceReplyPolicy(input: WorkspacePolicyDecisionInput) {
  if (input.mode === "draft_only") {
    return { allowed: false as const, code: "policy_draft_only", reason: "Policy only permits drafts." };
  }
  if (input.mode === "auto_send_safe" && input.allowedRecipientDomains.length === 0) {
    return {
      allowed: false as const,
      code: "recipient_allowlist_required",
      reason: "auto_send_safe requires an explicit recipient-domain allowlist.",
    };
  }
  const recipient = emailAddress(input.recipient);
  if (!recipient) {
    return { allowed: false as const, code: "invalid_recipient", reason: "Inbound sender has no valid email address." };
  }
  const [localPart, domain] = recipient.split("@");
  if (/^(no-?reply|do-?not-?reply|mailer-daemon)$/i.test(localPart ?? "")) {
    return { allowed: false as const, code: "automated_recipient", reason: "Automated sender addresses cannot receive autonomous replies." };
  }
  if (
    input.allowedRecipientDomains.length > 0 &&
    !input.allowedRecipientDomains.some(
      (allowed) => domain === allowed || domain?.endsWith(`.${allowed}`)
    )
  ) {
    return { allowed: false as const, code: "recipient_domain_denied", reason: "Recipient domain is outside the policy allowlist." };
  }
  if (input.draftMode !== "llm") {
    return { allowed: false as const, code: "llm_required", reason: "Rule-based fallback drafts are never auto-sent." };
  }
  const requiredConfidence = input.mode === "auto_send_safe" ? "high" : input.minConfidence;
  if (CONFIDENCE_RANK[input.confidence] < CONFIDENCE_RANK[requiredConfidence]) {
    return { allowed: false as const, code: "confidence_too_low", reason: "Draft confidence is below policy threshold." };
  }
  if (input.risks.length > 0) {
    return { allowed: false as const, code: "draft_has_risks", reason: "Draft contains unresolved risks." };
  }
  if (input.missingContext.length > 0) {
    return { allowed: false as const, code: "missing_context", reason: "Draft requires additional context." };
  }
  if (input.recentExecutions >= input.maxSendsPerHour) {
    return { allowed: false as const, code: "hourly_limit_reached", reason: "Hourly autonomous send limit reached." };
  }
  return { allowed: true as const, code: "allowed", reason: "Reply satisfies the configured autonomy policy." };
}

function cleanString(value?: string, max = 256): string | undefined {
  const clean = value?.trim();
  return clean ? clean.slice(0, max) : undefined;
}

export async function executeWorkspaceReply(
  env: Env,
  auth: WorkspaceReminderAuth & { teamId: string | null },
  input: WorkspaceExecuteReplyInput
): Promise<
  | { ok: false; status: 400 | 404; error: string }
  | { ok: true; replayed?: boolean; dryRun?: boolean; sent: boolean; decision?: Record<string, unknown>; draft?: Record<string, unknown>; execution?: Record<string, unknown> }
> {
  const inboxId = cleanString(input.inboxId, 120);
  const messageId = cleanString(input.messageId, 160);
  const reminderId = cleanString(input.reminderId, 120);
  const idempotencyKey = cleanString(input.idempotencyKey, 160);
  if (!inboxId || !messageId) {
    return { ok: false, status: 400, error: "inbox_id_and_message_id_required" };
  }
  if (!input.dryRun && (!idempotencyKey || !/^[A-Za-z0-9._:-]+$/.test(idempotencyKey))) {
    return { ok: false, status: 400, error: "valid_idempotency_key_required" };
  }

  const inbox = await getInbox(env, inboxId, { apiKeyHint: auth.apiKeyHint });
  if (!inbox) return { ok: false, status: 404, error: "inbox_not_found" };
  const parent = await getMessage(env, inbox.id, messageId);
  if (!parent || parent.direction === "outbound") {
    return { ok: false, status: 404, error: "inbound_message_not_found" };
  }

  let execution: Awaited<ReturnType<typeof claimWorkspaceExecution>>["execution"] | undefined;
  if (!input.dryRun) {
    const claim = await claimWorkspaceExecution(env, auth, {
      idempotencyKey: idempotencyKey!,
      reminderId,
      inboxId,
      messageId,
      request: {
        instruction: cleanString(input.instruction, 2000),
        tone: input.tone ?? "concise",
      },
    });
    if (!claim.claimed) {
      return {
        ok: true,
        replayed: true,
        sent: claim.execution.status === "sent",
        execution: claim.execution,
      };
    }
    execution = claim.execution;
  }

  const policy = await getWorkspaceAutonomyPolicy(env, auth);
  if (policy.mode === "draft_only") {
    const decision = evaluateWorkspaceReplyPolicy({
      ...policy,
      recipient: parent.from_addr,
      confidence: "low",
      draftMode: "none",
      risks: [],
      missingContext: [],
      recentExecutions: 0,
    });
    const finished = execution
      ? await finishWorkspaceExecution(env, auth, execution.id, {
          status: "denied",
          denialCode: decision.code,
          result: { decision },
        })
      : undefined;
    return {
      ok: true,
      dryRun: input.dryRun,
      sent: false,
      decision,
      execution: finished ?? undefined,
    };
  }

  const draft = await draftWorkspaceReply(env, {
    threadId: parent.thread_id ?? parent.id,
    instruction: cleanString(input.instruction, 2000),
    tone: input.tone,
    messages: [
      {
        id: parent.id,
        from: parent.from_addr,
        subject: parent.subject,
        text: parent.text_preview ?? parent.html_preview ?? "",
        receivedAt: parent.received_at,
      },
    ],
  });
  const recentExecutions = await countRecentWorkspaceExecutions(env, auth);
  const decision = evaluateWorkspaceReplyPolicy({
    ...policy,
    recipient: parent.from_addr,
    confidence: draft.confidence,
    draftMode: draft.mode,
    risks: draft.risks,
    missingContext: draft.missingContext,
    recentExecutions: execution ? Math.max(0, recentExecutions - 1) : recentExecutions,
  });

  if (input.dryRun) {
    return { ok: true, dryRun: true, sent: false, decision, draft };
  }
  if (!decision.allowed) {
    const finished = await finishWorkspaceExecution(env, auth, execution!.id, {
      status: "denied",
      denialCode: decision.code,
      result: { decision, draft },
    });
    await logWorkspaceAction(env, auth, {
      reminderId,
      threadId: parent.thread_id ?? parent.id,
      messageId: parent.id,
      actionType: "send_denied",
      status: "blocked",
      title: `Autonomous reply denied: ${decision.code}`,
      note: decision.reason,
      meta: { executionId: execution!.id },
    });
    return { ok: true, sent: false, decision, draft, execution: finished ?? undefined };
  }

  const recipient = emailAddress(parent.from_addr)!;
  let sentMessage: Awaited<ReturnType<typeof sendFromInbox>>;
  try {
    sentMessage = await sendFromInbox(env, {
      inboxId,
      apiKeyHint: auth.apiKeyHint,
      teamId: auth.teamId,
      to: [recipient],
      subject: parent.subject.match(/^re:/i) ? parent.subject : `Re: ${parent.subject}`,
      text: draft.draft,
      inReplyToMessageId: parent.id,
    });
    if (!sentMessage) throw new Error("send_failed");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const finished = await finishWorkspaceExecution(env, auth, execution!.id, {
      status: "failed",
      denialCode: "send_failed",
      result: { decision, draft, error: message },
    });
    await logWorkspaceAction(env, auth, {
      reminderId,
      threadId: parent.thread_id ?? parent.id,
      messageId: parent.id,
      actionType: "send_failed",
      status: "blocked",
      title: "Autonomous reply failed",
      note: message,
      meta: { executionId: execution!.id },
    });
    return { ok: true, sent: false, decision: { allowed: false, code: "send_failed", reason: message }, draft, execution: finished ?? undefined };
  }

  const finished = await finishWorkspaceExecution(env, auth, execution!.id, {
    status: "sent",
    result: { decision, draft, message: sentMessage },
  });
  try {
    await logWorkspaceAction(env, auth, {
      reminderId,
      threadId: sentMessage.threadId,
      messageId: sentMessage.messageId,
      actionType: "sent",
      title: `Autonomous reply sent: ${sentMessage.subject}`,
      note: decision.reason,
      meta: { executionId: execution!.id, recipient },
    });
    if (reminderId) await completeWorkspaceReminder(env, auth, reminderId);
  } catch {
    // The send result is authoritative; bookkeeping failure must never trigger a resend.
  }
  return { ok: true, sent: true, decision, draft, execution: finished ?? undefined };
}
