/** OpenAI-compatible LLM adapter for DeepSeek/Qwen/custom providers. */
import type { Env } from "../env";

export type WorkspaceLlmTask = "summary" | "draft_reply" | "reminder_suggest" | "diagnostic";

export type WorkspaceLlmAttempt = {
  provider: string;
  model: string;
  error: "llm_not_configured" | "llm_request_failed" | "llm_invalid_json";
};

export type WorkspaceLlmResult =
  | {
      ok: true;
      provider: string;
      model: string;
      json: Record<string, unknown>;
      attempts: WorkspaceLlmAttempt[];
    }
  | {
      ok: false;
      provider: string;
      model: string;
      error: "llm_not_configured" | "llm_request_failed" | "llm_invalid_json";
      detail?: string;
      attempts: WorkspaceLlmAttempt[];
    };

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

export type WorkspaceProviderConfig = {
  provider: "deepseek" | "qwen" | "custom";
  baseUrl: string;
  apiKey?: string;
  model: string;
};

function primaryProvider(env: Env): WorkspaceProviderConfig["provider"] {
  const providerRaw = env.WORKSPACE_LLM_PROVIDER?.trim().toLowerCase() || "deepseek";
  return providerRaw === "qwen" || providerRaw === "custom" ? providerRaw : "deepseek";
}

function providerConfig(
  env: Env,
  provider: WorkspaceProviderConfig["provider"],
  isPrimary: boolean
): WorkspaceProviderConfig {
  const apiKey =
    provider === "deepseek"
      ? env.DEEPSEEK_API_KEY
      : provider === "qwen"
        ? env.QWEN_API_KEY || env.DASHSCOPE_API_KEY
        : env.LLM_API_KEY;
  const baseUrl =
    (isPrimary ? env.LLM_BASE_URL?.trim() : undefined) ||
    (provider === "custom" ? "" : DEFAULT_BASE_URLS[provider]);
  const providerModel =
    provider === "deepseek"
      ? env.DEEPSEEK_MODEL
      : provider === "qwen"
        ? env.QWEN_MODEL
        : undefined;
  const model = providerModel?.trim() || (isPrimary ? env.LLM_MODEL?.trim() : undefined) || DEFAULT_MODELS[provider];
  return { provider, baseUrl: baseUrl.replace(/\/$/, ""), apiKey, model };
}

export function configuredWorkspaceProviders(env: Env): WorkspaceProviderConfig[] {
  const primary = primaryProvider(env);
  const order: WorkspaceProviderConfig["provider"][] =
    primary === "deepseek"
      ? ["deepseek", "qwen"]
      : primary === "qwen"
        ? ["qwen", "deepseek"]
        : ["custom", "deepseek", "qwen"];
  return order.map((provider, index) => providerConfig(env, provider, index === 0));
}

export function configuredWorkspaceProvider(env: Env): WorkspaceProviderConfig {
  return configuredWorkspaceProviders(env)[0]!;
}

export function workspaceProviderInfo(env: Env) {
  const providers = configuredWorkspaceProviders(env);
  const configured = providers[0]!;
  return {
    provider: configured.provider,
    model: configured.model,
    configured: Boolean(configured.apiKey && configured.baseUrl),
    fallbackEnabled: providers.length > 1,
    providers: providers.map((provider, index) => ({
      provider: provider.provider,
      model: provider.model,
      configured: Boolean(provider.apiKey && provider.baseUrl),
      priority: index + 1,
    })),
  };
}

export function workspaceProviderResultInfo(env: Env, result: WorkspaceLlmResult) {
  const readiness = workspaceProviderInfo(env);
  return {
    ...readiness,
    selected: result.ok ? { provider: result.provider, model: result.model } : null,
    fallbackUsed: result.ok && result.provider !== readiness.provider,
    attempts: result.attempts,
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
  const providers = configuredWorkspaceProviders(env);
  const primary = providers[0]!;
  const configured = providers.filter((provider) => provider.apiKey && provider.baseUrl);
  if (!configured.length) {
    return {
      ok: false,
      provider: primary.provider,
      model: primary.model,
      error: "llm_not_configured",
      attempts: providers.map((provider) => ({
        provider: provider.provider,
        model: provider.model,
        error: "llm_not_configured",
      })),
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

  const attempts: WorkspaceLlmAttempt[] = [];
  let lastDetail: string | undefined;
  for (const cfg of configured) {
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
        attempts.push({ provider: cfg.provider, model: cfg.model, error: "llm_request_failed" });
        lastDetail = text.slice(0, 500);
        continue;
      }
      const body = JSON.parse(text) as {
        choices?: { message?: { content?: string } }[];
      };
      const content = body.choices?.[0]?.message?.content;
      if (!content) {
        attempts.push({ provider: cfg.provider, model: cfg.model, error: "llm_invalid_json" });
        lastDetail = "empty_content";
        continue;
      }
      try {
        return {
          ok: true,
          provider: cfg.provider,
          model: cfg.model,
          json: JSON.parse(content) as Record<string, unknown>,
          attempts,
        };
      } catch {
        attempts.push({ provider: cfg.provider, model: cfg.model, error: "llm_invalid_json" });
        lastDetail = "invalid_json_content";
      }
    } catch (e) {
      attempts.push({ provider: cfg.provider, model: cfg.model, error: "llm_request_failed" });
      lastDetail = e instanceof Error ? e.message : String(e);
    }
  }
  const last = attempts[attempts.length - 1]!;
  return {
    ok: false,
    provider: last.provider,
    model: last.model,
    error: last.error,
    detail: lastDetail,
    attempts,
  };
}

export async function probeWorkspaceProviders(env: Env) {
  const result = await runWorkspaceLlmJson(env, "diagnostic", {
    instruction: "Return exactly the required JSON shape.",
    requiredJsonShape: { ok: true },
  });
  return {
    ok: result.ok,
    selected: result.ok ? { provider: result.provider, model: result.model } : null,
    error: result.ok ? null : result.error,
    attempts: result.attempts,
    readiness: workspaceProviderInfo(env),
  };
}
