/** SDK for AI agents: verify signup + list runs */
export type MailAgentOptions = {
  baseUrl: string;
  apiKey: string;
};

export type ServiceFlow = "signup" | "login" | "password_reset";

export type VerifySignupOptions = {
  service?: string;
  /** Default subject hints per service when subjectContains omitted */
  flow?: ServiceFlow;
  inboxId?: string;
  runId?: string;
  label?: string;
  subjectContains?: string;
  /** 0 = newest matching email (default), 1 = second, … */
  messageIndex?: number;
  timeoutSeconds?: number;
  ttlMinutes?: number;
  deleteAfter?: boolean;
  deleteAfterSuccess?: boolean;
  deleteAfterMinutes?: number;
  keepOnFailure?: boolean;
  callbackUrl?: string;
  notifyEmail?: string;
  notifyMode?: "verification" | "off";
};

export type CreateInboxOptions = {
  service?: string;
  label?: string;
  runId?: string;
  ttlMinutes?: number;
  deleteAfterMinutes?: number;
  callbackUrl?: string;
  notifyEmail?: string;
  notifyMode?: "verification" | "off";
  expectFrom?: string | string[];
  username?: string;
  domainId?: string;
};

export type InboxInfo = {
  id: string;
  address: string;
  expiresAt?: string;
  label?: string | null;
  callbackUrl?: string | null;
  notifyEmail?: string | null;
  notifyMode?: string | null;
};

export type NotifyDelivery = {
  id: string;
  notifyEmail: string;
  messageId: string | null;
  resendId: string | null;
  ok: boolean;
  error: string | null;
  durationMs: number | null;
  createdAt: string;
};

export type DiagnoseAction = {
  type:
    | "wait"
    | "adjust_subject_filter"
    | "adjust_message_index"
    | "fix_callback"
    | "extract_verification"
    | "simulate_message"
    | "open_debug_ui";
  confidence: "high" | "medium" | "low";
  reason: string;
  label: string;
  href?: string;
  payload?: Record<string, unknown>;
};

export type PrimaryAction = {
  type: "otp" | "magic_link" | "link" | "manual";
  value?: string;
  instruction: string;
};

export type CleanupPolicy = {
  deleteAfterSuccess: boolean;
  keepOnFailure: boolean;
  deleteAfterMinutes?: number;
};

export type VerificationConfidence = "high" | "medium" | "low";

export type VerificationAlternatives = {
  otp: string[];
  links: string[];
};

export type HtmlActionCandidate = {
  text: string;
  href: string;
  kind: "button" | "link";
  score: number;
};

export type OutboundCapabilities = {
  enabled: boolean;
  verifiedFrom: boolean;
  hint: string | null;
};

export type MeProfile = {
  plan: string;
  teamId: string | null;
  apiKeyId: string | null;
  scope: { labelPrefix: string | null; readOnly: boolean };
  limits: {
    rateLimitPerMinute: number;
    maxActiveInboxes: number;
    maxTeamKeys: number;
    maxCustomDomains: number;
    notifyEmailsPerDay: number;
  };
  usage: {
    activeInboxes: number;
    inboxesRemaining: number;
    customDomains: number;
    domainsRemaining: number;
    teamKeys: number;
    messagesLast24h: number;
    notifyEmailsLast24h: number;
    notifyEmailsRemaining: number;
  };
  billing: {
    stripeEnabled: boolean;
    canUpgrade: boolean;
    canManagePortal: boolean;
    checkoutPath: string;
    portalPath: string;
    consolePath: string;
  };
  capabilities: {
    outbound: OutboundCapabilities;
  };
};

export type McpAuthInfo = {
  type: "oauth2";
  oidc: "enabled" | "disabled";
  flows: Record<string, unknown>;
  directApiKey: { header: string; format: string; note: string };
  discovery: {
    authorizationServer: string;
    protectedResource: string;
  };
  docs: string;
};

