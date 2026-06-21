/** Load MailAgent inbox/thread or connected Gmail messages for Workspace Agent LLM tasks. */
import type { Env } from "../env";
import { resolveGmailMailContext } from "./gmail-read";
import { getInbox, getMessage, listMessages, type MessageRow } from "./inbox";
import { listThreadMessages } from "./outbound-mail";
import type { WorkspaceMailMessage } from "./workspace-agent";

export type WorkspaceInboxContextInput = {
  inboxId?: string;
  threadId?: string;
  messageId?: string;
  messages?: WorkspaceMailMessage[];
  apiKeyHint?: string;
  teamId?: string | null;
  /** Connected user mailbox (Gmail P1) */
  gmailAccountId?: string;
  gmailThreadId?: string;
  gmailQuery?: string;
};

export type WorkspaceResolvedMailContext = {
  threadId?: string;
  messages: WorkspaceMailMessage[];
  source: "inbox" | "payload" | "gmail";
  gmailAccountId?: string;
};

function normalizeReceivedAt(value: string | Date | undefined): string | undefined {
  if (value == null) return undefined;
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed || undefined;
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }
  return undefined;
}

function mapMessageRow(row: MessageRow): WorkspaceMailMessage {
  const toAddrs = Array.isArray(row.to_addrs) ? (row.to_addrs as string[]) : undefined;
  return {
    id: row.id,
    from: row.from_addr,
    to: toAddrs,
    subject: row.subject,
    text: row.text_preview ?? row.html_preview ?? "",
    receivedAt: normalizeReceivedAt(row.received_at as string | Date),
  };
}

function hasSuppliedMessages(messages?: WorkspaceMailMessage[]): boolean {
  return Boolean(
    messages?.some((message) => message && (message.subject || message.text || message.from))
  );
}

export async function resolveWorkspaceMailContext(
  env: Env,
  input: WorkspaceInboxContextInput
): Promise<
  | { ok: true; context: WorkspaceResolvedMailContext }
  | { ok: false; status: 400 | 401 | 404 | 502; error: string }
> {
  if (hasSuppliedMessages(input.messages)) {
    return {
      ok: true,
      context: {
        threadId: input.threadId,
        messages: input.messages!,
        source: "payload",
      },
    };
  }

  const gmailAccountId = input.gmailAccountId?.trim();
  if (gmailAccountId) {
    const hint = input.apiKeyHint?.trim();
    if (!hint) {
      return { ok: false, status: 400, error: "api_key_required_for_gmail" };
    }
    const gmail = await resolveGmailMailContext(
      env,
      { teamId: input.teamId ?? null, apiKeyHint: hint },
      {
        gmailAccountId,
        gmailThreadId: input.gmailThreadId,
        q: input.gmailQuery,
      }
    );
    if (!gmail.ok) return { ok: false, status: gmail.status, error: gmail.error };
    return {
      ok: true,
      context: {
        threadId: gmail.threadId,
        messages: gmail.messages,
        source: "gmail",
        gmailAccountId,
      },
    };
  }

  const inboxId = input.inboxId?.trim();
  if (!inboxId) {
    return {
      ok: false,
      status: 400,
      error: "messages_or_inbox_id_or_gmail_account_required",
    };
  }

  const inbox = await getInbox(env, inboxId, { apiKeyHint: input.apiKeyHint });
  if (!inbox) return { ok: false, status: 404, error: "inbox_not_found" };

  let threadId = input.threadId?.trim();
  const messageId = input.messageId?.trim();

  if (messageId) {
    const anchor = await getMessage(env, inboxId, messageId);
    if (!anchor || anchor.inbox_id !== inboxId) {
      return { ok: false, status: 404, error: "message_not_found" };
    }
    threadId = anchor.thread_id ?? anchor.id;
  }

  let rows: MessageRow[];
  if (threadId) {
    rows = await listThreadMessages(env, inboxId, threadId);
    if (!rows.length) return { ok: false, status: 404, error: "thread_not_found" };
  } else {
    rows = await listMessages(env, inboxId, {});
    if (!rows.length) return { ok: false, status: 404, error: "inbox_empty" };
    const latest = rows[0]!;
    threadId = latest.thread_id ?? latest.id;
    rows = await listThreadMessages(env, inboxId, threadId);
  }

  return {
    ok: true,
    context: {
      threadId,
      messages: rows.map(mapMessageRow),
      source: "inbox",
    },
  };
}
