/** Выполнение MCP tools на Worker (без HTTP loopback) */
import type { Env } from "../env";
import { parseCallbackUrl } from "../lib/callback-url";
import { resolveExpectFrom } from "../lib/service-presets";
import { resolveAgentLabel } from "../lib/agent-recipes";
import { runAgentVerify } from "../services/agent-verify";
import { primaryLink } from "../services/extract";
import {
  createInbox,
  deleteInbox,
  getInbox,
  listInboxes,
  listMessages,
} from "../services/inbox";
import { waitForFirstMessage, type WaitProgressEvent } from "../services/wait";
import type { McpProgressParams, McpToolContext } from "../mcp/progress";

export type McpAuth = {
  apiKeyHint: string;
  teamId: string | null;
};

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
      const result = await runAgentVerify(env, {
        inboxId: args.inboxId as string | undefined,
        service: args.service as string | undefined,
        label: resolveAgentLabel({
          label: args.label as string | undefined,
          runId: args.runId as string | undefined,
        }),
        subjectContains: args.subjectContains as string | undefined,
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
      const callbackUrl = parseCallbackUrl(args.callbackUrl as string | undefined);
      if (args.callbackUrl && !callbackUrl) {
        return textResult({ error: "invalid_callback_url" }, true);
      }
      const expectFrom = resolveExpectFrom(
        args.service as string | undefined,
        args.expectFrom as string | string[] | undefined
      );
      const inbox = await createInbox(env, {
        ttlMinutes: args.ttlMinutes as number | undefined,
        expectFrom,
        label: resolveAgentLabel({
          label: args.label as string | undefined,
          runId: args.runId as string | undefined,
        }),
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
      if (!args.inboxId) {
        const v = await runAgentVerify(env, {
          service: args.service as string | undefined,
          label: resolveAgentLabel({
            runId: args.runId as string | undefined,
          }),
          subjectContains: args.subjectContains as string | undefined,
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
      const timeout = Math.min(Number(args.timeoutSeconds ?? 90), 120);
      const message = await waitForFirstMessage(env, inboxId, timeout, {
        subjectContains: args.subjectContains as string | undefined,
        onProgress: bindWaitProgress(ctx),
      });
      if (!message) {
        return textResult({ error: "timeout", inboxId }, true);
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
      const rows = await listInboxes(env, {
        label,
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
      const timeout = Math.min(Number(args.timeoutSeconds ?? 90), 120);
      const message = await waitForFirstMessage(env, inboxId, timeout, {
        subjectContains: args.subjectContains as string | undefined,
        onProgress: bindWaitProgress(ctx),
      });
      if (!message) {
        return textResult({ error: "timeout", inboxId }, true);
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
        },
      });
    }

    case "mailagent_extract_verification": {
      const inboxId = args.inboxId as string;
      const inbox = await getInbox(env, inboxId, {
        apiKeyHint: auth.apiKeyHint,
      });
      if (!inbox) return textResult({ error: "inbox_not_found" }, true);
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
      });
    }

    case "mailagent_get_inbox": {
      const inbox = await getInbox(env, args.inboxId as string, {
        apiKeyHint: auth.apiKeyHint,
      });
      if (!inbox) return textResult({ error: "inbox_not_found" }, true);
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
