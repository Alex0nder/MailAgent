/** Execute MCP tools on Worker (no HTTP loopback) */
import type { Env } from "../env";
import type { ApiKeyScope } from "../lib/key-scope";
import type { PlanId } from "../lib/plans";
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
import {
  getAgentRunSession,
  patchAgentRunSession,
  recordInboxRunSession,
  sessionOwnerKey,
} from "../services/agent-run-session";
import { primaryLink } from "../services/extract";
import {
  createInbox,
  deleteInbox,
  getInbox,
  getMessage,
  isCreateInboxError,
  listInboxes,
  listMessages,
} from "../services/inbox";
import {
  createDomain,
  listDomains,
  verifyDomain,
} from "../services/domains";
import { loadRawMessagePayload } from "../services/message-raw";
import {
  formatAttachment,
  fetchAttachmentDownloadMeta,
  getAttachment,
  countAttachmentsForMessage,
  listAttachments,
} from "../services/message-attachments";
import { buildInboxDiagnose } from "../services/inbox-diagnose";
import { simulateInboundMessage } from "../services/simulate-inbound";
import { validateRunId } from "../lib/validate-run-id";
import { listThreadMessages, listThreads, sendFromInbox } from "../services/outbound-mail";
import { searchInboxMessages, type SearchMode } from "../services/message-search";
import {
  extractStructuredFromMessage,
  type ExtractPreset,
} from "../services/structured-extract";
import { buildWaitTimeoutDebug, waitForMessage, type WaitProgressEvent } from "../services/wait";
import type { McpProgressParams, McpToolContext } from "../mcp/progress";

