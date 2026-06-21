/** Deliver workspace digests to Slack/webhook or email (P4.23). */
import type { Env } from "../env";
import { parseCallbackUrl } from "../lib/callback-url";
import { createResendClient } from "./resend-mail";

export type WorkspaceDigestPayload = {
  generatedAt: string;
  monitorId: string;
  monitorName: string;
  summary: string;
  ruleHits: unknown[];
  gmailDigest?: unknown;
  calendarAgenda?: unknown;
};

export async function deliverWorkspaceDigestWebhook(
  webhookUrl: string,
  payload: WorkspaceDigestPayload
): Promise<{ ok: boolean; statusCode: number | null; error?: string }> {
  const url = parseCallbackUrl(webhookUrl);
  if (!url) return { ok: false, statusCode: null, error: "invalid_webhook_url" };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event: "workspace.digest",
        ...payload,
      }),
    });
    return {
      ok: res.ok,
      statusCode: res.status,
      error: res.ok ? undefined : `HTTP ${res.status}`,
    };
  } catch (error) {
    return {
      ok: false,
      statusCode: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function deliverWorkspaceDigestEmail(
  env: Env,
  toEmail: string,
  payload: WorkspaceDigestPayload
): Promise<{ ok: boolean; resendId: string | null; error?: string }> {
  const to = toEmail.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    return { ok: false, resendId: null, error: "invalid_digest_email" };
  }

  const subject = `[MailAgent Workspace] ${payload.monitorName}`;
  const lines = [
    payload.summary,
    "",
    `Rule hits: ${payload.ruleHits.length}`,
    ...(payload.ruleHits as Array<{ subject?: string | null; match?: { kind?: string } }>).slice(0, 10).map(
      (hit, index) =>
        `${index + 1}. [${hit.match?.kind ?? "rule"}] ${hit.subject ?? "(no subject)"}`
    ),
    "",
    `Generated: ${payload.generatedAt}`,
  ];
  const text = lines.join("\n");

  try {
    const resend = createResendClient(env);
    const from =
      env.OUTBOUND_FROM?.trim() || `MailAgent Workspace <noreply@${env.INBOX_DOMAIN}>`;
    const { data, error } = await resend.emails.send({
      from,
      to: [to],
      subject,
      text,
    });
    if (error || !data?.id) {
      return { ok: false, resendId: null, error: error?.message ?? "resend_send_failed" };
    }
    return { ok: true, resendId: data.id };
  } catch (error) {
    return {
      ok: false,
      resendId: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function deliverWorkspaceDigest(
  env: Env,
  input: {
    webhookUrl?: string | null;
    email?: string | null;
    payload: WorkspaceDigestPayload;
  }
): Promise<{ via: string | null; ok: boolean; detail?: string }> {
  if (input.webhookUrl?.trim()) {
    const result = await deliverWorkspaceDigestWebhook(input.webhookUrl, input.payload);
    return {
      via: "webhook",
      ok: result.ok,
      detail: result.error ?? (result.statusCode != null ? String(result.statusCode) : undefined),
    };
  }
  if (input.email?.trim()) {
    const result = await deliverWorkspaceDigestEmail(env, input.email, input.payload);
    return { via: "email", ok: result.ok, detail: result.error };
  }
  return { via: null, ok: true, detail: "no_delivery_target" };
}
