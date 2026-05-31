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

export class MailAgentQa {
  private readonly base: string;
  private readonly apiKey: string;

  constructor(config: MailAgentQaConfig) {
    const key = config.apiKey?.trim();
    if (!key) throw new Error("MailAgentQa: apiKey is required");
    this.apiKey = key;
    this.base = (config.apiUrl ?? process.env.MAILAGENT_API_URL ?? "https://api.webmailagent.com").replace(/\/$/, "");
  }

  /** Уникальный label для параллельных воркеров Playwright */
  static runLabel(prefix = "pw"): string {
    const w = process.env.PLAYWRIGHT_WORKER_INDEX ?? process.env.CI_NODE_INDEX ?? "0";
    return `${prefix}-${w}-${Date.now()}`;
  }

  async createInbox(options: CreateInboxOptions = {}): Promise<InboxInfo> {
    const body = await this.request<{ id: string; address: string; label?: string }>(
      "/v1/inboxes",
      { method: "POST", body: JSON.stringify(options) }
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
        ...options,
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
      const messages = await this.requestRaw(
        `/v1/inboxes/${inboxId}/messages`
      ).catch(() => null);
      throw new MailAgentTimeoutError("No email received", {
        inboxId,
        subjectContains: options?.subjectContains,
        messages:
          messages?.ok && messages.json && typeof messages.json === "object"
            ? (messages.json as { messages?: unknown[] }).messages
            : undefined,
        hint: options?.subjectContains
          ? "Try broader subjectContains or check expectFrom/service allowlist."
          : "Check staging sends mail and Resend webhook is configured.",
      });
    }
    if (!wait.ok) throw new Error(`wait failed: ${wait.status}`);

    const ext = await this.request<Verification>(`/v1/inboxes/${inboxId}/extract`);
    return ext;
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

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await this.requestRaw(path, init);
    if (!res.ok) {
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
    return { ok: res.ok, status: res.status, json };
  }
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
