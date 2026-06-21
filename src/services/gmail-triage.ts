/** Gmail unread triage, daily digest, and thread classification (P1.9–10). */
import type { Env } from "../env";
import { redactForLlm } from "./llm-provider";
import {
  listGmailThreads,
  readGmailThreadMetadata,
  type GmailThreadSummary,
} from "./gmail-read";
import {
  classifyGmailThread,
  type GmailThreadClassification,
  type GmailThreadDisposition,
} from "./gmail-thread-classifier";
import { getUserMailAccount } from "./user-mail-accounts";
import type { WorkspaceReminderAuth } from "./workspace-reminders";
import {
  getWorkspaceGmailSettings,
  gmailRetentionQuery,
  type WorkspaceGmailSettings,
} from "./workspace-gmail-settings";

export type GmailTriageThread = GmailThreadSummary &
  GmailThreadClassification & {
    threadId: string;
  };

export type GmailTriageResult = {
  accountId: string;
  accountEmail: string;
  generatedAt: string;
  query: string;
  settings: Pick<
    WorkspaceGmailSettings,
    "threadLookbackDays" | "maxThreadsPerScan" | "digestMaxThreads"
  >;
  scanned: number;
  buckets: Record<GmailThreadDisposition, GmailTriageThread[]>;
  needsReply: GmailTriageThread[];
  waitingOnThem: GmailTriageThread[];
};

export type GmailDigestItem = {
  threadId: string;
  subject: string | null;
  from: string | null;
  snippet: string;
  disposition: GmailThreadDisposition;
  confidence: GmailThreadClassification["confidence"];
  reason: string;
  summary: string;
  actionItems: string[];
};

export type GmailDigestResult = {
  accountId: string;
  accountEmail: string;
  generatedAt: string;
  sinceHours: number;
  query: string;
  mode: "rules";
  unreadCount: number;
  needsReplyCount: number;
  waitingOnThemCount: number;
  items: GmailDigestItem[];
};

function sentenceSummary(text: string, max = 160): string {
  const clean = redactForLlm(text.replace(/\s+/g, " ").trim());
  if (!clean) return "No preview available.";
  const first = clean.split(/(?<=[.!?])\s+/)[0] ?? clean;
  return first.length > max ? `${first.slice(0, max - 1)}…` : first;
}

function extractDigestActions(text: string): string[] {
  const actionRe =
    /\b(please|can you|could you|need to|follow up|send|review|approve|schedule|confirm|remind)\b/i;
  return text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => actionRe.test(s))
    .slice(0, 3);
}

async function loadAccount(
  env: Env,
  auth: WorkspaceReminderAuth,
  accountId: string
): Promise<
  | { ok: true; accountEmail: string }
  | { ok: false; status: 401 | 404; error: string }
> {
  const account = await getUserMailAccount(env, auth, accountId);
  if (!account) return { ok: false, status: 404, error: "gmail_account_not_found" };
  return { ok: true, accountEmail: account.email };
}

async function scanThreads(
  env: Env,
  auth: WorkspaceReminderAuth,
  input: {
    accountId: string;
    accountEmail: string;
    baseQuery: string;
    maxThreads: number;
  }
): Promise<
  | { threads: GmailTriageThread[]; query: string }
  | { error: string; status: 401 | 404 | 502 }
> {
  const listed = await listGmailThreads(env, auth, {
    accountId: input.accountId,
    q: input.baseQuery,
    maxResults: input.maxThreads,
  });
  if ("error" in listed) return listed;

  const threads: GmailTriageThread[] = [];
  for (const thread of listed.threads) {
    const meta = await readGmailThreadMetadata(env, auth, {
      accountId: input.accountId,
      threadId: thread.id,
    });
    if ("error" in meta) continue;
    const classification = classifyGmailThread(input.accountEmail, meta.messages);
    threads.push({
      id: thread.id,
      threadId: thread.id,
      snippet: thread.snippet,
      ...classification,
    });
  }

  return { threads, query: input.baseQuery };
}

