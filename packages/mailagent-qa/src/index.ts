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
  messageIndex?: number;
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
  links?: string[];
  primaryLink?: string | null;
  hasRaw?: boolean;
  rawUrl?: string;
  attachmentCount?: number;
}

export interface AttachmentSummary {
  id: string;
  filename: string;
  contentType: string | null;
  sizeBytes: number | null;
  cached: boolean;
  downloadUrl: string;
}

export interface CallbackDelivery {
  id: string;
  callbackUrl: string;
  messageId: string | null;
  statusCode: number | null;
  ok: boolean;
  error: string | null;
  durationMs: number | null;
  createdAt: string;
}

export interface DebugContext {
  inboxId: string;
  address?: string;
  label?: string | null;
  apiMessagesUrl: string;
  debugUiUrl: string;
  messages: MessageSummary[];
  callbacks: CallbackDelivery[];
  troubleshooting: string[];
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
    options?: {
      timeoutSeconds?: number;
      subjectContains?: string;
      messageIndex?: number;
    }
  ): Promise<Verification> {
    const q = new URLSearchParams();
    q.set("timeout", String(options?.timeoutSeconds ?? 120));
    if (options?.subjectContains) q.set("subjectContains", options.subjectContains);
    if (options?.messageIndex != null && options.messageIndex > 0) {
      q.set("messageIndex", String(options.messageIndex));
    }

    const wait = await this.requestRaw(`/v1/inboxes/${inboxId}/wait?${q}`);
    if (wait.status === 408) {
      const body = wait.json as Record<string, unknown>;
      const ctx = await this.getDebugContext(inboxId, {
        subjectContains: options?.subjectContains,
        messageIndex: options?.messageIndex,
      }).catch(() => null);
      throw new MailAgentTimeoutError("No email received", {
        inboxId,
        subjectContains: options?.subjectContains,
        messageIndex: options?.messageIndex,
        ...body,
        messages: ctx?.messages ?? body.subjects ?? [],
        callbacks: ctx?.callbacks ?? [],
        troubleshooting:
          ctx?.troubleshooting ??
          timeoutTroubleshooting({
            subjectContains: options?.subjectContains,
            messages: (body.subjects as MessageSummary[]) ?? ctx?.messages,
            callbacks: ctx?.callbacks,
          }),
        debugUiUrl: this.debugUiUrl(inboxId),
        hint: (body.hint as string) ?? options?.subjectContains
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

  async listAttachments(
    inboxId: string,
    messageId: string
  ): Promise<AttachmentSummary[]> {
    const data = await this.request<{
      attachments: AttachmentSummary[];
    }>(`/v1/inboxes/${inboxId}/messages/${messageId}/attachments`);
    return data.attachments ?? [];
  }

  /** Метаданные вложения (Accept: application/json) */
  async getAttachmentMeta(
    inboxId: string,
    messageId: string,
    attachmentId: string
  ) {
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

  async listCallbackDeliveries(
    inboxId: string,
    limit = 20
  ): Promise<CallbackDelivery[]> {
    const data = await this.request<{ deliveries: CallbackDelivery[] }>(
      `/v1/inboxes/${inboxId}/callbacks?limit=${limit}`
    );
    return data.deliveries ?? [];
  }

  /** OTP/links из latest или конкретного messageId */
  async getVerification(
    inboxId: string,
    messageId?: string
  ): Promise<Verification> {
    if (!messageId) {
      return this.request<Verification>(`/v1/inboxes/${inboxId}/extract`);
    }
    const messages = await this.listMessages(inboxId);
    const m = messages.find((row) => row.id === messageId);
    if (!m) {
      throw new Error(`MailAgent: message ${messageId} not found in inbox ${inboxId}`);
    }
    return {
      otp: m.otp ?? null,
      links: m.links ?? [],
      primaryLink: m.primaryLink ?? null,
      from: m.from,
      subject: m.subject,
      messageId: m.id,
    };
  }

  /**
   * Ждёт успешную доставку callbackUrl (poll GET …/callbacks).
   * Inbox должен быть создан с callbackUrl; после письма Worker POSTит verification.
   */
  async waitForCallback(
    inboxId: string,
    options?: {
      timeoutSeconds?: number;
      pollIntervalMs?: number;
      /** Игнорировать deliveries до этого момента (ISO или Date) */
      since?: Date | string;
      /** 0 = newest ok delivery (default) */
      callbackIndex?: number;
    }
  ): Promise<{ delivery: CallbackDelivery; verification: Verification }> {
    const timeoutMs = (options?.timeoutSeconds ?? 120) * 1000;
    const pollMs = Math.max(500, options?.pollIntervalMs ?? 1500);
    const sinceMs = options?.since
      ? new Date(options.since).getTime()
      : Date.now();
    const index = Math.max(0, options?.callbackIndex ?? 0);
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      const deliveries = await this.listCallbackDeliveries(inboxId, 50);
      const ok = deliveries
        .filter(
          (d) =>
            d.ok &&
            d.messageId &&
            new Date(d.createdAt).getTime() >= sinceMs - 5000
        )
        .sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
      const hit = ok[index];
      if (hit?.messageId) {
        const verification = await this.getVerification(inboxId, hit.messageId);
        return { delivery: hit, verification };
      }
      await sleep(pollMs);
    }

    const ctx = await this.getDebugContext(inboxId).catch(() => null);
    throw new MailAgentTimeoutError("Callback not received (no ok delivery in log)", {
      inboxId,
      callbackIndex: index,
      callbacks: ctx?.callbacks ?? [],
      troubleshooting: [
        "Убедитесь что inbox создан с callbackUrl (HTTPS).",
        "Endpoint должен ответить 2xx за <10s.",
        "См. GET …/callbacks — ok:false и statusCode.",
        ...(ctx?.troubleshooting ?? []),
      ],
      debugUiUrl: this.debugUiUrl(inboxId),
    });
  }

  /** Контекст для Allure / ReportPortal / CI log — предпочитает GET …/diagnose */
  async getDebugContext(
    inboxId: string,
    options?: { subjectContains?: string; messageIndex?: number; address?: string; label?: string | null }
  ): Promise<DebugContext> {
    const q = new URLSearchParams();
    if (options?.subjectContains) q.set("subjectContains", options.subjectContains);
    if (options?.messageIndex != null) q.set("messageIndex", String(options.messageIndex));
    const path = `/v1/inboxes/${inboxId}/diagnose${q.size ? `?${q}` : ""}`;

    try {
      const data = await this.request<{
        inboxId: string;
        address: string;
        label: string | null;
        messages: MessageSummary[];
        callbacks: CallbackDelivery[];
        troubleshooting: string[];
        debugUiUrl: string;
        apiMessagesUrl: string;
      }>(path);
      return {
        inboxId: data.inboxId,
        address: options?.address ?? data.address,
        label: options?.label ?? data.label,
        apiMessagesUrl: data.apiMessagesUrl,
        debugUiUrl: data.debugUiUrl,
        messages: data.messages,
        callbacks: data.callbacks,
        troubleshooting: data.troubleshooting,
      };
    } catch {
      const [messages, callbacks] = await Promise.all([
        this.listMessages(inboxId, {
          subjectContains: options?.subjectContains,
        }).catch(() => [] as MessageSummary[]),
        this.listCallbackDeliveries(inboxId).catch(() => [] as CallbackDelivery[]),
      ]);
      return {
        inboxId,
        address: options?.address,
        label: options?.label,
        apiMessagesUrl: `${this.base}/v1/inboxes/${inboxId}/messages`,
        debugUiUrl: this.debugUiUrl(inboxId),
        messages,
        callbacks,
        troubleshooting: timeoutTroubleshooting({
          subjectContains: options?.subjectContains,
          messageIndex: options?.messageIndex,
          messages,
          callbacks,
        }),
      };
    }
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

  /** POST /v1/inboxes/:id/simulate — test OTP без реального SMTP */
  async simulateMessage(
    inboxId: string,
    options?: {
      otp?: string;
      from?: string;
      subject?: string;
      fireCallback?: boolean;
      attachmentFilename?: string;
    }
  ): Promise<{
    inboxId: string;
    messageId: string;
    address: string;
    otp: string;
    subject: string;
    attachmentId?: string;
  }> {
    return this.request(`/v1/inboxes/${inboxId}/simulate`, {
      method: "POST",
      body: JSON.stringify(options ?? {}),
    });
  }

  /** Simulate + wait — E2E без реального SMTP (CI offline / SDK smoke) */
  async simulateAndVerify(
    inboxId: string,
    options?: {
      otp?: string;
      from?: string;
      subject?: string;
      subjectContains?: string;
      timeoutSeconds?: number;
      fireCallback?: boolean;
      attachmentFilename?: string;
    }
  ): Promise<Verification> {
    const subject = options?.subject ?? "MailAgent simulated OTP";
    await this.simulateMessage(inboxId, {
      otp: options?.otp,
      from: options?.from,
      subject,
      fireCallback: options?.fireCallback,
      attachmentFilename: options?.attachmentFilename,
    });
    return this.waitForVerification(inboxId, {
      subjectContains: options?.subjectContains ?? "simulated",
      timeoutSeconds: options?.timeoutSeconds ?? 30,
    });
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

/** Чеклист при timeout / падении email-шага */
export function timeoutTroubleshooting(input: {
  subjectContains?: string;
  messageIndex?: number;
  messages?: MessageSummary[];
  callbacks?: CallbackDelivery[];
}): string[] {
  const steps: string[] = [];
  const msgs = input.messages ?? [];
  const cbs = input.callbacks ?? [];
  const idx = input.messageIndex ?? 0;

  if (!msgs.length) {
    steps.push("0 messages: проверьте Resend webhook → POST /webhooks/resend и что staging реально шлёт письмо.");
    steps.push("Проверьте service / expectFrom allowlist (GET /v1 для presets).");
  } else if (input.subjectContains) {
    steps.push(
      `${msgs.length} message(s) в inbox, фильтр subjectContains="${input.subjectContains}", messageIndex=${idx}.`
    );
    if (idx > 0) {
      steps.push("Welcome + verify flow: используйте messageIndex=1 для второго письма.");
    }
  } else if (idx > 0 && msgs.length <= idx) {
    steps.push(`Нужен messageIndex=${idx}, но в списке только ${msgs.length} письмо(а).`);
  } else {
    steps.push(`${msgs.length} message(s) есть — проверьте subjectContains / messageIndex или extract.`);
  }

  const failedCb = cbs.filter((d) => !d.ok);
  if (failedCb.length) {
    steps.push(
      `Callback failed (${failedCb.length}): status ${failedCb.map((d) => d.statusCode).join(", ")} — см. GET …/callbacks.`
    );
  } else if (cbs.length) {
    steps.push(`Callbacks OK (${cbs.length} delivery log entries).`);
  }

  steps.push("Откройте debug UI из ошибки или: GET /v1/inboxes?label=…");
  return steps;
}

/** Из env: MAILAGENT_API_URL, MAILAGENT_API_KEY */
export function createMailAgentQa(config?: Partial<MailAgentQaConfig>): MailAgentQa {
  const apiKey = config?.apiKey ?? process.env.MAILAGENT_API_KEY ?? "";
  return new MailAgentQa({
    apiUrl: config?.apiUrl ?? process.env.MAILAGENT_API_URL,
    apiKey,
  });
}