export type McpAuth = {
  apiKeyHint: string;
  teamId: string | null;
  plan: PlanId;
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
      const apiBase = ctx?.apiBaseUrl?.replace(/\/$/, "") ?? "https://api.webmailagent.com";
      const result = await runAgentVerify(env, {
        inboxId: args.inboxId as string | undefined,
        service: args.service as string | undefined,
        label: labelCheck.label ?? undefined,
        subjectContains: args.subjectContains as string | undefined,
        messageIndex: args.messageIndex as number | undefined,
        timeoutSeconds: args.timeoutSeconds as number | undefined,
        ttlMinutes: args.ttlMinutes as number | undefined,
        deleteAfter: args.deleteAfter as boolean | undefined,
        runId: args.runId as string | undefined,
        apiKeyHint: auth.apiKeyHint,
        teamId: auth.teamId,
        onProgress: bindWaitProgress(ctx),
        apiBaseUrl: apiBase,
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
        teamId: auth.teamId,
        username: args.username as string | undefined,
        domainId: args.domainId as string | undefined,
      });
      if (isCreateInboxError(inbox)) {
        return textResult({ error: inbox.error }, true);
      }
      await recordInboxRunSession(
        env,
        args.runId as string | undefined,
        sessionOwnerKey(auth.teamId, auth.apiKeyHint),
        { id: inbox.id, address: inbox.address }
      );
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
        const apiBase = ctx?.apiBaseUrl?.replace(/\/$/, "") ?? "https://api.webmailagent.com";
        const v = await runAgentVerify(env, {
          service: args.service as string | undefined,
          label: labelCheck.label ?? undefined,
          subjectContains: args.subjectContains as string | undefined,
          messageIndex: args.messageIndex as number | undefined,
          timeoutSeconds: args.timeoutSeconds as number | undefined,
          deleteAfter: args.deleteAfter as boolean | undefined,
          runId: args.runId as string | undefined,
          apiKeyHint: auth.apiKeyHint,
          teamId: auth.teamId,
          onProgress: bindWaitProgress(ctx),
          apiBaseUrl: apiBase,
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

    case "mailagent_simulate_message": {
      const writeErr = scopeWriteError(auth.scope);
      if (writeErr) return textResult(writeErr, true);
      const inboxId = args.inboxId as string;
      const inbox = await getInbox(env, inboxId, {
        apiKeyHint: auth.apiKeyHint,
      });
      if (!inbox || !assertInboxAccessible(auth.scope, inbox).ok) {
        return textResult({ error: "inbox_not_found" }, true);
      }
      const result = await simulateInboundMessage(env, {
        inboxId,
        apiKeyHint: auth.apiKeyHint,
        otp: args.otp as string | undefined,
        from: args.from as string | undefined,
        subject: args.subject as string | undefined,
        fireCallback: args.fireCallback === true,
        attachmentFilename: args.attachmentFilename as string | undefined,
        inReplyToMessageId: args.inReplyToMessageId as string | undefined,
        rfcMessageId: args.rfcMessageId as string | undefined,
        inReplyTo: args.inReplyTo as string | undefined,
        references: args.references as string | undefined,
        headers: args.headers as
          | Record<string, string | string[] | undefined>
          | undefined,
      });
      if (!result) return textResult({ error: "simulate_failed" }, true);
      return textResult(result);
    }

    case "mailagent_send_message": {
      const writeErr = scopeWriteError(auth.scope);
      if (writeErr) return textResult(writeErr, true);
      const inboxId = args.inboxId as string;
      const inbox = await getInbox(env, inboxId, {
        apiKeyHint: auth.apiKeyHint,
      });
      if (!inbox || !assertInboxAccessible(auth.scope, inbox).ok) {
        return textResult({ error: "inbox_not_found" }, true);
      }
      const toRaw = args.to;
      const to = Array.isArray(toRaw)
        ? (toRaw as string[])
        : typeof toRaw === "string"
          ? [toRaw]
          : [];
      try {
        const result = await sendFromInbox(env, {
          inboxId,
          apiKeyHint: auth.apiKeyHint,
          teamId: auth.teamId,
          to,
          subject: args.subject as string,
          text: args.text as string | undefined,
          html: args.html as string | undefined,
          inReplyToMessageId: args.inReplyToMessageId as string | undefined,
        });
        if (!result) return textResult({ error: "send_failed" }, true);
        return textResult(result);
      } catch (e) {
        return textResult(
          { error: "send_failed", message: e instanceof Error ? e.message : String(e) },
          true
        );
      }
    }

    case "mailagent_list_threads": {
      const inboxId = args.inboxId as string;
      const inbox = await getInbox(env, inboxId, {
        apiKeyHint: auth.apiKeyHint,
      });
      if (!inbox || !assertInboxAccessible(auth.scope, inbox).ok) {
        return textResult({ error: "inbox_not_found" }, true);
      }
      const threadId = args.threadId as string | undefined;
      if (threadId) {
        const messages = await listThreadMessages(env, inboxId, threadId);
        return textResult({ threadId, messages });
      }
      const threads = await listThreads(env, inboxId);
      return textResult({ threads });
    }

    case "mailagent_add_domain": {
      const writeErr = scopeWriteError(auth.scope);
      if (writeErr) return textResult(writeErr, true);
      const name = args.name as string;
      if (!name?.trim()) return textResult({ error: "name_required" }, true);
      const result = await createDomain(env, {
        teamId: auth.teamId,
        apiKeyHint: auth.apiKeyHint,
        plan: auth.plan,
      }, name);
      if (!result.ok) return textResult({ error: result.error, hint: result.hint }, true);
      return textResult(result.domain);
    }

    case "mailagent_list_domains": {
      const domains = await listDomains(env, {
        teamId: auth.teamId,
        apiKeyHint: auth.apiKeyHint,
        plan: auth.plan,
      });
      return textResult({ domains });
    }

    case "mailagent_verify_domain": {
      const writeErr = scopeWriteError(auth.scope);
      if (writeErr) return textResult(writeErr, true);
      const domainId = args.domainId as string;
      const result = await verifyDomain(env, domainId, {
        teamId: auth.teamId,
        apiKeyHint: auth.apiKeyHint,
        plan: auth.plan,
      });
      if (!result.ok) return textResult({ error: result.error, hint: result.hint }, true);
      return textResult(result.domain);
    }

    case "mailagent_extract_structured": {
      const inboxId = args.inboxId as string;
      const messageId = args.messageId as string;
      const inbox = await getInbox(env, inboxId, {
        apiKeyHint: auth.apiKeyHint,
      });
      if (!inbox || !assertInboxAccessible(auth.scope, inbox).ok) {
        return textResult({ error: "inbox_not_found" }, true);
      }
      const message = await getMessage(env, inboxId, messageId);
      if (!message) return textResult({ error: "message_not_found" }, true);

      const preset = args.preset as ExtractPreset | undefined;
      const schema = args.schema as Record<string, unknown> | undefined;
      const result = await extractStructuredFromMessage(env, message, {
        preset,
        schema,
      });
      if ("error" in result) return textResult({ error: result.error }, true);
      return textResult(result);
    }

    case "mailagent_search_messages": {
      const inboxId = args.inboxId as string;
      const inbox = await getInbox(env, inboxId, {
        apiKeyHint: auth.apiKeyHint,
      });
      if (!inbox || !assertInboxAccessible(auth.scope, inbox).ok) {
        return textResult({ error: "inbox_not_found" }, true);
      }
      const q = args.q as string;
      if (!q?.trim()) return textResult({ error: "q_required" }, true);
      const modeRaw = args.mode as string | undefined;
      const mode: SearchMode =
        modeRaw === "keyword" || modeRaw === "semantic" ? modeRaw : "auto";
      const result = await searchInboxMessages(env, inboxId, q, {
        limit: args.limit as number | undefined,
        mode,
      });
      return textResult(result);
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
        apiKeyHint: auth.apiKeyHint,
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

    case "mailagent_get_run_session": {
      const runId = args.runId as string;
      if (!validateRunId(runId)) {
        return textResult({ error: "invalid_run_id" }, true);
      }
      const owner = sessionOwnerKey(auth.teamId, auth.apiKeyHint);
      const session = await getAgentRunSession(env, runId, owner);
      if (!session) return textResult({ error: "session_not_found" }, true);
      return textResult(session);
    }

    case "mailagent_patch_run_session": {
      const writeErr = scopeWriteError(auth.scope);
      if (writeErr) return textResult(writeErr, true);
      const runId = args.runId as string;
      if (!validateRunId(runId)) {
        return textResult({ error: "invalid_run_id" }, true);
      }
      const owner = sessionOwnerKey(auth.teamId, auth.apiKeyHint);
      const result = await patchAgentRunSession(env, runId, owner, {
        merge: args.merge as Record<string, unknown> | undefined,
        replaceState: args.replaceState as Record<string, unknown> | undefined,
        step: args.step as { name: string; data?: Record<string, unknown> } | undefined,
      });
      if (!result.ok) return textResult({ error: result.error }, true);
      return textResult(result.session);
    }

    default:
      return textResult({ error: "unknown_tool", name }, true);
  }
}