function bucketThreads(threads: GmailTriageThread[]): GmailTriageResult["buckets"] {
  const buckets: GmailTriageResult["buckets"] = {
    needs_reply: [],
    waiting_on_them: [],
    fyi: [],
    automated: [],
  };
  for (const thread of threads) {
    buckets[thread.disposition].push(thread);
  }
  return buckets;
}

export async function triageGmailInbox(
  env: Env,
  auth: WorkspaceReminderAuth,
  input: { accountId: string; unreadOnly?: boolean }
): Promise<GmailTriageResult | { error: string; status: 401 | 404 | 502 }> {
  const accountId = input.accountId.trim();
  const account = await loadAccount(env, auth, accountId);
  if (!account.ok) return { error: account.error, status: account.status };

  const settings = await getWorkspaceGmailSettings(env, auth);
  const retention = gmailRetentionQuery(settings);
  const unreadOnly = input.unreadOnly !== false;
  const baseQuery = unreadOnly ? `is:unread ${retention}` : retention;

  const scanned = await scanThreads(env, auth, {
    accountId,
    accountEmail: account.accountEmail,
    baseQuery,
    maxThreads: settings.maxThreadsPerScan,
  });
  if ("error" in scanned) return scanned;

  const buckets = bucketThreads(scanned.threads);
  return {
    accountId,
    accountEmail: account.accountEmail,
    generatedAt: new Date().toISOString(),
    query: scanned.query,
    settings: {
      threadLookbackDays: settings.threadLookbackDays,
      maxThreadsPerScan: settings.maxThreadsPerScan,
      digestMaxThreads: settings.digestMaxThreads,
    },
    scanned: scanned.threads.length,
    buckets,
    needsReply: buckets.needs_reply,
    waitingOnThem: buckets.waiting_on_them,
  };
}

export async function buildGmailDailyDigest(
  env: Env,
  auth: WorkspaceReminderAuth,
  input: { accountId: string; sinceHours?: number }
): Promise<GmailDigestResult | { error: string; status: 401 | 404 | 502 }> {
  const accountId = input.accountId.trim();
  const account = await loadAccount(env, auth, accountId);
  if (!account.ok) return { error: account.error, status: account.status };

  const settings = await getWorkspaceGmailSettings(env, auth);
  const sinceHours = Math.min(Math.max(Number(input.sinceHours ?? 24), 1), 168);
  const maxHours = settings.threadLookbackDays * 24;
  const windowHours = Math.min(sinceHours, maxHours);
  const baseQuery =
    windowHours >= 24
      ? `is:unread newer_than:${Math.ceil(windowHours / 24)}d`
      : `is:unread newer_than:${windowHours}h`;

  const scanned = await scanThreads(env, auth, {
    accountId,
    accountEmail: account.accountEmail,
    baseQuery,
    maxThreads: settings.digestMaxThreads,
  });
  if ("error" in scanned) return scanned;

  const buckets = bucketThreads(scanned.threads);
  const prioritized = [
    ...buckets.needs_reply,
    ...buckets.waiting_on_them,
    ...buckets.fyi,
    ...buckets.automated,
  ].slice(0, settings.digestMaxThreads);

  const items: GmailDigestItem[] = prioritized.map((thread) => {
    const preview = redactForLlm(
      [thread.subject, thread.snippet, thread.lastFrom].filter(Boolean).join(" — ")
    );
    const actionItems = extractDigestActions(preview);
    return {
      threadId: thread.threadId,
      subject: thread.subject,
      from: thread.lastFrom,
      snippet: thread.snippet,
      disposition: thread.disposition,
      confidence: thread.confidence,
      reason: thread.reason,
      summary: sentenceSummary(preview),
      actionItems,
    };
  });

  return {
    accountId,
    accountEmail: account.accountEmail,
    generatedAt: new Date().toISOString(),
    sinceHours: windowHours,
    query: scanned.query,
    mode: "rules",
    unreadCount: scanned.threads.length,
    needsReplyCount: buckets.needs_reply.length,
    waitingOnThemCount: buckets.waiting_on_them.length,
    items,
  };
}
