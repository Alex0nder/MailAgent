/**
 * MailAgent QA SDK — inbox на прогон тестов, OTP и magic link для Playwright/Cypress.
 */

export interface MailAgentQaConfig {
  apiUrl?: string;
  apiKey: string;
}

export interface CreateInboxOptions {
  ttlMinutes?: number;
  service?: string;
  expectFrom?: string | string[];
  label?: string;
  callbackUrl?: string;
}

export interface OpenInboxOptions extends CreateInboxOptions {
  timeoutSeconds?: number;
  subjectContains?: string;
  deleteAfter?: boolean;
}

export interface Verification {
  otp: string | null;
  links: string[];
  primaryLink: string | null;
  from?: string;
  subject?: string;
  messageId?: string;
}

export interface InboxInfo {
  id: string;
  address: string;
  expiresAt?: string;
  label?: string | null;
}

export interface OpenResult {
  inboxId: string;
  address: string;
  verification: Verification;
  deleted?: boolean;
  label?: string | null;
}

export interface MessageSummary {
  id?: string;
  from?: string;
  subject?: string;
  receivedAt?: string;
  otp?: string | null;
}

export interface DebugContext {
  inboxId: string;
  address?: string;
  label?: string | null;
  apiMessagesUrl: string;
  debugUiUrl: string;
  messages: MessageSummary[];
}

export class MailAgentQa {
  private readonly base: string;
  private readonly apiKey: string;

  constructor(config: MailAgentQaConfig) {
    const key = config.apiKey?.trim();
    if (!key) throw new Error("MailAgentQa: apiKey is required");
    this.apiKey = key;
    this.base = (config.apiUrl ?? process.env.MAILAGENT_API_URL ?? "https://api.webmailagent.com").replace(/\/$/, "");
  }

  /** TTL из env `QA_TTL_MINUTES` (1–1440), иначе дефолт API */
  static qaTtlMinutes(): number | undefined {
    const raw = process.env.QA_TTL_MINUTES?.trim();
    if (!raw) return undefined;
    const n = Number(raw);
    if (!Number.isFinite(n)) return undefined;
    return Math.min(1440, Math.max(1, Math.floor(n)));
  }

  /** Уникальный label для параллельных воркеров Playwright */
  static runLabel(prefix = "pw"): string {
    const w = process.env.PLAYWRIGHT_WORKER_INDEX ?? process.env.CI_NODE_INDEX ?? "0";
    return `${prefix}-${w}-${Date.now()}`;
  }

  private withQaDefaults<T extends CreateInboxOptions>(options: T): T {
    const ttlMinutes = options.ttlMinutes ?? MailAgentQa.qaTtlMinutes();
    if (ttlMinutes === undefined) return options;
    return { ...options, ttlMinutes };
  }

  async createInbox(options: CreateInboxOptions = {}): Promise<InboxInfo> {
    const body = await this.request<{ id: string; address: string; label?: string }>(
      "/v1/inboxes",
      { method: "POST", body: JSON.stringify(this.withQaDefaults(options)) }
    );
    return { id: body.id, address: body.address, label: body.label };
  }

  /** Create → wait → extract (рекомендуется для signup flow) */
  async open(options: OpenInboxOptions = {}): Promise<OpenResult> {
    const body = await this.requestRaw("/v1/inboxes/open", {
      method: "POST",
      body: JSON.stringify({
        timeoutSeconds: 90,
        deleteAfter: false,
        ...this.withQaDefaults(options),
      }),
    });

    if (body.status === 408) {
      const err = body.json as { hint?: string; address?: string; inboxId?: string };
      throw new MailAgentTimeoutError(err.hint ?? "timeout", err);
    }
    if (!body.ok) {
      throw new Error(`MailAgent open failed: ${body.status} ${JSON.stringify(body.json)}`);
    }

    const data = body.json as OpenResult & { inboxId: string };
    return {
      inboxId: data.inboxId,
      address: data.address,
      verification: data.verification,
      deleted: data.deleted,
      label: data.label,
    };
  }

  /** Создать inbox → заполнить форму → вызвать wait */
  async waitForVerification(
    inboxId: string,
    options?: { timeoutSeconds?: number; subjectContains?: string }
  ): Promise<Verification> {
    const q = new URLSearchParams();
    q.set("timeout", String(options?.timeoutSeconds ?? 120));
    if (options?.subjectContains) q.set("subjectContains", options.subjectContains);

    const wait = await this.requestRaw(`/v1/inboxes/${inboxId}/wait?${q}`);
    if (wait.status === 408) {
      const messages = await this.listMessages(inboxId, {
        subjectContains: options?.subjectContains,
      }).catch(() => []);
      throw new MailAgentTimeoutError("No email received", {
        inboxId,
        subjectContains: options?.subjectContains,
        messages,
        debugUiUrl: this.debugUiUrl(inboxId),
        hint: options?.subjectContains
          ? "Try broader subjectContains or check expectFrom/service allowlist."
          : "Check staging sends mail and Resend webhook is configured.",
      });
    }
    if (!wait.ok) throw new Error(`wait failed: ${wait.status}`);

    const ext = await this.request<Verification>(`/v1/inboxes/${inboxId}/extract`);
    return ext;
  }

