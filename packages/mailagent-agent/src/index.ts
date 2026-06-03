/** SDK для AI-агентов: verify signup + list runs */
export type MailAgentOptions = {
  baseUrl: string;
  apiKey: string;
};

export type VerifySignupOptions = {
  service?: string;
  inboxId?: string;
  runId?: string;
  label?: string;
  subjectContains?: string;
  timeoutSeconds?: number;
  ttlMinutes?: number;
  deleteAfter?: boolean;
};

export type PrimaryAction = {
  type: "otp" | "magic_link" | "link" | "manual";
  value?: string;
  instruction: string;
};

export type VerifySignupResult = {
  status: "verified" | "timeout";
  email?: { inboxId: string; address: string };
  verification?: {
    otp: string | null;
    primaryLink: string | null;
    links: string[];
    messageId?: string;
    hasRaw?: boolean;
    rawUrl?: string;
    attachmentCount?: number;
    hasAttachments?: boolean;
  };
  agent?: { primaryAction: PrimaryAction; service: string | null };
  error?: string;
  hint?: string;
};

export type MessageSummary = {
  id: string;
  from: string;
  subject: string;
  textPreview: string | null;
  otp: string | null;
  links: string[];
  primaryLink: string | null;
  receivedAt: string;
  hasRaw?: boolean;
  rawUrl?: string;
  attachmentCount?: number;
};

export class MailAgent {
  private readonly base: string;
  private readonly apiKey: string;

  constructor(options: MailAgentOptions) {
    this.base = options.baseUrl.replace(/\/$/, "");
    this.apiKey = options.apiKey;
  }

  private async request<T>(
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
    const body = text ? JSON.parse(text) : {};
    if (!res.ok) {
      throw new Error(
        `MailAgent ${res.status}: ${JSON.stringify(body)}`
      );
    }
    return body as T;
  }

  /** POST /v1/agent/verify — главный метод для агентов */
  verifySignup(options: VerifySignupOptions = {}): Promise<VerifySignupResult> {
    return this.request("/v1/agent/verify", {
      method: "POST",
      body: JSON.stringify(options),
    });
  }

  /** GET /v1/me — plan, scope, usage */
  getProfile() {
    return this.request<{
      plan: string;
      teamId: string | null;
      scope: { labelPrefix: string | null; readOnly: boolean };
      limits: { rateLimitPerMinute: number; maxActiveInboxes: number };
      usage: { activeInboxes: number; inboxesRemaining: number };
    }>("/v1/me");
  }

  /** GET /v1/inboxes/:id/messages */
  listMessages(inboxId: string, subjectContains?: string) {
    const q = subjectContains
      ? `?subjectContains=${encodeURIComponent(subjectContains)}`
      : "";
    return this.request<{ messages: MessageSummary[] }>(
      `/v1/inboxes/${inboxId}/messages${q}`
    );
  }

  /** GET raw .eml metadata (Accept: application/json) */
  getRawMessageMeta(inboxId: string, messageId: string) {
    return this.request<{
      messageId: string;
      inboxId: string;
      contentType: string;
      sizeBytes: number;
      filename: string;
      rawUrl?: string;
    }>(`/v1/inboxes/${inboxId}/messages/${messageId}/raw`, {
      headers: { Accept: "application/json" },
    });
  }

  /** GET attachment list */
  listAttachments(inboxId: string, messageId: string) {
    return this.request<{
      messageId: string;
      attachments: Array<{
        id: string;
        filename: string;
        contentType: string | null;
        sizeBytes: number | null;
        cached: boolean;
        downloadUrl: string;
      }>;
    }>(`/v1/inboxes/${inboxId}/messages/${messageId}/attachments`);
  }

  /** GET attachment metadata (Accept: application/json) */
  getAttachmentMeta(inboxId: string, messageId: string, attachmentId: string) {
    return this.request<{
      id: string;
      filename: string;
      contentType: string;
      sizeBytes: number | null;
      cached: boolean;
      downloadUrl?: string;
      expiresAt?: string;
    }>(
      `/v1/inboxes/${inboxId}/messages/${messageId}/attachments/${attachmentId}`,
      { headers: { Accept: "application/json" } }
    );
  }

  /** GET /v1/agent/runs */
  listRuns(options?: { runId?: string; limit?: number }) {
    const q = new URLSearchParams();
    if (options?.runId) {
      return this.request<{ runId: string; inboxes: unknown[] }>(
        `/v1/agent/runs/${encodeURIComponent(options.runId)}`
      );
    }
    if (options?.limit) q.set("limit", String(options.limit));
    return this.request<{ runs: unknown[] }>(`/v1/agent/runs?${q}`);
  }

  /** OAuth client_credentials → mat_ access token */
  async fetchMcpAccessToken(): Promise<{
    access_token: string;
    token_type: "Bearer";
    expires_in: number;
  }> {
    const res = await fetch(`${this.base}/v1/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_secret: this.apiKey,
      }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(JSON.stringify(json));
    return json;
  }

  /** POST /mcp — initialize + optional Streamable HTTP session */
  async connectMcp(
    clientInfo?: { name?: string; version?: string },
    accessToken?: string
  ) {
    const res = await fetch(`${this.base}/mcp`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken ?? this.apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 0,
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: {
            name: clientInfo?.name ?? "@mailagent/agent",
            version: clientInfo?.version ?? "0.1.1",
          },
        },
      }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(JSON.stringify(json));
    return {
      sessionId: res.headers.get("Mcp-Session-Id"),
      result: json.result,
    };
  }

  /** POST /mcp tools/call wrapper */
  async callMcpTool(
    name: string,
    args: Record<string, unknown>,
    sessionId?: string | null,
    accessToken?: string
  ) {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${accessToken ?? this.apiKey}`,
      "Content-Type": "application/json",
    };
    if (sessionId) headers["Mcp-Session-Id"] = sessionId;

    const res = await fetch(`${this.base}/mcp`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name, arguments: args },
      }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(JSON.stringify(json));
    return json.result;
  }

  /** End MCP session (Streamable HTTP) */
  async disconnectMcp(sessionId: string, accessToken?: string): Promise<void> {
    const res = await fetch(`${this.base}/mcp`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${accessToken ?? this.apiKey}`,
        "Mcp-Session-Id": sessionId,
      },
    });
    if (!res.ok && res.status !== 204) {
      const text = await res.text();
      throw new Error(`disconnectMcp ${res.status}: ${text}`);
    }
  }
}
