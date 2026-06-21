/** Gmail API read-only: list threads and load thread messages for Workspace Agent. */
import type { Env } from "../env";
import type { WorkspaceMailMessage } from "./workspace-agent";
import type { WorkspaceReminderAuth } from "./workspace-reminders";
import {
  getUserMailAccount,
  refreshGmailAccessToken,
  touchUserMailAccountSync,
} from "./user-mail-accounts";

type GmailHeader = { name?: string; value?: string };
type GmailPart = {
  mimeType?: string;
  body?: { data?: string; size?: number };
  parts?: GmailPart[];
};
type GmailMessage = {
  id: string;
  threadId?: string;
  internalDate?: string;
  snippet?: string;
  payload?: GmailPart & { headers?: GmailHeader[] };
};
type GmailThread = {
  id: string;
  snippet?: string;
  messages?: GmailMessage[];
};
type GmailThreadList = {
  threads?: { id: string; snippet?: string; historyId?: string }[];
  nextPageToken?: string;
  resultSizeEstimate?: number;
};

function decodeBase64Url(data: string): string {
  const normalized = data.replace(/-/g, "+").replace(/_/g, "/");
  const pad = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
  try {
    const bin = atob(normalized + pad);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  } catch {
    return "";
  }
}

function headerValue(headers: GmailHeader[] | undefined, name: string): string | undefined {
  const found = headers?.find((h) => h.name?.toLowerCase() === name.toLowerCase());
  return found?.value?.trim() || undefined;
}

function parseAddressList(raw?: string): string[] | undefined {
  if (!raw?.trim()) return undefined;
  const matches = raw.match(/[\w.+-]+@[\w.-]+\.\w+/g);
  return matches?.length ? matches : undefined;
}

function extractTextFromPart(part: GmailPart | undefined): string {
  if (!part) return "";
  if (part.mimeType === "text/plain" && part.body?.data) {
    return decodeBase64Url(part.body.data).trim();
  }
  if (part.parts?.length) {
    for (const child of part.parts) {
      if (child.mimeType === "text/plain" && child.body?.data) {
        return decodeBase64Url(child.body.data).trim();
      }
    }
    for (const child of part.parts) {
      const nested = extractTextFromPart(child);
      if (nested) return nested;
    }
  }
  if (part.mimeType === "text/html" && part.body?.data) {
    const html = decodeBase64Url(part.body.data);
    return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  }
  return "";
}

export function mapGmailMessage(message: GmailMessage): WorkspaceMailMessage {
  const headers = message.payload?.headers;
  const text =
    extractTextFromPart(message.payload) ||
    message.snippet?.trim() ||
    "";
  const receivedAt = message.internalDate
    ? new Date(Number(message.internalDate)).toISOString()
    : undefined;

  return {
    id: message.id,
    from: headerValue(headers, "From") ?? "unknown",
    to: parseAddressList(headerValue(headers, "To")),
    subject: headerValue(headers, "Subject") ?? "(no subject)",
    text,
    receivedAt,
  };
}

