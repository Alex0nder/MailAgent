/** Выполнение MCP tools на Worker (без HTTP loopback) */
import type { Env } from "../env";
import type { ApiKeyScope } from "../lib/key-scope";
import {
  assertInboxAccessible,
  assertLabelForCreate,
  assertWriteAllowed,
  effectiveLabelPrefix,
} from "../lib/key-scope";
import { parseCallbackUrl } from "../lib/callback-url";
import { resolveExpectFrom } from "../lib/service-presets";
import { resolveAgentLabel } from "../lib/agent-recipes";
import { runAgentVerify } from "../services/agent-verify";
import { primaryLink } from "../services/extract";
import {
  createInbox,
  deleteInbox,
  getInbox,
  getMessage,
  listInboxes,
  listMessages,
} from "../services/inbox";
import { loadRawMessagePayload } from "../services/message-raw";
import {
  formatAttachment,
  fetchAttachmentDownloadMeta,
  getAttachment,
  countAttachmentsForMessage,
  listAttachments,
} from "../services/message-attachments";
import { buildInboxDiagnose } from "../services/inbox-diagnose";
import { buildWaitTimeoutDebug, waitForMessage, type WaitProgressEvent } from "../services/wait";
import type { McpProgressParams, McpToolContext } from "../mcp/progress";

export type McpAuth = {
  apiKeyHint: string;
  teamId: string | null;
  scope: ApiKeyScope;
};

function scopeWriteError(scope: ApiKeyScope) {
  const check = assertWriteAllowed(scope);
  return check.ok ? null : { error: check.error };
}

function textResult(data: unknown, isError = false) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
    isError,
  };
}

function parseLinks(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw as string[];
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as string[];
    } catch {
      return [];
    }
  }
  return [];
}

function bindWaitProgress(ctx?: McpToolContext) {
  if (!ctx?.onProgress) return undefined;
  return (e: WaitProgressEvent) => {
    const params: McpProgressParams = {
      progressToken: e.inboxId,
      progress: e.elapsedSec,
      total: e.timeoutSec,
      message: e.message,
      status: e.status,
      data: {
        inboxId: e.inboxId,
        messageCount: e.messageCount,
        percent: e.progress,
      },
    };
    ctx.onProgress!(params);
  };
}

