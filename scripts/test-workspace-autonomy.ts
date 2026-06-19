import type { Env } from "../src/env";
import { workspaceProviderInfo } from "../src/services/llm-provider";
import { evaluateWorkspaceReplyPolicy } from "../src/services/workspace-execution";

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

const safe = {
  mode: "auto_send_safe" as const,
  recipient: "Alice <alice@example.com>",
  allowedRecipientDomains: ["example.com"],
  minConfidence: "high" as const,
  confidence: "high" as const,
  draftMode: "llm",
  risks: [] as string[],
  missingContext: [] as string[],
  recentExecutions: 0,
  maxSendsPerHour: 5,
};

const allowed = evaluateWorkspaceReplyPolicy(safe);
assert(allowed.allowed, "safe high-confidence reply is allowed");

assert(
  evaluateWorkspaceReplyPolicy({ ...safe, allowedRecipientDomains: [] }).code ===
    "recipient_allowlist_required",
  "safe mode requires a recipient allowlist"
);
assert(
  evaluateWorkspaceReplyPolicy({ ...safe, mode: "draft_only" }).code === "policy_draft_only",
  "draft-only policy denies send"
);
assert(
  evaluateWorkspaceReplyPolicy({ ...safe, recipient: "noreply@example.com" }).code ===
    "automated_recipient",
  "automated sender is denied"
);
assert(
  evaluateWorkspaceReplyPolicy({
    ...safe,
    allowedRecipientDomains: ["company.test"],
  }).code === "recipient_domain_denied",
  "recipient allowlist is enforced"
);
assert(
  evaluateWorkspaceReplyPolicy({ ...safe, draftMode: "rules" }).code === "llm_required",
  "rule fallback is never auto-sent"
);
assert(
  evaluateWorkspaceReplyPolicy({ ...safe, confidence: "medium" }).code ===
    "confidence_too_low",
  "confidence threshold is enforced"
);
assert(
  evaluateWorkspaceReplyPolicy({ ...safe, risks: ["uncertain commitment"] }).code ===
    "draft_has_risks",
  "draft risks deny send"
);
assert(
  evaluateWorkspaceReplyPolicy({ ...safe, missingContext: ["deadline"] }).code ===
    "missing_context",
  "missing context denies send"
);
assert(
  evaluateWorkspaceReplyPolicy({ ...safe, recentExecutions: 5 }).code ===
    "hourly_limit_reached",
  "hourly limit is enforced"
);

const provider = workspaceProviderInfo({
  WORKSPACE_LLM_PROVIDER: "deepseek",
  DEEPSEEK_API_KEY: "secret-that-must-not-leak",
} as Env);
assert(provider.configured, "provider reports configured state");
assert(!("apiKey" in provider), "public provider metadata does not expose apiKey");
assert(!("baseUrl" in provider), "public provider metadata does not expose baseUrl");

console.log("test-workspace-autonomy OK");
