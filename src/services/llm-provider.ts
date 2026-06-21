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
  deepseek: "deepseek-v4-flash",
  qwen: "qwen-turbo",
  custom: "workspace-agent",
};

const DEFAULT_BASE_URLS: Record<string, string> = {
  deepseek: "https://api.deepseek.com",
  qwen: "https://dashscope.aliyuncs.com/compatible-mode/v1",
};

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
const OPENROUTER_DEFAULT_MODEL = "deepseek/deepseek-chat";
const OPENAI_BASE_URL = "https://api.openai.com/v1";
const OPENAI_DEFAULT_MODEL = "gpt-4o-mini";
const XAI_BASE_URL = "https://api.x.ai/v1";
const XAI_DEFAULT_MODEL = "grok-3-mini";
const OLLAMA_DEFAULT_BASE_URL = "http://127.0.0.1:11434/v1";
const OLLAMA_DEFAULT_MODEL = "llama3.2";
const LOCAL_LLM_PLACEHOLDER_KEY = "local";
const LOCAL_LLM_TIMEOUT_MS = 180_000;
const CLOUD_LLM_TIMEOUT_MS = 60_000;

type CustomEndpointProfile = "explicit" | "local" | "xai" | "openai" | "openrouter";

/** True when the LLM runs on the developer machine (Ollama, LM Studio, llama.cpp server). */
export function isLocalLlmBaseUrl(baseUrl: string): boolean {
  try {
    const host = new URL(baseUrl).hostname.toLowerCase();
    return (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "[::1]" ||
      host === "host.docker.internal" ||
      host.endsWith(".local")
    );
  } catch {
    return false;
  }
}

function localLlmBaseUrl(env: Env): string {
  return (
    env.LOCAL_LLM_BASE_URL?.trim() ||
    env.OLLAMA_BASE_URL?.trim() ||
    OLLAMA_DEFAULT_BASE_URL
  ).replace(/\/$/, "");
}

function localLlmModel(env: Env): string {
  return env.LOCAL_LLM_MODEL?.trim() || env.OLLAMA_MODEL?.trim() || env.LLM_MODEL?.trim() || OLLAMA_DEFAULT_MODEL;
}

function localLlmConfigured(env: Env): boolean {
  const pref = workspaceProviderPref(env);
  if (pref === "local" || pref === "ollama") return true;
  return Boolean(
    env.LOCAL_LLM_BASE_URL?.trim() ||
      env.OLLAMA_BASE_URL?.trim() ||
      env.LOCAL_LLM_MODEL?.trim() ||
      env.OLLAMA_MODEL?.trim()
  );
}

function providerIsReady(provider: WorkspaceProviderConfig): boolean {
  if (!provider.baseUrl) return false;
  if (isLocalLlmBaseUrl(provider.baseUrl)) return true;
  return Boolean(provider.apiKey);
}

export function workspaceEndpointLabel(cfg: WorkspaceProviderConfig): string {
  if (isLocalLlmBaseUrl(cfg.baseUrl)) return "local";
  if (cfg.baseUrl === XAI_BASE_URL) return "xai";
  if (cfg.baseUrl === OPENROUTER_BASE_URL) return "openrouter";
  if (cfg.baseUrl === OPENAI_BASE_URL) return "openai";
  return cfg.provider;
}

