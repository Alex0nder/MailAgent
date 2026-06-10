/** Console inbox detail — messages, threads, callbacks for hosted UI */
import type { Env } from "../env";
import { getInbox } from "./inbox";
import { buildInboxDiagnose } from "./inbox-diagnose";
import { listThreads } from "./outbound-mail";
import { outboundCapabilities } from "../lib/outbound-capabilities";
import type { PlanId } from "../lib/plans";

export async function buildConsoleInboxDetail(
  env: Env,
  inboxId: string,
  ctx: {
    apiKeyHint: string;
    apiBaseUrl: string;
    teamId: string | null;
    plan: PlanId;
  }
) {
  const inbox = await getInbox(env, inboxId, { apiKeyHint: ctx.apiKeyHint });
  if (!inbox) return null;

  const [threads, diagnose] = await Promise.all([
    listThreads(env, inboxId),
    buildInboxDiagnose(env, inboxId, {
      apiBaseUrl: ctx.apiBaseUrl,
      apiKeyHint: ctx.apiKeyHint,
    }),
  ]);

  const outbound = await outboundCapabilities(env, {
    teamId: ctx.teamId,
    plan: ctx.plan,
  });

  return {
    id: inbox.id,
    address: inbox.address,
    label: inbox.label,
    expiresAt: inbox.expires_at,
    createdAt: inbox.created_at,
    callbackUrl: inbox.callback_url,
    messageCount: diagnose?.messageCount ?? 0,
    messages: diagnose?.messages ?? [],
    threads,
    callbacks: diagnose?.callbacks ?? [],
    troubleshooting: diagnose?.troubleshooting ?? [],
    outbound: {
      ...outbound,
      sendPath: `/v1/inboxes/${inbox.id}/send`,
      replyPathTemplate: `/v1/inboxes/${inbox.id}/messages/{messageId}/reply`,
    },
    debugUiUrl: diagnose?.debugUiUrl ?? null,
    links: {
      debug: diagnose?.debugUiUrl ?? `/debug.html?inbox=${inbox.id}`,
      diagnose: `/v1/inboxes/${inbox.id}/diagnose`,
      messages: `/v1/inboxes/${inbox.id}/messages`,
      threads: `/v1/inboxes/${inbox.id}/threads`,
      search: `/v1/inboxes/${inbox.id}/search?q=`,
    },
  };
}