  /** Повтор wait при timeout (flaky staging / сеть) */
  async waitWithRetry(
    inboxId: string,
    options?: { timeoutSeconds?: number; subjectContains?: string },
    retries = 3,
    delayMs = 3000
  ): Promise<Verification> {
    let last: MailAgentTimeoutError | undefined;
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        return await this.waitForVerification(inboxId, options);
      } catch (e) {
        if (e instanceof MailAgentTimeoutError && attempt < retries) {
          last = e;
          await sleep(delayMs * attempt);
          continue;
        }
        throw e;
      }
    }
    throw last ?? new MailAgentTimeoutError("No email after retries", { inboxId, retries });
  }

  async listMessages(
    inboxId: string,
    options?: { subjectContains?: string }
  ): Promise<MessageSummary[]> {
    const q = new URLSearchParams();
    if (options?.subjectContains) q.set("subjectContains", options.subjectContains);
    const path = q.size
      ? `/v1/inboxes/${inboxId}/messages?${q}`
      : `/v1/inboxes/${inboxId}/messages`;
    const data = await this.request<{ messages: MessageSummary[] }>(path);
    return data.messages ?? [];
  }

  /** Контекст для Allure / ReportPortal / CI log */
  async getDebugContext(
    inboxId: string,
    options?: { subjectContains?: string; address?: string; label?: string | null }
  ): Promise<DebugContext> {
    const messages = await this.listMessages(inboxId, {
      subjectContains: options?.subjectContains,
    }).catch(() => []);
    return {
      inboxId,
      address: options?.address,
      label: options?.label,
      apiMessagesUrl: `${this.base}/v1/inboxes/${inboxId}/messages`,
      debugUiUrl: this.debugUiUrl(inboxId),
      messages,
    };
  }

  debugUiUrl(inboxId: string): string {
    const origin = this.base.includes("api.")
      ? this.base.replace("://api.", "://")
      : "https://webmailagent.com";
    return `${origin.replace(/\/$/, "")}/debug.html?inbox=${encodeURIComponent(inboxId)}`;
  }

  /** Label для CI: ci-{GITHUB_RUN_ID}-{worker}-{ts} */
  static ciLabel(prefix = "ci"): string {
    const run = process.env.GITHUB_RUN_ID ?? process.env.CI ?? "local";
    return MailAgentQa.runLabel(`${prefix}-${run}`);
  }

  async listInboxesByPrefix(labelPrefix: string, limit = 50): Promise<InboxInfo[]> {
    const q = new URLSearchParams({
      labelPrefix,
      limit: String(limit),
    });
    const data = await this.request<{ inboxes: Array<InboxInfo & { id: string }> }>(
      `/v1/inboxes?${q}`
    );
    return data.inboxes.map((row) => ({
      id: row.id,
      address: row.address,
      label: row.label,
    }));
  }

  async listInboxes(label: string): Promise<InboxInfo[]> {
    const q = new URLSearchParams({ label });
    const data = await this.request<{ inboxes: Array<InboxInfo & { id: string }> }>(
      `/v1/inboxes?${q}`
    );
    return data.inboxes.map((row) => ({
      id: row.id,
      address: row.address,
      label: row.label,
    }));
  }

  async deleteInbox(inboxId: string): Promise<void> {
    await this.request(`/v1/inboxes/${inboxId}`, { method: "DELETE" });
  }

  /** Удалить все inbox с label, начинающимся с prefix (CI cleanup) */
  async cleanupLabelPrefix(labelPrefix: string): Promise<{ deleted: number; ids: string[] }> {
    const q = encodeURIComponent(labelPrefix);
    return this.request(`/v1/inboxes?labelPrefix=${q}`, { method: "DELETE" });
  }

  /** Алиас: cleanupLabelPrefix("ci-12345") после job */
  async cleanupRun(runId: string): Promise<{ deleted: number; ids: string[] }> {
    return this.cleanupLabelPrefix(`ci-${runId}`);
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await this.requestRaw(path, init);
    if (!res.ok) {
      if (res.status === 429) {
        throw new MailAgentRateLimitError(res.json, res.headers);
      }
      throw new Error(`MailAgent ${res.status}: ${JSON.stringify(res.json)}`);
    }
    return res.json as T;
  }

  private async requestRaw(path: string, init?: RequestInit) {
    const res = await fetch(`${this.base}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
        ...init?.headers,
      },
    });
    const text = await res.text();
    let json: unknown = null;
    if (text) {
      try {
        json = JSON.parse(text);
      } catch {
        json = { raw: text };
      }
    }
    const headers: Record<string, string> = {};
    res.headers.forEach((v, k) => {
      headers[k.toLowerCase()] = v;
    });
    return { ok: res.ok, status: res.status, json, headers };
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export class MailAgentRateLimitError extends Error {
  constructor(
    readonly body: unknown,
    readonly headers: Record<string, string>
  ) {
    const retry = headers["retry-after"];
    super(
      `MailAgent rate limit${retry ? `, retry after ${retry}s` : ""}: ${JSON.stringify(body)}`
    );
    this.name = "MailAgentRateLimitError";
  }

  get retryAfterSeconds(): number | undefined {
    const v = this.headers["retry-after"];
    if (!v) return undefined;
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  }
}

/** Вложение для Allure `testInfo.attach(...)` */
export function formatAllureAttachment(ctx: DebugContext): {
  name: string;
  body: string;
  contentType: string;
} {
  return {
    name: "mailagent-debug.json",
    contentType: "application/json",
    body: JSON.stringify(ctx, null, 2),
  };
}

export class MailAgentTimeoutError extends Error {
  constructor(
    message: string,
    readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "MailAgentTimeoutError";
  }
}

/** Из env: MAILAGENT_API_URL, MAILAGENT_API_KEY */
export function createMailAgentQa(config?: Partial<MailAgentQaConfig>): MailAgentQa {
  const apiKey = config?.apiKey ?? process.env.MAILAGENT_API_KEY ?? "";
  return new MailAgentQa({
    apiUrl: config?.apiUrl ?? process.env.MAILAGENT_API_URL,
    apiKey,
  });
}