function workspaceProviderPref(env: Env): string {
  return env.WORKSPACE_LLM_PROVIDER?.trim().toLowerCase().replace(/\s+#.*$/, "").split(/\s+/)[0] || "deepseek";
}

function openAiConfigured(env: Env): boolean {
  return Boolean(env.LLM_API_KEY?.trim() || env.OPENAI_API_KEY?.trim());
}

function explicitCustomConfigured(env: Env): boolean {
  const base = env.LLM_BASE_URL?.trim();
  if (!base) return false;
  if (isLocalLlmBaseUrl(base)) return true;
  return Boolean(env.LLM_API_KEY?.trim());
}

function customEndpointProfiles(env: Env): CustomEndpointProfile[] {
  const pref = workspaceProviderPref(env);
  const chain: CustomEndpointProfile[] = [];

  if (pref === "xai") {
    if (env.XAI_API_KEY?.trim()) chain.push("xai");
    if (openAiConfigured(env)) chain.push("openai");
    return chain;
  }
  if (pref === "openai") {
    if (openAiConfigured(env)) chain.push("openai");
    if (env.XAI_API_KEY?.trim()) chain.push("xai");
    return chain;
  }
  if (pref === "local" || pref === "ollama") {
    chain.push("local");
    return chain;
  }
  if (pref === "openrouter" && env.OPENROUTER_API_KEY?.trim()) {
    chain.push("openrouter");
    return chain;
  }
  if (explicitCustomConfigured(env)) {
    const base = env.LLM_BASE_URL!.trim();
    chain.push(isLocalLlmBaseUrl(base) ? "local" : "explicit");
    return chain;
  }
  if (pref === "custom") {
    if (localLlmConfigured(env)) chain.push("local");
    if (env.XAI_API_KEY?.trim()) chain.push("xai");
    if (openAiConfigured(env)) chain.push("openai");
    if (env.OPENROUTER_API_KEY?.trim()) chain.push("openrouter");
    return chain;
  }
  if (env.XAI_API_KEY?.trim()) chain.push("xai");
  if (openAiConfigured(env)) chain.push("openai");
  if (env.OPENROUTER_API_KEY?.trim()) chain.push("openrouter");
  return chain;
}

function customEndpointConfig(env: Env, profile: CustomEndpointProfile): WorkspaceProviderConfig {
  switch (profile) {
    case "xai":
      return {
        provider: "custom",
        baseUrl: XAI_BASE_URL,
        apiKey: env.XAI_API_KEY?.trim(),
        model: env.XAI_MODEL?.trim() || XAI_DEFAULT_MODEL,
      };
    case "openai":
      return {
        provider: "custom",
        baseUrl: (env.LLM_BASE_URL?.trim() || OPENAI_BASE_URL).replace(/\/$/, ""),
        apiKey: env.LLM_API_KEY?.trim() || env.OPENAI_API_KEY?.trim(),
        model: env.LLM_MODEL?.trim() || OPENAI_DEFAULT_MODEL,
      };
    case "openrouter":
      return {
        provider: "custom",
        baseUrl: OPENROUTER_BASE_URL,
        apiKey: env.OPENROUTER_API_KEY?.trim(),
        model: env.LLM_MODEL?.trim() || OPENROUTER_DEFAULT_MODEL,
      };
    case "local":
      return {
        provider: "custom",
        baseUrl: localLlmBaseUrl(env),
        apiKey:
          env.LOCAL_LLM_API_KEY?.trim() ||
          env.LLM_API_KEY?.trim() ||
          LOCAL_LLM_PLACEHOLDER_KEY,
        model: localLlmModel(env),
      };
    case "explicit": {
      const base = env.LLM_BASE_URL!.trim().replace(/\/$/, "");
      return {
        provider: "custom",
        baseUrl: base,
        apiKey:
          env.LLM_API_KEY?.trim() ||
          env.LOCAL_LLM_API_KEY?.trim() ||
          (isLocalLlmBaseUrl(base) ? LOCAL_LLM_PLACEHOLDER_KEY : undefined),
        model: env.LLM_MODEL?.trim() || (isLocalLlmBaseUrl(base) ? localLlmModel(env) : DEFAULT_MODELS.custom),
      };
    }
    default: {
      const neverProfile: never = profile;
      throw new Error(`unsupported custom profile: ${neverProfile}`);
    }
  }
}

export type WorkspaceProviderConfig = {
  provider: "deepseek" | "qwen" | "custom";
  baseUrl: string;
  apiKey?: string;
  model: string;
};

function primaryProvider(env: Env): WorkspaceProviderConfig["provider"] {
  const providerRaw = workspaceProviderPref(env);
  if (
    providerRaw === "xai" ||
    providerRaw === "openai" ||
    providerRaw === "openrouter" ||
    providerRaw === "local" ||
    providerRaw === "ollama"
  ) {
    return "custom";
  }
  return providerRaw === "qwen" || providerRaw === "custom" ? providerRaw : "deepseek";
}

function providerConfig(
  env: Env,
  provider: WorkspaceProviderConfig["provider"],
  isPrimary: boolean
): WorkspaceProviderConfig {
  if (provider === "custom") {
    const profiles = customEndpointProfiles(env);
    if (!profiles.length) {
      return { provider: "custom", baseUrl: "", model: DEFAULT_MODELS.custom };
    }
    return customEndpointConfig(env, profiles[0]!);
  }
  const apiKey =
    provider === "deepseek"
      ? env.DEEPSEEK_API_KEY
      : env.QWEN_API_KEY || env.DASHSCOPE_API_KEY;
  const baseUrl = DEFAULT_BASE_URLS[provider];
  const providerModel = provider === "deepseek" ? env.DEEPSEEK_MODEL : env.QWEN_MODEL;
  const model = providerModel?.trim() || DEFAULT_MODELS[provider];
  return { provider, baseUrl: baseUrl.replace(/\/$/, ""), apiKey, model };
}

export function configuredWorkspaceProviders(env: Env): WorkspaceProviderConfig[] {
  const primary = primaryProvider(env);
  if (primary === "custom") {
    const customProviders = customEndpointProfiles(env)
      .map((profile) => customEndpointConfig(env, profile))
      .filter((provider) => providerIsReady(provider));
    const nativeFallbacks: WorkspaceProviderConfig["provider"][] = ["deepseek", "qwen"];
    const fundedNative = nativeFallbacks
      .map((provider) => providerConfig(env, provider, false))
      .filter((provider) => providerIsReady(provider));
    return [...customProviders, ...fundedNative];
  }
  const order: WorkspaceProviderConfig["provider"][] =
    primary === "deepseek" ? ["deepseek", "qwen"] : ["qwen", "deepseek"];
  return order.map((provider, index) => providerConfig(env, provider, index === 0));
}

export function configuredWorkspaceProvider(env: Env): WorkspaceProviderConfig {
  return configuredWorkspaceProviders(env)[0]!;
}

export function workspaceProviderInfo(env: Env) {
  const providers = configuredWorkspaceProviders(env);
  const configured = providers[0]!;
  const endpoint = workspaceEndpointLabel(configured);
  return {
    provider: endpoint,
    model: configured.model,
    configured: providerIsReady(configured),
    fallbackEnabled: providers.length > 1,
    localOnly: isLocalLlmBaseUrl(configured.baseUrl),
    providers: providers.map((provider, index) => ({
      provider: workspaceEndpointLabel(provider),
      model: provider.model,
      configured: providerIsReady(provider),
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

function llmAuthHeaders(apiKey?: string): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const key = apiKey?.trim();
  if (key && key !== LOCAL_LLM_PLACEHOLDER_KEY) {
    headers.Authorization = `Bearer ${key}`;
  }
  return headers;
}

async function requestWorkspaceChatCompletion(
  cfg: WorkspaceProviderConfig,
  messages: ChatMessage[],
  jsonMode: boolean
): Promise<Response> {
  const body: Record<string, unknown> = {
    model: cfg.model,
    messages,
    temperature: 0.2,
  };
  if (jsonMode) body.response_format = { type: "json_object" };
  const local = isLocalLlmBaseUrl(cfg.baseUrl);
  const timeoutMs = local ? LOCAL_LLM_TIMEOUT_MS : CLOUD_LLM_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: "POST",
      headers: llmAuthHeaders(cfg.apiKey),
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

async function chatCompletionWithLocalFallback(
  cfg: WorkspaceProviderConfig,
  messages: ChatMessage[]
): Promise<Response> {
  let res = await requestWorkspaceChatCompletion(cfg, messages, true);
  if (!res.ok && isLocalLlmBaseUrl(cfg.baseUrl)) {
    res = await requestWorkspaceChatCompletion(cfg, messages, false);
  }
  return res;
}

export async function runWorkspaceLlmJson(
  env: Env,
  task: WorkspaceLlmTask,
  payload: Record<string, unknown>
): Promise<WorkspaceLlmResult> {
  const providers = configuredWorkspaceProviders(env);
  const primary = providers[0]!;
  const configured = providers.filter((provider) => providerIsReady(provider));
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
      const res = await chatCompletionWithLocalFallback(cfg, messages);
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
