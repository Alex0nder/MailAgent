/** Rule engine: invoice, support, meeting, follow-up classification (P4.21). */
import type { GmailThreadDisposition } from "./gmail-thread-classifier";

export type WorkspaceRuleKind = "invoice" | "support" | "meeting" | "follow_up";

export type WorkspaceRuleMatch = {
  kind: WorkspaceRuleKind;
  confidence: "high" | "medium" | "low";
  reason: string;
  suggestedAction: string;
};

const RULE_META: Record<
  WorkspaceRuleKind,
  { patterns: RegExp; action: string }
> = {
  invoice: {
    patterns: /\b(invoice|receipt|billing|payment due|stripe|xero|quickbooks|vat|po #)\b/i,
    action: "Review invoice and confirm payment or forward to finance.",
  },
  support: {
    patterns: /\b(support|ticket|help desk|case #|bug report|incident|escalation|customer issue)\b/i,
    action: "Triage support thread and assign owner or draft a status reply.",
  },
  meeting: {
    patterns: /\b(meet(?:ing)?|call|sync|catch up|calendar|zoom|teams|google meet|schedule)\b/i,
    action: "Check calendar availability and propose meeting slots.",
  },
  follow_up: {
    patterns: /\b(follow up|checking in|reminder|pending|waiting on|bump|any update)\b/i,
    action: "Send follow-up or create a reminder with due date.",
  },
};

export const WORKSPACE_RULE_KINDS: WorkspaceRuleKind[] = [
  "invoice",
  "support",
  "meeting",
  "follow_up",
];

export function classifyWorkspaceRule(input: {
  subject?: string;
  text?: string;
  snippet?: string;
  disposition?: GmailThreadDisposition;
}): WorkspaceRuleMatch | null {
  const haystack = [input.subject, input.text, input.snippet].filter(Boolean).join(" ").trim();
  if (!haystack) return null;

  if (input.disposition === "automated") {
    for (const kind of ["invoice"] as WorkspaceRuleKind[]) {
      if (RULE_META[kind].patterns.test(haystack)) {
        return {
          kind,
          confidence: "high",
          reason: "automated_sender_with_invoice_signal",
          suggestedAction: RULE_META[kind].action,
        };
      }
    }
  }

  if (input.disposition === "needs_reply") {
    for (const kind of ["support", "follow_up"] as WorkspaceRuleKind[]) {
      if (RULE_META[kind].patterns.test(haystack)) {
        return {
          kind,
          confidence: "high",
          reason: "needs_reply_with_rule_keyword",
          suggestedAction: RULE_META[kind].action,
        };
      }
    }
  }

  let best: WorkspaceRuleMatch | null = null;
  for (const kind of WORKSPACE_RULE_KINDS) {
    if (!RULE_META[kind].patterns.test(haystack)) continue;
    const match: WorkspaceRuleMatch = {
      kind,
      confidence: kind === "meeting" ? "medium" : "high",
      reason: `keyword_match_${kind}`,
      suggestedAction: RULE_META[kind].action,
    };
    if (!best || match.confidence === "high") best = match;
  }

  if (!best && input.disposition === "needs_reply") {
    return {
      kind: "follow_up",
      confidence: "medium",
      reason: "needs_reply_default",
      suggestedAction: RULE_META.follow_up.action,
    };
  }

  return best;
}

export function evaluateThreadsAgainstRules(input: {
  threads: Array<{
    threadId: string;
    subject?: string | null;
    snippet?: string;
    disposition?: GmailThreadDisposition;
    from?: string | null;
  }>;
  enabledKinds?: WorkspaceRuleKind[];
}): Array<{
  threadId: string;
  subject: string | null;
  snippet: string | null;
  from: string | null;
  match: WorkspaceRuleMatch;
}> {
  const kinds = new Set(input.enabledKinds ?? WORKSPACE_RULE_KINDS);
  const hits: Array<{
    threadId: string;
    subject: string | null;
    snippet: string | null;
    from: string | null;
    match: WorkspaceRuleMatch;
  }> = [];

  for (const thread of input.threads) {
    const match = classifyWorkspaceRule({
      subject: thread.subject ?? undefined,
      snippet: thread.snippet,
      disposition: thread.disposition,
    });
    if (!match || !kinds.has(match.kind)) continue;
    hits.push({
      threadId: thread.threadId,
      subject: thread.subject ?? null,
      snippet: thread.snippet ?? null,
      from: thread.from ?? null,
      match,
    });
  }

  return hits;
}
