/** Gmail draft creation via API (P3 — compose scope, never send). */
import type { Env } from "../env";
import type { WorkspaceReminderAuth } from "./workspace-reminders";
import {
  getUserMailAccount,
  GMAIL_COMPOSE_SCOPE,
  refreshGmailAccessToken,
  touchUserMailAccountSync,
} from "./user-mail-accounts";

export function accountHasComposeScope(scopes: string[]): boolean {
  return scopes.some(
    (scope) =>
      scope === GMAIL_COMPOSE_SCOPE ||
      scope === "https://www.googleapis.com/auth/gmail.modify"
  );
}

function encodeBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function buildGmailDraftRaw(input: {
  to: string;
  subject: string;
  body: string;
}): string {
  const lines = [
    `To: ${input.to.trim()}`,
    `Subject: ${input.subject.trim()}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "MIME-Version: 1.0",
    "",
    input.body.trim(),
  ];
  return encodeBase64Url(lines.join("\r\n"));
}

export async function createGmailDraft(
  env: Env,
  auth: WorkspaceReminderAuth,
  input: {
    accountId: string;
    to: string;
    subject: string;
    body: string;
    threadId?: string;
  }
): Promise<
  | { draftId: string; messageId: string; threadId: string | null }
  | { error: string; status: 401 | 403 | 404 | 502 }
> {
  const account = await getUserMailAccount(env, auth, input.accountId);
  if (!account) return { error: "gmail_account_not_found", status: 404 };
  if (!accountHasComposeScope(account.scopes)) {
    return { error: "gmail_compose_scope_required", status: 403 };
  }

  const token = await refreshGmailAccessToken(env, account.refreshToken);
  if ("error" in token) return { error: token.error, status: 401 };

  const payload: { message: { raw: string; threadId?: string } } = {
    message: {
      raw: buildGmailDraftRaw({
        to: input.to,
        subject: input.subject,
        body: input.body,
      }),
    },
  };
  if (input.threadId?.trim()) payload.message.threadId = input.threadId.trim();

  const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/drafts", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const json = (await res.json()) as {
    id?: string;
    message?: { id?: string; threadId?: string };
    error?: { message?: string };
  };

  if (!res.ok || !json.id) {
    return {
      error: json.error?.message ?? "gmail_draft_create_failed",
      status: 502,
    };
  }

  await touchUserMailAccountSync(env, account.id);
  return {
    draftId: json.id,
    messageId: json.message?.id ?? json.id,
    threadId: json.message?.threadId ?? input.threadId ?? null,
  };
}
