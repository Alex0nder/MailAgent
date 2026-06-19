/** Workspace Agent core: safe summaries, draft replies, and reminder suggestions. */
import type { Env } from "../env";
import { redactForLlm, runWorkspaceLlmJson, workspaceProviderInfo } from "./llm-provider";

export type WorkspaceMailMessage = {
  id?: string;
  from?: string;
  to?: string[];
  cc?: string[];
  subject?: string;
  text?: string;
  receivedAt?: string;
};

export type WorkspaceSummarizeInput = {
  threadId?: string;
  messages?: WorkspaceMailMessage[];
  goal?: string;
};

export type WorkspaceDraftReplyInput = WorkspaceSummarizeInput & {
  tone?: "concise" | "friendly" | "formal";
  instruction?: string;
};

export type WorkspaceReminderInput = WorkspaceSummarizeInput & {
  now?: string;
  timezone?: string;
};

function normalizeMessages(input?: WorkspaceMailMessage[]): WorkspaceMailMessage[] {
  return (input ?? [])
    .filter((m) => m && (m.subject || m.text || m.from))
    .slice(0, 20)
    .map((m, index) => ({
      id: m.id?.trim() || `msg-${index + 1}`,
      from: m.from?.trim(),
      to: Array.isArray(m.to) ? m.to.slice(0, 10) : undefined,
      cc: Array.isArray(m.cc) ? m.cc.slice(0, 10) : undefined,
      subject: m.subject?.trim(),
      text: m.text?.slice(0, 8000),
      receivedAt: m.receivedAt?.trim(),
    }));
}

function joinedText(messages: WorkspaceMailMessage[]): string {
  return messages
    .map((m) => [m.subject, m.from, m.text].filter(Boolean).join("\n"))
    .join("\n\n")
    .trim();
}

function sentences(text: string): string[] {
  return text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function extractActionItems(text: string): string[] {
  const actionRe = /\b(please|can you|could you|need to|todo|action|required|follow up|send|review|approve|schedule|confirm|remind)\b/i;
  return sentences(text)
    .filter((s) => actionRe.test(s))
    .slice(0, 8);
}

function fallbackSummary(messages: WorkspaceMailMessage[], goal?: string) {
  const text = joinedText(messages);
  const clean = redactForLlm(text);
  const first = sentences(clean).slice(0, 3);
  const subjects = Array.from(
    new Set(messages.map((m) => m.subject).filter(Boolean) as string[])
  ).slice(0, 3);
  return {
    summary: first.join(" ") || "No message content supplied.",
    subjectHints: subjects,
    actionItems: extractActionItems(clean),
    decisions: sentences(clean).filter((s) => /\b(decided|approved|confirmed|agreed)\b/i.test(s)).slice(0, 5),
    openQuestions: sentences(clean).filter((s) => s.includes("?")).slice(0, 5),
    goal: goal?.trim() || null,
  };
}

function fallbackDraft(messages: WorkspaceMailMessage[], input: WorkspaceDraftReplyInput) {
  const summary = fallbackSummary(messages, input.goal);
  const tone = input.tone ?? "concise";
  const action = summary.actionItems[0];
  const body = [
    tone === "formal" ? "Hello," : "Hi,",
    "",
    action
      ? `Thanks for the context. I will follow up on: ${action}`
      : "Thanks for the context. I reviewed the thread and will follow up with the next steps.",
    input.instruction ? `\n${input.instruction}` : "",
    "",
    "Best,",
  ].join("\n");
  return {
    draft: body,
    tone,
    confidence: "low" as const,
    risks: ["Rule-based fallback was used because the configured LLM was unavailable."],
    missingContext: [],
  };
}

function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string").slice(0, 10)
    : [];
}

function fallbackReminders(messages: WorkspaceMailMessage[], now?: string) {
  const text = redactForLlm(joinedText(messages));
  const items = extractActionItems(text);
  return {
    reminders: items.slice(0, 5).map((item, index) => ({
      title: item.slice(0, 120),
      dueHint: index === 0 ? "tomorrow" : "next business day",
      source: "message",
    })),
    now: now ?? new Date().toISOString(),
  };
}

export async function summarizeWorkspaceThread(env: Env, input: WorkspaceSummarizeInput) {
  const messages = normalizeMessages(input.messages);
  const fallback = fallbackSummary(messages, input.goal);
  const llm = await runWorkspaceLlmJson(env, "summary", {
    threadId: input.threadId,
    goal: input.goal,
    messages,
    requiredJsonShape: {
      summary: "string",
      actionItems: "string[]",
      decisions: "string[]",
      openQuestions: "string[]",
    },
  });
  return {
    mode: llm.ok ? "llm" : "rules",
    provider: workspaceProviderInfo(env),
    redaction: "enabled",
    ...(llm.ok ? llm.json : fallback),
    ...(llm.ok ? {} : { fallbackReason: llm.error }),
  };
}

export async function draftWorkspaceReply(env: Env, input: WorkspaceDraftReplyInput) {
  const messages = normalizeMessages(input.messages);
  const fallback = fallbackDraft(messages, input);
  const llm = await runWorkspaceLlmJson(env, "draft_reply", {
    threadId: input.threadId,
    goal: input.goal,
    tone: input.tone ?? "concise",
    instruction: input.instruction,
    messages,
    requiredJsonShape: {
      draft: "string",
      confidence: "high | medium | low",
      risks: "string[]",
      missingContext: "string[]",
    },
    policy: "Draft only. Do not claim the message has been sent.",
  });
  const llmDraft = llm.ok && typeof llm.json.draft === "string"
    ? llm.json.draft.trim()
    : "";
  const risks = llm.ok ? stringList(llm.json.risks) : fallback.risks;
  const missingContext = llm.ok ? stringList(llm.json.missingContext) : fallback.missingContext;
  const rawConfidence = llm.ok ? llm.json.confidence : fallback.confidence;
  const confidence: "high" | "medium" | "low" =
    rawConfidence === "high" || rawConfidence === "medium" || rawConfidence === "low"
      ? rawConfidence
      : "low";
  const useLlm = llm.ok && Boolean(llmDraft);
  return {
    mode: useLlm ? "llm" : "rules",
    provider: workspaceProviderInfo(env),
    redaction: "enabled",
    requiresApproval: true,
    sendAllowed: false,
    draft: useLlm ? llmDraft : fallback.draft,
    tone: input.tone ?? "concise",
    confidence: useLlm ? confidence : "low",
    risks: useLlm ? risks : fallback.risks,
    missingContext: useLlm ? missingContext : fallback.missingContext,
    ...(useLlm ? {} : { fallbackReason: llm.ok ? "llm_invalid_draft" : llm.error }),
  };
}

export async function suggestWorkspaceReminders(env: Env, input: WorkspaceReminderInput) {
  const messages = normalizeMessages(input.messages);
  const fallback = fallbackReminders(messages, input.now);
  const llm = await runWorkspaceLlmJson(env, "reminder_suggest", {
    threadId: input.threadId,
    goal: input.goal,
    now: input.now,
    timezone: input.timezone,
    messages,
    requiredJsonShape: {
      reminders: "array of { title, dueHint, reason, sourceMessageId }",
    },
  });
  return {
    mode: llm.ok ? "llm" : "rules",
    provider: workspaceProviderInfo(env),
    redaction: "enabled",
    ...(llm.ok ? llm.json : fallback),
    ...(llm.ok ? {} : { fallbackReason: llm.error }),
  };
}
