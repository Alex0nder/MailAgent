/** Rule-based Gmail thread disposition: needs_reply vs waiting_on_them (P1.10). */
import type { WorkspaceMailMessage } from "./workspace-agent";

export type GmailThreadDisposition =
  | "needs_reply"
  | "waiting_on_them"
  | "fyi"
  | "automated";

export type GmailThreadClassification = {
  disposition: GmailThreadDisposition;
  confidence: "high" | "medium" | "low";
  reason: string;
  lastFrom: string | null;
  subject: string | null;
  receivedAt: string | null;
};

const AUTOMATED_FROM =
  /(?:no[-_.]?reply|donotreply|do-not-reply|mailer-daemon|notifications?|newsletter|billing@|noreply)/i;
const AUTOMATED_SUBJECT = /\b(receipt|invoice|order confirmed|password reset|verification code|unsubscribe)\b/i;
const ACTION_RE =
  /\b(please|can you|could you|would you|need to|let me know|follow up|send|review|approve|schedule|confirm|remind|waiting for your|your thoughts)\b/i;

function normalizeEmail(value?: string): string | null {
  if (!value?.trim()) return null;
  const match = value.match(/[\w.+-]+@[\w.-]+\.\w+/i);
  return match?.[0]?.toLowerCase() ?? null;
}

function lastMessage(messages: WorkspaceMailMessage[]): WorkspaceMailMessage | null {
  if (!messages.length) return null;
  return messages.reduce((latest, message) => {
    const latestTs =
      typeof latest.receivedAt === "string" ? Date.parse(latest.receivedAt) : 0;
    const messageTs =
      typeof message.receivedAt === "string" ? Date.parse(message.receivedAt) : 0;
    return messageTs >= latestTs ? message : latest;
  });
}

export function classifyGmailThread(
  accountEmail: string,
  messages: WorkspaceMailMessage[]
): GmailThreadClassification {
  const last = lastMessage(messages);
  const lastFrom = last?.from?.trim() ?? null;
  const subject = last?.subject?.trim() ?? messages[0]?.subject?.trim() ?? null;
  const receivedAt =
    typeof last?.receivedAt === "string" ? last.receivedAt : null;
  const lastText = [last?.subject, last?.text].filter(Boolean).join(" ").trim();
  const userEmail = normalizeEmail(accountEmail);

  if (!last) {
    return {
      disposition: "fyi",
      confidence: "low",
      reason: "empty_thread",
      lastFrom,
      subject,
      receivedAt,
    };
  }

  const lastSender = normalizeEmail(lastFrom ?? undefined);
  if (
    AUTOMATED_FROM.test(lastFrom ?? "") ||
    (subject && AUTOMATED_SUBJECT.test(subject))
  ) {
    return {
      disposition: "automated",
      confidence: "high",
      reason: "automated_sender_or_subject",
      lastFrom,
      subject,
      receivedAt,
    };
  }

  if (userEmail && lastSender === userEmail) {
    return {
      disposition: "waiting_on_them",
      confidence: "high",
      reason: "last_message_from_account_owner",
      lastFrom,
      subject,
      receivedAt,
    };
  }

  if (lastText.includes("?") || ACTION_RE.test(lastText)) {
    return {
      disposition: "needs_reply",
      confidence: lastText.includes("?") ? "high" : "medium",
      reason: lastText.includes("?") ? "question_in_last_message" : "action_request_in_last_message",
      lastFrom,
      subject,
      receivedAt,
    };
  }

  if (messages.length === 1 && lastSender && lastSender !== userEmail) {
    return {
      disposition: "needs_reply",
      confidence: "medium",
      reason: "unanswered_inbound_thread",
      lastFrom,
      subject,
      receivedAt,
    };
  }

  return {
    disposition: "fyi",
    confidence: "medium",
    reason: "no_open_action_detected",
    lastFrom,
    subject,
    receivedAt,
  };
}
