/** OpenAI-compatible LLM adapter for DeepSeek/Qwen/custom providers. */
import type { Env } from "../env";

export type WorkspaceLlmTask = "summary" | "draft_reply" | "reminder_suggest";

export type WorkspaceLlmResult =
  | { ok: true; provider: string; model: string; json: Record<string, unknown> }
  | { ok: false; provider: string; model: string; error: "llm_not_configured" | "llm_request_failed" | "llm_invalid_json"; detail?: string };

type ChatMessage = {
  role: "system" | "user";
  content: string;
};

const DEFAULT_MODELS: Record<string, string> = {
  deepseek: "deepseek-chat",
  qwen: "qwen-plus",
  custom: "workspace-agent",
};

const DEFAULT_BASE_URLS: Record<string, string> = {
  deepseek: "https://api.deepseek.com",
  qwen: "https://dashscope.aliyuncs.com/compatible-mode/v1",
};

export function configuredWorkspaceProvider(env: Env): {
  provider: "deepseek" | "qwen" | "custom";
  baseUrl: string;
  apiKey?: string;
  model: string;
} {
  const providerRaw = env.WORKSPACE_LLM_PROVIDER?.trim().toLowerCase() || "deepseek";
  const provider =
    providerRaw === "qwen" || providerRaw === "custom" ? providerRaw : "deepseek";
  const apiKey =
    provider === "deepseek"
      ? env.DEEPSEEK_API_KEY
      : provider === "qwen"
        ? env.QWEN_API_KEY || env.DASHSCOPE_API_KEY
        : env.LLM_API_KEY;
  const baseUrl =
    env.LLM_BASE_URL?.trim() ||
    (provider === "custom" ? "" : DEFAULT_BASE_URLS[provider]);
  const model = env.LLM_MODEL?.trim() || DEFAULT_MODELS[provider];
  return { provider, baseUrl: baseUrl.replace(/\/$/, ""), apiKey, model };
}

export function workspaceProviderInfo(env: Env) {
  const configured = configuredWorkspaceProvider(env);
  return {
    provider: configured.provider,
    model: configured.model,
    configured: Boolean(configured.apiKey && configured.baseUrl),
  };
}

export function redactForLlm(input: string): string {
  return input
    .replace(/\b(Bearer\s+)[A-Za-z0-9._~+/=-]{16,}/gi, "$1[REDACTED]")
    .replace(/\b(ma|mak|ci|sk|pypi|ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9._-]{12,}\b/g, "[REDACTED_KEY]")
    .replace(/\b\d{6}\b/g, "[REDACTED_OTP]")
    .replace(/\b(?:\d[ -]*?){13,19}\b/g, "[REDACTED_NUMBER]")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[REDACTED_EMAIL]");
}

export async function runWorkspaceLlmJson(
  env: Env,
  task: WorkspaceLlmTask,
  payload: Record<string, unknown>
): Promise<WorkspaceLlmResult> {
  const cfg = configuredWorkspaceProvider(env);
  if (!cfg.apiKey || !cfg.baseUrl) {
    return {
      ok: false,
      provider: cfg.provider,
      model: cfg.model,
      error: "llm_not_configured",
    };
  }

  const messages: ChatMessage[] = [
    {
      role: "system",
      content:
        "You are MailAgent Workspace Agent. Return compact valid JSON only. Do not include markdown. Never invent facts not present in the input.",
    },
    {
      role: "user",
      content: redactForLlm(JSON.stringify({ task, payload })),
    },
  ];

  try {
    const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cfg.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: cfg.model,
        messages,
        temperature: 0.2,
        response_format: { type: "json_object" },
      }),
    });
    const text = await res.text();
    if (!res.ok) {
      return {
        ok: false,
        provider: cfg.provider,
        model: cfg.model,
        error: "llm_request_failed",
        detail: text.slice(0, 500),
      };
    }
    const body = JSON.parse(text) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = body.choices?.[0]?.message?.content;
    if (!content) {
      return {
        ok: false,
        provider: cfg.provider,
        model: cfg.model,
        error: "llm_invalid_json",
        detail: "empty_content",
      };
    }
    return {
      ok: true,
      provider: cfg.provider,
      model: cfg.model,
      json: JSON.parse(content) as Record<string, unknown>,
    };
  } catch (e) {
    return {
      ok: false,
      provider: cfg.provider,
      model: cfg.model,
      error: "llm_request_failed",
      detail: e instanceof Error ? e.message : String(e),
    };
  }
}