export type AgentRunSession = {
  runId: string;
  state: Record<string, unknown>;
  steps: Array<{ name: string; at: string; data?: Record<string, unknown> }>;
  timeline: Array<{
    id: string;
    type: string;
    at: string;
    title: string;
    status: "info" | "success" | "failure" | "timeout";
    inboxId?: string;
    messageId?: string;
    data?: Record<string, unknown>;
  }>;
  createdAt: string;
  updatedAt: string;
};

export type VerifySignupResult = {
  status: "verified" | "timeout";
  email?: { inboxId: string; address: string };
  verification?: {
    otp: string | null;
    primaryLink: string | null;
    links: string[];
    buttons?: HtmlActionCandidate[];
    primaryButton?: HtmlActionCandidate | null;
    visibleText?: string;
    filteredLinks?: string[];
    confidence?: VerificationConfidence;
    matchedRule?: string | null;
    reason?: string;
    alternatives?: VerificationAlternatives;
    messageId?: string;
    hasRaw?: boolean;
    rawUrl?: string;
    attachmentCount?: number;
    hasAttachments?: boolean;
  };
  agent?: { primaryAction: PrimaryAction; service: string | null };
  session?: AgentRunSession;
  cleanupPolicy?: CleanupPolicy;
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
  buttons?: HtmlActionCandidate[];
  primaryButton?: HtmlActionCandidate | null;
  visibleText?: string;
  filteredLinks?: string[];
  confidence?: VerificationConfidence;
  matchedRule?: string | null;
  reason?: string;
  alternatives?: VerificationAlternatives;
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

  /** POST /v1/agent/verify — primary method for agents */
  verifySignup(options: VerifySignupOptions = {}): Promise<VerifySignupResult> {
    return this.request("/v1/agent/verify", {
      method: "POST",
      body: JSON.stringify(options),
    });
  }

  /** POST /v1/inboxes — temp address (+ optional notifyEmail relay) */
  createInbox(options: CreateInboxOptions = {}): Promise<InboxInfo> {
    const body = { ...options };
    if (options.runId && !options.label) {
      body.label = `agent-${options.runId}`;
    }
    return this.request<InboxInfo & { id: string }>("/v1/inboxes", {
      method: "POST",
      body: JSON.stringify(body),
    }).then((row) => ({
      id: row.id,
      address: row.address,
      expiresAt: row.expiresAt,
      label: row.label,
      callbackUrl: row.callbackUrl,
      notifyEmail: row.notifyEmail,
      notifyMode: row.notifyMode,
    }));
  }

  /** GET /v1/inboxes/:id/notify-deliveries — developer relay log */
  listNotifyDeliveries(inboxId: string, limit = 20): Promise<NotifyDelivery[]> {
    return this.request<{ deliveries: NotifyDelivery[] }>(
      `/v1/inboxes/${inboxId}/notify-deliveries?limit=${limit}`
    ).then((data) => data.deliveries ?? []);
  }

  /** GET /v1/me — plan, scope, usage, billing, capabilities */
  getProfile(): Promise<MeProfile> {
    return this.request<MeProfile>("/v1/me");
  }

  /** GET /v1/agent — hub discovery (tools, MCP, OAuth) */
  getAgentHub() {
    return this.request<{
      name: string;
      version: string;
      mcpTools: string[];
      auth?: { oidc: "enabled" | "disabled"; me: string };
      remoteMcp: Record<string, unknown>;
      docs: string;
    }>("/v1/agent");
  }

  /** GET /mcp/auth — OAuth flows for remote MCP */
  getMcpAuth(): Promise<McpAuthInfo> {
    return this.request<McpAuthInfo>("/mcp/auth");
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

  /** GET /v1/inboxes/:id/diagnose — troubleshooting after failed wait */
  diagnoseInbox(
    inboxId: string,
    options?: { subjectContains?: string; messageIndex?: number }
  ) {
    const q = new URLSearchParams();
    if (options?.subjectContains) q.set("subjectContains", options.subjectContains);
    if (options?.messageIndex != null) q.set("messageIndex", String(options.messageIndex));
    const suffix = q.size ? `?${q}` : "";
    return this.request<{
      inboxId: string;
      address: string;
      troubleshooting: string[];
      failureSummary: {
        code:
          | "no_messages"
          | "subject_filter_no_match"
          | "message_index_too_high"
          | "callback_failed"
          | "message_received"
          | "unknown";
        message: string;
        confidence: "high" | "medium" | "low";
      };
      recommendedAction: DiagnoseAction;
      retry: {
        keepInbox: boolean;
        wait: {
          method: "GET";
          path: string;
          query: {
            timeoutSeconds: number;
            subjectContains?: string;
            messageIndex: number;
          };
        };
        simulate: {
          method: "POST";
          path: string;
          body: {
            subject: string;
            otp: string;
          };
        };
      };
      nextActions: DiagnoseAction[];
      debugUiUrl: string;
      messages: MessageSummary[];
    }>(`/v1/inboxes/${inboxId}/diagnose${suffix}`);
  }

  /** POST /v1/inboxes/:id/simulate — inject test OTP without Resend */
  simulateMessage(
    inboxId: string,
    options?: {
      otp?: string;
      from?: string;
      subject?: string;
      scenario?: string;
      fireCallback?: boolean;
      attachmentFilename?: string;
      inReplyToMessageId?: string;
      rfcMessageId?: string;
      inReplyTo?: string;
      references?: string;
    }
  ) {
    return this.request<{
      inboxId: string;
      messageId: string;
      threadId: string;
      address: string;
      otp: string;
      subject: string;
      attachmentId?: string;
    }>(`/v1/inboxes/${inboxId}/simulate`, {
      method: "POST",
      body: JSON.stringify(options ?? {}),
    });
  }

  /** GET /v1/agent/runs/:runId/session — multi-step run memory */
  getRunSession(runId: string) {
    return this.request<AgentRunSession>(
      `/v1/agent/runs/${encodeURIComponent(runId)}/session`
    );
  }

  /** GET /v1/agent/runs/:runId/timeline — normalized agent-readable timeline */
  getRunTimeline(runId: string) {
    return this.request<{
      runId: string;
      timeline: AgentRunSession["timeline"];
      createdAt: string;
      updatedAt: string;
    }>(`/v1/agent/runs/${encodeURIComponent(runId)}/timeline`);
  }

  /** PATCH /v1/agent/runs/:runId/session */
  patchRunSession(
    runId: string,
    patch: {
      merge?: Record<string, unknown>;
      replaceState?: Record<string, unknown>;
      step?: { name: string; data?: Record<string, unknown> };
    }
  ) {
    return this.request<AgentRunSession>(`/v1/agent/runs/${encodeURIComponent(runId)}/session`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    });
  }

  /** GET /v1/agent/runs */
  listRuns(options?: { runId?: string; limit?: number }) {
    const q = new URLSearchParams();
    if (options?.runId) {
      return this.request<{
        runId: string;
        inboxes: unknown[];
        session: AgentRunSession | null;
      }>(`/v1/agent/runs/${encodeURIComponent(options.runId)}`);
    }
    if (options?.limit) q.set("limit", String(options.limit));
    return this.request<{ runs: unknown[] }>(`/v1/agent/runs?${q}`);
  }

  cleanupInboxes(options: { labelPrefix?: string; runId?: string }) {
    const labelPrefix = options.labelPrefix ?? (options.runId ? `agent-${options.runId}` : "");
    return this.request<{ deleted: number; ids: string[] }>(
      `/v1/inboxes?labelPrefix=${encodeURIComponent(labelPrefix)}`,
      { method: "DELETE" }
    );
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
            version: clientInfo?.version ?? "0.1.9",
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
