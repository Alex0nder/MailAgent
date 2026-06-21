import type { Env } from "../src/env";
import {
  configuredWorkspaceProviders,
  isLocalLlmBaseUrl,
  runWorkspaceLlmJson,
  workspaceProviderInfo,
} from "../src/services/llm-provider";
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

assert(isLocalLlmBaseUrl("http://127.0.0.1:11434/v1"), "ollama default url is local");
assert(!isLocalLlmBaseUrl("https://api.openai.com/v1"), "openai url is not local");

const localProvider = workspaceProviderInfo({
  WORKSPACE_LLM_PROVIDER: "local",
  OLLAMA_MODEL: "qwen2.5:3b",
} as Env);
assert(localProvider.provider === "local", "local provider label");
assert(localProvider.model === "qwen2.5:3b", "local model override");
assert(localProvider.configured, "local provider is configured without cloud api key");
assert(localProvider.localOnly === true, "local provider marks localOnly");

const provider = workspaceProviderInfo({
  WORKSPACE_LLM_PROVIDER: "deepseek",
  DEEPSEEK_API_KEY: "secret-that-must-not-leak",
} as Env);
assert(provider.configured, "provider reports configured state");
assert(!("apiKey" in provider), "public provider metadata does not expose apiKey");
assert(!("baseUrl" in provider), "public provider metadata does not expose baseUrl");
assert(provider.providers[0]?.provider === "deepseek", "DeepSeek is the default primary provider");
assert(provider.model === "deepseek-v4-flash", "DeepSeek default model is cost-optimized flash");
assert(provider.providers[1]?.provider === "qwen", "Qwen is the default fallback provider");
assert(provider.providers[1]?.model === "qwen-turbo", "Qwen default model is turbo");
assert(
  !provider.providers.some((item) => "apiKey" in item || "baseUrl" in item),
  "fallback metadata does not expose private provider configuration"
);

const fallbackEnv = {
  WORKSPACE_LLM_PROVIDER: "deepseek",
  DEEPSEEK_API_KEY: "deepseek-test-key",
  QWEN_API_KEY: "qwen-test-key",
} as Env;
const configs = configuredWorkspaceProviders(fallbackEnv);
assert(configs[0]?.provider === "deepseek", "configured provider order starts with primary");
assert(configs[1]?.provider === "qwen", "configured provider order includes fallback");

const originalFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL) => {
  const url = String(input);
  if (url.includes("deepseek.com")) {
    return new Response("temporary upstream failure", { status: 503 });
  }
  return new Response(
    JSON.stringify({ choices: [{ message: { content: JSON.stringify({ ok: true }) } }] }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}) as typeof fetch;
try {
  const fallback = await runWorkspaceLlmJson(fallbackEnv, "diagnostic", {
    requiredJsonShape: { ok: true },
  });
  assert(fallback.ok && fallback.provider === "qwen", "Qwen handles DeepSeek failure");
  assert(fallback.attempts[0]?.provider === "deepseek", "failed primary attempt is reported");
} finally {
  globalThis.fetch = originalFetch;
}

console.log("test-workspace-autonomy OK");
