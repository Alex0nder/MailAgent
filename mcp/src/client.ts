/** HTTP client to MailAgent Worker API (SSE-first message wait) */

import { parseSseChunk } from "./sse.js";
import { resolveExpectFrom } from "./service-presets.js";

export class MailAgentClient {
  private readonly base: string;
  private readonly apiKey: string;

  constructor() {
    const base = process.env.MAILAGENT_API_URL?.replace(/\/$/, "");
    const apiKey = process.env.MAILAGENT_API_KEY;
    if (!apiKey) {
      throw new Error("MAILAGENT_API_KEY is required");
    }
    this.base = base ?? "http://127.0.0.1:8787";
    this.apiKey = apiKey;
  }

  request<T>(path: string, init?: RequestInit): Promise<T> {
    return this.requestInternal<T>(path, init);
  }

  private async requestInternal<T>(
    path: string,
    init?: RequestInit
  ): Promise<T> {
    const res = await fetch(`${this.base}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
        ...init?.headers,
      },
    });

    const text = await res.text();
    let body: unknown = null;
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = { raw: text };
      }
    }

    if (!res.ok) {
      throw new Error(
        `MailAgent API ${res.status}: ${JSON.stringify(body)}`
      );
    }
    return body as T;
  }

  checkEmail(email: string) {
    return this.request<EmailCheckResponse>("/v1/emails/check", {
      method: "POST",
      body: JSON.stringify({ email }),
    });
  }

  createInbox(options?: CreateInboxOptions) {
    const body: Record<string, unknown> = {};
    if (options?.ttlMinutes !== undefined) body.ttlMinutes = options.ttlMinutes;
    if (options?.deleteAfterMinutes !== undefined) {
      body.deleteAfterMinutes = options.deleteAfterMinutes;
    }
    if (options?.service) body.service = options.service;
    if (options?.label) body.label = options.label;
    if (options?.runId) body.runId = options.runId;
    if (options?.callbackUrl) body.callbackUrl = options.callbackUrl;
    if (options?.notifyEmail) body.notifyEmail = options.notifyEmail;
    const expectFrom = resolveExpectFrom(
      options?.service,
      options?.expectFrom
    );
    if (expectFrom?.length) body.expectFrom = expectFrom;
    if (options?.allowedSenders !== undefined) {
      body.allowedSenders = options.allowedSenders;
    }
    return this.request<CreateInboxResponse>("/v1/inboxes", {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  /** POST /v1/agent/verify — response with agent.primaryAction for LLM */
  async verifySignup(options: WaitAndExtractOptions) {
    const body: Record<string, unknown> = {
      timeoutSeconds: options.timeoutSeconds ?? 90,
      deleteAfter: options.deleteAfter !== false,
    };
    if (options.inboxId) body.inboxId = options.inboxId;
    if (options.ttlMinutes !== undefined) body.ttlMinutes = options.ttlMinutes;
    if (options.deleteAfterMinutes !== undefined) {
      body.deleteAfterMinutes = options.deleteAfterMinutes;
    }
    if (options.service) body.service = options.service;
    if (options.runId) body.runId = options.runId;
    if (options.label) body.label = options.label;
    if (options.callbackUrl) body.callbackUrl = options.callbackUrl;
    if (options.subjectContains) body.subjectContains = options.subjectContains;
    if (options.deleteAfterSuccess !== undefined) {
      body.deleteAfterSuccess = options.deleteAfterSuccess;
    }
    if (options.keepOnFailure !== undefined) {
      body.keepOnFailure = options.keepOnFailure;
    }
    const expectFrom = resolveExpectFrom(options.service, options.expectFrom);
    if (expectFrom?.length) body.expectFrom = expectFrom;
    if (options.allowedSenders !== undefined) {
      body.allowedSenders = options.allowedSenders;
    }

    const res = await fetch(`${this.base}/v1/agent/verify`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const text = await res.text();
    const parsed = text ? JSON.parse(text) : {};
    if (!res.ok) {
      return { ...parsed, error: parsed.error ?? parsed.status ?? "verify_failed" };
    }
    return parsed as AgentVerifyResponse;
  }

  /** create → wait → extract → delete; without inboxId — single POST /v1/inboxes/open */
  async waitAndExtract(options: WaitAndExtractOptions) {
    if (!options.inboxId) {
      return this.openInbox(options);
    }

    const inboxId = options.inboxId;
    const wait = await this.waitForMessage(
      inboxId,
      options.timeoutSeconds ?? 90,
      { subjectContains: options.subjectContains }
    );
    if ("error" in wait && wait.error === "timeout") {
      return {
        error: "timeout" as const,
        inboxId,
        hint: "No email yet. Check Resend receiving/MX, webhook, and expectFrom.",
      };
    }

    const verification = await this.extract(inboxId);
    const result = {
      inboxId,
      message: "message" in wait ? wait.message : undefined,
      verification,
    };

    if (options.deleteAfter !== false) {
      await this.deleteInbox(inboxId);
      return { ...result, deleted: true };
    }
    return result;
  }

  /** Server-side one-shot (poll on Worker) */
  async openInbox(options: WaitAndExtractOptions) {
    const body: Record<string, unknown> = {
      timeoutSeconds: options.timeoutSeconds ?? 90,
      deleteAfter: options.deleteAfter !== false,
    };
    if (options.ttlMinutes !== undefined) body.ttlMinutes = options.ttlMinutes;
    if (options.deleteAfterMinutes !== undefined) {
      body.deleteAfterMinutes = options.deleteAfterMinutes;
    }
    if (options.service) body.service = options.service;
    if (options.runId) body.runId = options.runId;
    if (options.label) body.label = options.label;
    if (options.callbackUrl) body.callbackUrl = options.callbackUrl;
    if (options.subjectContains) body.subjectContains = options.subjectContains;
    if (options.deleteAfterSuccess !== undefined) {
      body.deleteAfterSuccess = options.deleteAfterSuccess;
    }
    if (options.keepOnFailure !== undefined) {
      body.keepOnFailure = options.keepOnFailure;
    }
    const expectFrom = resolveExpectFrom(
      options.service,
      options.expectFrom
    );
    if (expectFrom?.length) body.expectFrom = expectFrom;
    if (options.allowedSenders !== undefined) {
      body.allowedSenders = options.allowedSenders;
    }

    const res = await fetch(`${this.base}/v1/inboxes/open`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const text = await res.text();
    const parsed = text ? (JSON.parse(text) as OpenInboxResponse | OpenInboxTimeout) : {};

    if (res.status === 408) {
      const t = parsed as OpenInboxTimeout;
      return { ...t, error: "timeout" as const };
    }
    if (!res.ok) {
      throw new Error(`MailAgent API ${res.status}: ${text}`);
    }
    return parsed as OpenInboxResponse;
  }

  getInbox(id: string) {
    return this.request<InboxStatus>(`/v1/inboxes/${id}`);
  }

  diagnoseInbox(
    id: string,
    options?: { subjectContains?: string; messageIndex?: number }
  ) {
    const q = new URLSearchParams();
    if (options?.subjectContains) q.set("subjectContains", options.subjectContains);
    if (options?.messageIndex != null) {
      q.set("messageIndex", String(options.messageIndex));
    }
    const suffix = q.size ? `?${q}` : "";
    return this.request<Record<string, unknown>>(`/v1/inboxes/${id}/diagnose${suffix}`);
  }

  getRunSession(runId: string) {
    return this.request<Record<string, unknown>>(
      `/v1/agent/runs/${encodeURIComponent(runId)}/session`
    );
  }

  getRunTimeline(runId: string) {
    return this.request<Record<string, unknown>>(
      `/v1/agent/runs/${encodeURIComponent(runId)}/timeline`
    );
  }

  patchRunSession(
    runId: string,
    body: {
      merge?: Record<string, unknown>;
      replaceState?: Record<string, unknown>;
      step?: { name: string; data?: Record<string, unknown> };
    }
  ) {
    return this.request<Record<string, unknown>>(
      `/v1/agent/runs/${encodeURIComponent(runId)}/session`,
      { method: "PATCH", body: JSON.stringify(body) }
    );
  }

  simulateMessage(
    id: string,
    options?: {
      otp?: string;
      from?: string;
      subject?: string;
      fireCallback?: boolean;
      attachmentFilename?: string;
      inReplyToMessageId?: string;
      rfcMessageId?: string;
      inReplyTo?: string;
      references?: string;
    }
  ) {
    return this.request<Record<string, unknown>>(`/v1/inboxes/${id}/simulate`, {
      method: "POST",
      body: JSON.stringify(options ?? {}),
    });
  }

  sendMessage(
    id: string,
    body: {
      to: string | string[];
      subject: string;
      text?: string;
      html?: string;
      inReplyToMessageId?: string;
    }
  ) {
    return this.request<Record<string, unknown>>(`/v1/inboxes/${id}/send`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  listThreads(id: string, threadId?: string) {
    if (threadId) {
      return this.request<Record<string, unknown>>(
        `/v1/inboxes/${id}/threads/${threadId}/messages`
      );
    }
    return this.request<Record<string, unknown>>(`/v1/inboxes/${id}/threads`);
  }

  listMessages(id: string) {
    return this.request<{ messages: MessageSummary[] }>(
      `/v1/inboxes/${id}/messages`
    );
  }

  /** SSE → fallback poll /wait (500ms on server) */
  async waitForMessage(
    id: string,
    timeoutSec: number,
    options?: { subjectContains?: string }
  ) {
    const t = Math.min(Math.max(timeoutSec, 5), 120);

    const existing = await this.listMessages(id);
    if (existing.messages.length > 0 && !options?.subjectContains) {
      return { message: existing.messages[0] };
    }

    if (options?.subjectContains) {
      const pollCap = Math.min(t, 90);
      const q = new URLSearchParams({
        timeout: String(pollCap),
        subjectContains: options.subjectContains,
      });
      return this.request<{ message: MessageSummary } | { error: string }>(
        `/v1/inboxes/${id}/wait?${q}`
      );
    }

    try {
      const sse = await this.waitForMessageSse(id, t);
      if (sse) return sse;
    } catch {
      /* fallback poll */
    }

    const pollCap = Math.min(t, 90);
    return this.request<{ message: MessageSummary } | { error: string }>(
      `/v1/inboxes/${id}/wait?timeout=${pollCap}`
    );
  }

  private async waitForMessageSse(
    id: string,
    timeoutSec: number
  ): Promise<{ message: MessageSummary } | null> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutSec * 1000);

    try {
      const res = await fetch(`${this.base}/v1/inboxes/${id}/events`, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
        signal: controller.signal,
      });
      if (!res.ok || !res.body) return null;

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const { events, rest } = parseSseChunk(buffer);
        buffer = rest;

        for (const evt of events) {
          if (evt.event !== "message") continue;
          const payload = JSON.parse(evt.data) as NotifyPayload;
          return {
            message: {
              id: payload.id,
              from: payload.from,
              subject: payload.subject,
              textPreview: null,
              otp: payload.otp,
              links: payload.links,
              primaryLink: payload.primaryLink ?? payload.links[0] ?? null,
              receivedAt: payload.receivedAt,
            },
          };
        }
      }
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  extract(id: string) {
    return this.request<ExtractResponse>(`/v1/inboxes/${id}/extract`);
  }

  /** GET /v1/inboxes/:id/messages/:messageId/raw — metadata or .eml body */
  async getRawMessage(
    inboxId: string,
    messageId: string,
    options?: { metadataOnly?: boolean }
  ) {
    const headers: Record<string, string> = {};
    if (options?.metadataOnly !== false) {
      headers.Accept = "application/json";
    }
    const res = await fetch(
      `${this.base}/v1/inboxes/${inboxId}/messages/${messageId}/raw`,
      { headers: { Authorization: `Bearer ${this.apiKey}`, ...headers } }
    );
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`MailAgent API ${res.status}: ${text}`);
    }
    if (options?.metadataOnly === false) {
      return { contentType: res.headers.get("Content-Type"), body: text };
    }
    return JSON.parse(text) as {
      messageId: string;
      inboxId: string;
      contentType: string;
      sizeBytes: number;
      filename: string;
    };
  }

  deleteInbox(id: string) {
    return this.request<{ deleted: boolean }>(`/v1/inboxes/${id}`, {
      method: "DELETE",
    });
  }

  cleanupInboxes(options: { labelPrefix?: string; runId?: string }) {
    const labelPrefix = options.labelPrefix ?? (options.runId ? `agent-${options.runId}` : "");
    return this.request<{ deleted: number; ids: string[]; labelPrefix?: string }>(
      `/v1/inboxes?labelPrefix=${encodeURIComponent(labelPrefix)}`,
      { method: "DELETE" }
    );
  }
}

export interface EmailCheckResponse {
  email: string;
  source: "local";
  isReachable: "safe" | "risky" | "invalid" | "unknown";
  syntax: { isValidSyntax: boolean; username: string; domain: string };
  misc: {
    isDisposable: boolean;
    isRoleAccount: boolean;
    isB2c: boolean | null;
  };
  mx: { acceptsMail: boolean; records: string[] };
  hint?: string;
}

export interface CreateInboxOptions {
  ttlMinutes?: number;
  deleteAfterMinutes?: number;
  /** Preset: dribbble, github, google, auth0, stripe */
  service?: string;
  expectFrom?: string | string[];
  allowedSenders?: string | string[];
  /** QA: CI run id / parallel worker */
  label?: string;
  /** Agent run id (stored as label agent-{runId}) */
  runId?: string;
  /** QA: HTTPS webhook on message */
  callbackUrl?: string;
  /** Developer real inbox — OTP relay */
  notifyEmail?: string;
}

export interface WaitAndExtractOptions {
  inboxId?: string;
  ttlMinutes?: number;
  service?: string;
  flow?: "signup" | "login" | "password_reset";
  expectFrom?: string | string[];
  allowedSenders?: string | string[];
  label?: string;
  runId?: string;
  callbackUrl?: string;
  /** QA: wait for message with subject substring */
  subjectContains?: string;
  timeoutSeconds?: number;
  /** Default true — delete inbox after successful extract */
  deleteAfter?: boolean;
  deleteAfterSuccess?: boolean;
  keepOnFailure?: boolean;
  deleteAfterMinutes?: number;
}

export interface CreateInboxResponse {
  id: string;
  address: string;
  expiresAt: string;
  createdAt: string;
  allowedSenders: string[];
}

export interface InboxStatus {
  id: string;
  address: string;
  expiresAt: string;
  messageCount: number;
}

export interface MessageSummary {
  id: string;
  from: string;
  subject: string;
  textPreview: string | null;
  otp: string | null;
  links: string[];
  primaryLink?: string | null;
  receivedAt: string;
}

export interface ExtractResponse {
  otp: string | null;
  links: string[];
  primaryLink: string | null;
  from: string;
  subject: string;
  messageId: string;
}

export interface OpenInboxResponse {
  inboxId: string;
  address: string;
  allowedSenders: string[];
  verification: ExtractResponse;
  deleted: boolean;
}

export interface OpenInboxTimeout {
  error: string;
  inboxId?: string;
  address?: string;
  allowedSenders?: string[];
  hint?: string;
}

interface NotifyPayload {
  id: string;
  inboxId: string;
  from: string;
  subject: string;
  otp: string | null;
  links: string[];
  primaryLink: string | null;
  receivedAt: string;
}

export interface AgentPrimaryAction {
  type: "otp" | "magic_link" | "link" | "manual";
  value?: string;
  instruction: string;
}

export interface AgentVerifyResponse {
  status: "verified" | "timeout";
  email?: { inboxId: string; address: string };
  verification?: ExtractResponse;
  agent?: {
    primaryAction: AgentPrimaryAction;
    service: string | null;
  };
  error?: string;
  hint?: string;
}