async function gmailFetch<T>(
  accessToken: string,
  path: string,
  query?: Record<string, string | number | string[] | undefined>
): Promise<{ ok: true; data: T } | { ok: false; status: number; error: string }> {
  const url = new URL(`https://gmail.googleapis.com/gmail/v1${path}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value == null || value === "") continue;
      if (Array.isArray(value)) {
        for (const item of value) {
          if (item) url.searchParams.append(key, item);
        }
      } else {
        url.searchParams.set(key, String(value));
      }
    }
  }

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  const json = (await res.json()) as T & { error?: { message?: string; status?: string } };
  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      error: json.error?.message ?? json.error?.status ?? "gmail_api_error",
    };
  }
  return { ok: true, data: json };
}

async function withGmailAccess<T>(
  env: Env,
  auth: WorkspaceReminderAuth,
  accountId: string,
  fn: (accessToken: string, accountId: string) => Promise<T>
): Promise<T | { error: string; status: 401 | 404 | 502 }> {
  const account = await getUserMailAccount(env, auth, accountId);
  if (!account) return { error: "gmail_account_not_found", status: 404 };

  const token = await refreshGmailAccessToken(env, account.refreshToken);
  if ("error" in token) return { error: token.error, status: 401 };

  try {
    const result = await fn(token.accessToken, account.id);
    await touchUserMailAccountSync(env, account.id);
    return result;
  } catch {
    return { error: "gmail_api_unreachable", status: 502 };
  }
}

export type GmailThreadSummary = {
  id: string;
  snippet: string;
};

export async function listGmailThreads(
  env: Env,
  auth: WorkspaceReminderAuth,
  input: { accountId: string; q?: string; maxResults?: number; pageToken?: string }
): Promise<
  | {
      threads: GmailThreadSummary[];
      nextPageToken: string | null;
      resultSizeEstimate: number | null;
    }
  | { error: string; status: 401 | 404 | 502 }
> {
  const result = await withGmailAccess(env, auth, input.accountId, async (accessToken) => {
    const listed = await gmailFetch<GmailThreadList>(accessToken, "/users/me/threads", {
      q: input.q,
      maxResults: Math.min(Math.max(input.maxResults ?? 20, 1), 50),
      pageToken: input.pageToken,
    });
    if (!listed.ok) throw new Error(listed.error);

    const threads = (listed.data.threads ?? []).map((thread) => ({
      id: thread.id,
      snippet: thread.snippet?.trim() ?? "",
    }));

    return {
      threads,
      nextPageToken: listed.data.nextPageToken ?? null,
      resultSizeEstimate: listed.data.resultSizeEstimate ?? null,
    };
  });

  if ("error" in result) return result;
  return result;
}

export async function readGmailThread(
  env: Env,
  auth: WorkspaceReminderAuth,
  input: { accountId: string; threadId: string }
): Promise<
  | { threadId: string; messages: WorkspaceMailMessage[] }
  | { error: string; status: 401 | 404 | 502 }
> {
  return readGmailThreadWithFormat(env, auth, input, "full");
}

/** Metadata-only thread read for triage/classifiers (no bodies). */
export async function readGmailThreadMetadata(
  env: Env,
  auth: WorkspaceReminderAuth,
  input: { accountId: string; threadId: string }
): Promise<
  | { threadId: string; messages: WorkspaceMailMessage[] }
  | { error: string; status: 401 | 404 | 502 }
> {
  return readGmailThreadWithFormat(env, auth, input, "metadata");
}

async function readGmailThreadWithFormat(
  env: Env,
  auth: WorkspaceReminderAuth,
  input: { accountId: string; threadId: string },
  format: "full" | "metadata"
): Promise<
  | { threadId: string; messages: WorkspaceMailMessage[] }
  | { error: string; status: 401 | 404 | 502 }
> {
  const result = await withGmailAccess(env, auth, input.accountId, async (accessToken) => {
    const threadRes = await gmailFetch<GmailThread>(
      accessToken,
      `/users/me/threads/${encodeURIComponent(input.threadId)}`,
      {
        format,
        ...(format === "metadata"
          ? { metadataHeaders: ["From", "To", "Subject", "Date"] }
          : {}),
      }
    );
    if (!threadRes.ok) throw new Error(threadRes.error);

    const messages = (threadRes.data.messages ?? [])
      .map(mapGmailMessage)
      .sort((a, b) => {
        const ta =
          typeof a.receivedAt === "string" ? Date.parse(a.receivedAt) : 0;
        const tb =
          typeof b.receivedAt === "string" ? Date.parse(b.receivedAt) : 0;
        return ta - tb;
      });

    if (!messages.length) throw new Error("gmail_thread_empty");

    return {
      threadId: threadRes.data.id,
      messages,
    };
  });

  if ("error" in result) {
    const status =
      result.error === "gmail_thread_empty" || result.error === "gmail_account_not_found"
        ? 404
        : result.status;
    return { error: result.error, status };
  }
  return result;
}

export async function resolveGmailMailContext(
  env: Env,
  auth: WorkspaceReminderAuth,
  input: { gmailAccountId: string; gmailThreadId?: string; q?: string }
): Promise<
  | { ok: true; threadId: string; messages: WorkspaceMailMessage[] }
  | { ok: false; status: 400 | 401 | 404 | 502; error: string }
> {
  const accountId = input.gmailAccountId.trim();
  if (!accountId) return { ok: false, status: 400, error: "gmail_account_id_required" };

  let threadId = input.gmailThreadId?.trim();
  if (!threadId) {
    const listed = await listGmailThreads(env, auth, {
      accountId,
      q: input.q ?? "in:inbox",
      maxResults: 1,
    });
    if ("error" in listed) {
      return { ok: false, status: listed.status, error: listed.error };
    }
    threadId = listed.threads[0]?.id;
    if (!threadId) return { ok: false, status: 404, error: "gmail_no_threads" };
  }

  const thread = await readGmailThread(env, auth, { accountId, threadId });
  if ("error" in thread) {
    return { ok: false, status: thread.status, error: thread.error };
  }

  return {
    ok: true,
    threadId: thread.threadId,
    messages: thread.messages,
  };
}
