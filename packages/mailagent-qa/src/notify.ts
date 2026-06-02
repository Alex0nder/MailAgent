/** Slack webhook + PR comment helpers при падении email-тестов */
import type { DebugContext } from "./index.js";

export type SlackNotifyMeta = {
  workflow?: string;
  runUrl?: string;
  prUrl?: string;
  repo?: string;
  branch?: string;
};

export type SlackWebhookPayload = {
  text: string;
  blocks?: unknown[];
};

/** Slack Incoming Webhook body для timeout / mail failure */
export function formatSlackMailFailure(
  contexts: DebugContext[],
  meta: SlackNotifyMeta = {}
): SlackWebhookPayload {
  const lines = contexts.map((ctx) => {
    const msgs = ctx.messages?.length ?? 0;
    return `• inbox \`${ctx.inboxId}\`${ctx.label ? ` (${ctx.label})` : ""} — ${msgs} message(s)\n  <${ctx.debugUiUrl}|Debug UI>`;
  });

  const header = meta.workflow
    ? `MailAgent: email step failed in *${meta.workflow}*`
    : "MailAgent: email step failed";

  const blocks: unknown[] = [
    { type: "section", text: { type: "mrkdwn", text: header } },
  ];

  if (meta.runUrl) {
    blocks.push({
      type: "context",
      elements: [{ type: "mrkdwn", text: `<${meta.runUrl}|Workflow run>` }],
    });
  }

  blocks.push({
    type: "section",
    text: {
      type: "mrkdwn",
      text: lines.length ? lines.join("\n") : "_No inboxes found for this run label._",
    },
  });

  if (contexts[0]?.messages?.length) {
    const m = contexts[0].messages[0];
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `Latest: \`${m.from ?? "?"}\` — ${m.subject ?? "(no subject)"}`,
      },
    });
  }

  return { text: header, blocks };
}

/** POST Slack Incoming Webhook (no-op if url пустой) */
export async function notifySlackWebhook(
  webhookUrl: string | undefined,
  payload: SlackWebhookPayload
): Promise<boolean> {
  const url = webhookUrl?.trim();
  if (!url) return false;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Slack webhook ${res.status}: ${text.slice(0, 200)}`);
  }
  return true;
}

/** Собрать Slack alert из MailAgentTimeoutError.details + meta */
export async function notifySlackOnMailFailure(
  webhookUrl: string | undefined,
  contexts: DebugContext[],
  meta?: SlackNotifyMeta
): Promise<boolean> {
  return notifySlackWebhook(webhookUrl, formatSlackMailFailure(contexts, meta));
}

/** Markdown для gh pr comment */
export function formatPrCommentMailFailure(
  contexts: DebugContext[],
  meta: SlackNotifyMeta = {}
): string {
  const title = "### MailAgent: email verification failed";
  const run = meta.runUrl ? `\n[Workflow run](${meta.runUrl})` : "";
  const rows = contexts.map((ctx) => {
    const msgs =
      ctx.messages?.map((m) => `- \`${m.from ?? "?"}\` — ${m.subject ?? ""}`).join("\n") ||
      "_no messages_";
    return [
      `**Inbox:** \`${ctx.inboxId}\`${ctx.address ? ` (\`${ctx.address}\`)` : ""}`,
      ctx.label ? `**Label:** \`${ctx.label}\`` : "",
      `[Open Debug UI](${ctx.debugUiUrl})`,
      "",
      "Messages:",
      msgs,
    ]
      .filter(Boolean)
      .join("\n");
  });

  const body =
    rows.length > 0
      ? rows.join("\n\n---\n\n")
      : "_No MailAgent inboxes found for this CI run. Check label prefix `ci-{run_id}`._";

  return `${title}${run}\n\n${body}\n`;
}