export async function executeMcpTool(
  env: Env,
  auth: McpAuth,
  name: string,
  args: Record<string, unknown>,
  ctx?: McpToolContext
) {
  switch (name) {
    case "mailagent_verify_signup": {
      const writeErr = scopeWriteError(auth.scope);
      if (writeErr) return textResult(writeErr, true);
      const agentLabel = resolveAgentLabel({
        label: args.label as string | undefined,
        runId: args.runId as string | undefined,
      });
      const labelCheck = assertLabelForCreate(auth.scope, agentLabel);
      if (!labelCheck.ok) {
        return textResult({ error: labelCheck.error, hint: labelCheck.hint }, true);
      }
      const result = await runAgentVerify(env, {
        inboxId: args.inboxId as string | undefined,
        service: args.service as string | undefined,
        label: labelCheck.label ?? undefined,
        subjectContains: args.subjectContains as string | undefined,
        messageIndex: args.messageIndex as number | undefined,
        timeoutSeconds: args.timeoutSeconds as number | undefined,
        ttlMinutes: args.ttlMinutes as number | undefined,
        deleteAfter: args.deleteAfter as boolean | undefined,
        apiKeyHint: auth.apiKeyHint,
        onProgress: bindWaitProgress(ctx),
      });
      if ("error" in result) {
        return textResult(result, true);
      }
      if (result.status === "timeout") {
        return textResult(result, true);
      }
      return textResult(result);
    }

    case "mailagent_create_inbox": {
      const writeErr = scopeWriteError(auth.scope);
      if (writeErr) return textResult(writeErr, true);
      const callbackUrl = parseCallbackUrl(args.callbackUrl as string | undefined);
      if (args.callbackUrl && !callbackUrl) {
        return textResult({ error: "invalid_callback_url" }, true);
      }
      const agentLabel = resolveAgentLabel({
        label: args.label as string | undefined,
        runId: args.runId as string | undefined,
      });
      const labelCheck = assertLabelForCreate(auth.scope, agentLabel);
      if (!labelCheck.ok) {
        return textResult({ error: labelCheck.error, hint: labelCheck.hint }, true);
      }
      const expectFrom = resolveExpectFrom(
        args.service as string | undefined,
        args.expectFrom as string | string[] | undefined
      );
      const inbox = await createInbox(env, {
        ttlMinutes: args.ttlMinutes as number | undefined,
        expectFrom,
        label: labelCheck.label ?? undefined,
        callbackUrl,
        apiKeyHint: auth.apiKeyHint,
      });
      return textResult({
        id: inbox.id,
        address: inbox.address,
        expiresAt: inbox.expires_at,
        allowedSenders: inbox.allowed_senders,
        hint: "Submit address on signup, then mailagent_verify_signup with inboxId.",
      });
    }

    case "mailagent_wait_and_extract": {
      const writeErr = scopeWriteError(auth.scope);
      if (writeErr && !args.inboxId) return textResult(writeErr, true);
      if (!args.inboxId) {
        const agentLabel = resolveAgentLabel({
          runId: args.runId as string | undefined,
        });
        const labelCheck = assertLabelForCreate(auth.scope, agentLabel);
        if (!labelCheck.ok) {
          return textResult({ error: labelCheck.error, hint: labelCheck.hint }, true);
        }
        const v = await runAgentVerify(env, {
          service: args.service as string | undefined,
          label: labelCheck.label ?? undefined,
          subjectContains: args.subjectContains as string | undefined,
          messageIndex: args.messageIndex as number | undefined,
          timeoutSeconds: args.timeoutSeconds as number | undefined,
          deleteAfter: args.deleteAfter as boolean | undefined,
          apiKeyHint: auth.apiKeyHint,
          onProgress: bindWaitProgress(ctx),
        });
        if (v.status === "timeout" || "error" in v) {
          return textResult(v, true);
        }
        return textResult({
          inboxId: v.email.inboxId,
          address: v.email.address,
          verification: v.verification,
          deleted: v.deleted,
        });
      }

      const inboxId = args.inboxId as string;
      const inboxRow = await getInbox(env, inboxId, { apiKeyHint: auth.apiKeyHint });
      if (!inboxRow || !assertInboxAccessible(auth.scope, inboxRow).ok) {
        return textResult({ error: "inbox_not_found" }, true);
      }
      const timeout = Math.min(Number(args.timeoutSeconds ?? 90), 120);
      const message = await waitForMessage(env, inboxId, timeout, {
        subjectContains: args.subjectContains as string | undefined,
        messageIndex: args.messageIndex as number | undefined,
        onProgress: bindWaitProgress(ctx),
      });
      if (!message) {
        const debug = await buildWaitTimeoutDebug(env, inboxId, {
          subjectContains: args.subjectContains as string | undefined,
          messageIndex: args.messageIndex as number | undefined,
        });
        return textResult({ error: "timeout", inboxId, ...debug }, true);
      }
      const links = parseLinks(message.links_json);
      const verification = {
        otp: message.otp,
        links,
        primaryLink: primaryLink(links),
        from: message.from_addr,
        subject: message.subject,
        messageId: message.id,
      };
      let deleted = false;
      if (args.deleteAfter !== false) {
        if (scopeWriteError(auth.scope)) {
          return textResult({ error: "scope_read_only" }, true);
        }
        deleted = await deleteInbox(env, inboxId, {
          apiKeyHint: auth.apiKeyHint,
        });
      }
      return textResult({ inboxId, verification, deleted });
    }

    case "mailagent_list_inboxes": {
      const label =
        resolveAgentLabel({
          label: args.label as string | undefined,
          runId: args.runId as string | undefined,
        }) ?? (args.label as string | undefined);
      const prefix = effectiveLabelPrefix(auth.scope, args.labelPrefix as string | undefined);
      const rows = await listInboxes(env, {
        label,
        labelPrefix: prefix,
        limit: Number(args.limit ?? 20),
        apiKeyHint: auth.apiKeyHint,
      });
      return textResult({
        inboxes: rows.map((r) => ({
          id: r.id,
          address: r.address,
          label: r.label,
          expiresAt: r.expires_at,
        })),
      });
    }

    case "mailagent_wait_for_message": {
      const inboxId = args.inboxId as string;
      const inboxRow = await getInbox(env, inboxId, { apiKeyHint: auth.apiKeyHint });
      if (!inboxRow || !assertInboxAccessible(auth.scope, inboxRow).ok) {
        return textResult({ error: "inbox_not_found" }, true);
      }
      const timeout = Math.min(Number(args.timeoutSeconds ?? 90), 120);
      const message = await waitForMessage(env, inboxId, timeout, {
        subjectContains: args.subjectContains as string | undefined,
        messageIndex: args.messageIndex as number | undefined,
        onProgress: bindWaitProgress(ctx),
      });
      if (!message) {
        const debug = await buildWaitTimeoutDebug(env, inboxId, {
          subjectContains: args.subjectContains as string | undefined,
          messageIndex: args.messageIndex as number | undefined,
        });
        return textResult({ error: "timeout", inboxId, ...debug }, true);
      }
      const links = parseLinks(message.links_json);
      return textResult({
        message: {
          id: message.id,
          from: message.from_addr,
          subject: message.subject,
          otp: message.otp,
          links,
          primaryLink: primaryLink(links),
          receivedAt: message.received_at,
          hasRaw: Boolean(message.raw_r2_key),
          ...(message.raw_r2_key
            ? { rawUrl: `/v1/inboxes/${inboxId}/messages/${message.id}/raw` }
            : {}),
          attachmentCount: await countAttachmentsForMessage(env, message.id),
        },
      });
    }

    case "mailagent_list_messages": {
      const inboxId = args.inboxId as string;
      const inboxRow = await getInbox(env, inboxId, { apiKeyHint: auth.apiKeyHint });
      if (!inboxRow || !assertInboxAccessible(auth.scope, inboxRow).ok) {
        return textResult({ error: "inbox_not_found" }, true);
      }
      const messages = await listMessages(env, inboxId, {
        subjectContains: args.subjectContains as string | undefined,
      });
      return textResult({
        messages: await Promise.all(
          messages.map(async (m) => {
            const links = parseLinks(m.links_json);
            const attachmentCount = await countAttachmentsForMessage(env, m.id);
            return {
              id: m.id,
              from: m.from_addr,
              subject: m.subject,
              otp: m.otp,
              links,
              primaryLink: primaryLink(links),
              receivedAt: m.received_at,
              hasRaw: Boolean(m.raw_r2_key),
              ...(m.raw_r2_key
                ? { rawUrl: `/v1/inboxes/${inboxId}/messages/${m.id}/raw` }
                : {}),
              attachmentCount,
            };
          })
        ),
      });
    }

    case "mailagent_get_raw_message": {
      const inboxId = args.inboxId as string;
      const messageId = args.messageId as string;
      const inboxRow = await getInbox(env, inboxId, { apiKeyHint: auth.apiKeyHint });
      if (!inboxRow || !assertInboxAccessible(auth.scope, inboxRow).ok) {
        return textResult({ error: "inbox_not_found" }, true);
      }
      const payload = await loadRawMessagePayload(env, inboxId, messageId, {
        includeBody: args.includeBody === true,
      });
      if (!payload.ok) {
        return textResult(
          { error: payload.error, hint: payload.hint },
          true
        );
      }
      return textResult(payload);
    }

    case "mailagent_list_attachments": {
      const inboxId = args.inboxId as string;
      const messageId = args.messageId as string;
      const inboxRow = await getInbox(env, inboxId, { apiKeyHint: auth.apiKeyHint });
      if (!inboxRow || !assertInboxAccessible(auth.scope, inboxRow).ok) {
        return textResult({ error: "inbox_not_found" }, true);
      }
      const message = await getMessage(env, inboxId, messageId);
      if (!message) return textResult({ error: "message_not_found" }, true);
      const rows = await listAttachments(env, message.id);
      return textResult({
        messageId: message.id,
        attachments: rows.map((r) =>
          formatAttachment(r, inboxId, message.id)
        ),
      });
    }

    case "mailagent_get_attachment": {
      const inboxId = args.inboxId as string;
      const messageId = args.messageId as string;
      const attachmentId = args.attachmentId as string;
      const inboxRow = await getInbox(env, inboxId, { apiKeyHint: auth.apiKeyHint });
      if (!inboxRow || !assertInboxAccessible(auth.scope, inboxRow).ok) {
        return textResult({ error: "inbox_not_found" }, true);
      }
      const message = await getMessage(env, inboxId, messageId);
      if (!message) return textResult({ error: "message_not_found" }, true);
      const row = await getAttachment(env, message.id, attachmentId);
      if (!row) return textResult({ error: "attachment_not_found" }, true);
      const meta = await fetchAttachmentDownloadMeta(
        env,
        message.provider_id,
        row
      );
      if ("error" in meta) return textResult({ error: meta.error }, true);
      return textResult({
        ...meta,
        messageId: message.id,
        inboxId,
        downloadPath: `/v1/inboxes/${inboxId}/messages/${messageId}/attachments/${attachmentId}`,
      });
    }

    case "mailagent_extract_verification": {
      const inboxId = args.inboxId as string;
      const inbox = await getInbox(env, inboxId, {
        apiKeyHint: auth.apiKeyHint,
      });
      if (!inbox || !assertInboxAccessible(auth.scope, inbox).ok) {
        return textResult({ error: "inbox_not_found" }, true);
      }
      const messages = await listMessages(env, inboxId);
      const latest = messages[0];
      if (!latest) return textResult({ error: "no_messages" }, true);
      const links = parseLinks(latest.links_json);
      return textResult({
        otp: latest.otp,
        links,
        primaryLink: primaryLink(links),
        from: latest.from_addr,
        subject: latest.subject,
        messageId: latest.id,
        hasRaw: Boolean(latest.raw_r2_key),
        ...(latest.raw_r2_key
          ? { rawUrl: `/v1/inboxes/${inboxId}/messages/${latest.id}/raw` }
          : {}),
        attachmentCount: await countAttachmentsForMessage(env, latest.id),
      });
    }

    case "mailagent_diagnose_inbox": {
      const inboxId = args.inboxId as string;
      const inbox = await getInbox(env, inboxId, {
        apiKeyHint: auth.apiKeyHint,
      });
      if (!inbox || !assertInboxAccessible(auth.scope, inbox).ok) {
        return textResult({ error: "inbox_not_found" }, true);
      }
      const apiBase = ctx?.apiBaseUrl?.replace(/\/$/, "") ?? "https://api.webmailagent.com";
      const diagnose = await buildInboxDiagnose(env, inboxId, {
        subjectContains: args.subjectContains as string | undefined,
        messageIndex: args.messageIndex as number | undefined,
        apiBaseUrl: apiBase,
      });
      if (!diagnose) return textResult({ error: "inbox_not_found" }, true);
      return textResult(diagnose);
    }

    case "mailagent_get_inbox": {
      const inbox = await getInbox(env, args.inboxId as string, {
        apiKeyHint: auth.apiKeyHint,
      });
      if (!inbox || !assertInboxAccessible(auth.scope, inbox).ok) {
        return textResult({ error: "inbox_not_found" }, true);
      }
      const messages = await listMessages(env, inbox.id);
      return textResult({
        id: inbox.id,
        address: inbox.address,
        expiresAt: inbox.expires_at,
        label: inbox.label,
        messageCount: messages.length,
      });
    }

    case "mailagent_delete_inbox": {
      const writeErr = scopeWriteError(auth.scope);
      if (writeErr) return textResult(writeErr, true);
      const inbox = await getInbox(env, args.inboxId as string, {
        apiKeyHint: auth.apiKeyHint,
      });
      if (!inbox || !assertInboxAccessible(auth.scope, inbox).ok) {
        return textResult({ error: "inbox_not_found" }, true);
      }
      const ok = await deleteInbox(env, args.inboxId as string, {
        apiKeyHint: auth.apiKeyHint,
      });
      if (!ok) return textResult({ error: "inbox_not_found" }, true);
      return textResult({ deleted: true });
    }

    default:
      return textResult({ error: "unknown_tool", name }, true);
  }
}
