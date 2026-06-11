#!/usr/bin/env node
/**
 * MailAgent MCP server for Cursor (stdio).
 * Official SDK: https://github.com/modelcontextprotocol/typescript-sdk
 * Logs only to stderr — stdout is reserved for JSON-RPC.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { MailAgentClient } from "./client.js";
import { SERVICE_NAMES } from "./service-presets.js";

function toolText(data: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(data, null, 2),
      },
    ],
  };
}

const server = new McpServer({
  name: "mailagent",
  version: "0.1.0",
});

server.registerTool(
  "mailagent_create_inbox",
  {
    description:
      "Create a temporary email inbox for agent workflows (signups, OTP, magic links). Returns inbox id and email address to use on external forms.",
    inputSchema: {
      ttlMinutes: z
        .number()
        .int()
        .min(5)
        .max(1440)
        .optional()
        .describe("Inbox lifetime in minutes (default from server, usually 30)"),
      expectFrom: z
        .union([z.string(), z.array(z.string())])
        .optional()
        .describe(
          "Allowed sender(s): full email (noreply@service.com) or domain (service.com). Rejects other From addresses."
        ),
      allowedSenders: z
        .union([z.string(), z.array(z.string())])
        .optional()
        .describe("Alias for expectFrom when multiple explicit senders are needed"),
      service: z
        .enum(SERVICE_NAMES)
        .optional()
        .describe(
          `Preset expectFrom (${SERVICE_NAMES.join(", ")}). Example: dribbble → dribbble.com + m.dribbble.com`
        ),
      label: z
        .string()
        .optional()
        .describe("QA/CI run id — find inboxes via list after failed test"),
      runId: z
        .string()
        .optional()
        .describe("Agent session id → label agent-{runId}"),
      callbackUrl: z
        .string()
        .url()
        .optional()
        .describe("HTTPS webhook when email arrives (CI hooks)"),
      notifyEmail: z
        .string()
        .email()
        .optional()
        .describe("Developer real inbox — OTP summary relay after verification email"),
    },
  },
  async ({
    ttlMinutes,
    expectFrom,
    allowedSenders,
    service,
    label,
    runId,
    callbackUrl,
    notifyEmail,
  }) => {
    const client = new MailAgentClient();
    const resolvedLabel = runId
      ? label
        ? `agent-${runId}:${label}`.slice(0, 128)
        : `agent-${runId}`.slice(0, 128)
      : label;
    const inbox = await client.createInbox({
      ttlMinutes,
      service,
      expectFrom,
      allowedSenders,
      label: resolvedLabel,
      callbackUrl,
      notifyEmail,
    });
    return toolText({
      ...inbox,
      hint: "Use address on the signup form, then mailagent_wait_and_extract or wait + extract. notifyEmail relays OTP to your real inbox.",
    });
  }
);

const senderSchema = z
  .union([z.string(), z.array(z.string())])
  .optional()
  .describe("Allowed sender email or domain (see mailagent_create_inbox)");

server.registerTool(
  "mailagent_verify_signup",
  {
    description:
      "Preferred agent flow: create inbox (or reuse inboxId), wait for verification email, return agent.primaryAction with OTP or magic link and clear instruction. Use service preset (github, google, dribbble, …).",
    inputSchema: {
      inboxId: z
        .string()
        .optional()
        .describe("Existing inbox after form submit; omit to create new"),
      ttlMinutes: z.number().int().min(5).max(1440).optional(),
      service: z.enum(SERVICE_NAMES).optional(),
      expectFrom: senderSchema,
      allowedSenders: senderSchema,
      label: z.string().optional().describe("QA/CI run id"),
      runId: z
        .string()
        .optional()
        .describe("Agent session id → label agent-{runId} for tracing"),
      callbackUrl: z.string().url().optional(),
      subjectContains: z.string().optional(),
      timeoutSeconds: z.number().int().min(5).max(120).optional(),
      deleteAfter: z.boolean().optional(),
    },
  },
  async (args) => {
    const client = new MailAgentClient();
    const result = await client.verifySignup(args);
    if (result.status === "timeout" || result.error) {
      return toolText({
        ...result,
        hint:
          result.hint ??
          "Submit the email address on the signup form, then retry with inboxId or longer timeout.",
      });
    }
    return toolText(result);
  }
);

server.registerTool(
  "mailagent_wait_and_extract",
  {
    description:
      "One-shot agent flow: optionally create inbox, wait via SSE for first allowed email, return OTP + links, delete inbox by default. Use service=dribbble for Dribbble signup.",
    inputSchema: {
      inboxId: z
        .string()
        .optional()
        .describe("Existing inbox; if omitted, a new inbox is created"),
      ttlMinutes: z.number().int().min(5).max(1440).optional(),
      service: z
        .enum(SERVICE_NAMES)
        .optional()
        .describe("Preset expectFrom (dribbble, github, …)"),
      expectFrom: senderSchema,
      allowedSenders: senderSchema,
      timeoutSeconds: z
        .number()
        .int()
        .min(5)
        .max(120)
        .optional()
        .describe("Max wait (default 90, uses SSE then poll)"),
      deleteAfter: z
        .boolean()
        .optional()
        .describe("Delete inbox after success (default true)"),
      label: z.string().optional().describe("QA/CI run id"),
      callbackUrl: z.string().url().optional(),
      subjectContains: z
        .string()
        .optional()
        .describe("Wait for email whose subject includes this text"),
    },
  },
  async (args) => {
    const client = new MailAgentClient();
    const result = await client.waitAndExtract(args);
    return toolText(result);
  }
);

server.registerTool(
  "mailagent_list_inboxes",
  {
    description:
      "List active inboxes by label (QA: debug failed CI run, find address/ids).",
    inputSchema: {
      label: z
        .string()
        .optional()
        .describe("Filter by label, e.g. ci-12345 or pw-worker-2"),
      limit: z.number().int().min(1).max(50).optional(),
    },
  },
  async ({ label, limit }) => {
    const client = new MailAgentClient();
    const q = new URLSearchParams();
    if (label) q.set("label", label);
    if (limit) q.set("limit", String(limit));
    const path = `/v1/inboxes${q.toString() ? `?${q}` : ""}`;
    return toolText(await client.request<{ inboxes: unknown[] }>(path));
  }
);

server.registerTool(
  "mailagent_wait_for_message",
  {
    description:
      "Block until the first email arrives (SSE, fallback poll). Use after submitting a form to the inbox address.",
    inputSchema: {
      inboxId: z.string().describe("Inbox id from mailagent_create_inbox"),
      timeoutSeconds: z
        .number()
        .int()
        .min(5)
        .max(120)
        .optional()
        .describe("Max wait time in seconds (default 90)"),
      subjectContains: z
        .string()
        .optional()
        .describe("Only accept email whose subject contains this text"),
    },
  },
  async ({ inboxId, timeoutSeconds, subjectContains }) => {
    const client = new MailAgentClient();
    const result = await client.waitForMessage(
      inboxId,
      timeoutSeconds ?? 90,
      { subjectContains }
    );
    if ("error" in result && result.error === "timeout") {
      return toolText({
        error: "timeout",
        inboxId,
        hint: "No email yet. Retry with a longer timeout or check the sender used the correct address.",
      });
    }
    return toolText(result);
  }
);

server.registerTool(
  "mailagent_list_messages",
  {
    description: "List all messages received for an inbox (newest first).",
    inputSchema: {
      inboxId: z.string().describe("Inbox id"),
    },
  },
  async ({ inboxId }) => {
    const client = new MailAgentClient();
    return toolText(await client.listMessages(inboxId));
  }
);

server.registerTool(
  "mailagent_extract_verification",
  {
    description:
      "Get OTP code and links from the latest email in the inbox (pre-parsed at ingest). Best after a message arrived.",
    inputSchema: {
      inboxId: z.string().describe("Inbox id"),
    },
  },
  async ({ inboxId }) => {
    const client = new MailAgentClient();
    try {
      return toolText(await client.extract(inboxId));
    } catch (e) {
      return toolText({
        error: String(e),
        hint: "Call mailagent_wait_for_message first if the inbox is empty.",
      });
    }
  }
);

server.registerTool(
  "mailagent_simulate_message",
  {
    description: "Inject test OTP email without SMTP (QA/dev, sim_* provider).",
    inputSchema: {
      inboxId: z.string(),
      otp: z.string().optional(),
      from: z.string().optional(),
      subject: z.string().optional(),
      fireCallback: z.boolean().optional(),
      attachmentFilename: z.string().optional(),
      inReplyToMessageId: z.string().optional(),
      rfcMessageId: z.string().optional(),
      inReplyTo: z.string().optional(),
      references: z.string().optional(),
    },
  },
  async (args) => {
    const client = new MailAgentClient();
    return toolText(await client.simulateMessage(args.inboxId, args));
  }
);

server.registerTool(
  "mailagent_send_message",
  {
    description: "Send outbound email from inbox (two-way agent mail).",
    inputSchema: {
      inboxId: z.string(),
      to: z.union([z.string(), z.array(z.string())]),
      subject: z.string(),
      text: z.string().optional(),
      html: z.string().optional(),
      inReplyToMessageId: z.string().optional(),
    },
  },
  async (args) => {
    const client = new MailAgentClient();
    return toolText(await client.sendMessage(args.inboxId, args));
  }
);

server.registerTool(
  "mailagent_list_threads",
  {
    description: "List threads or messages in a thread.",
    inputSchema: {
      inboxId: z.string(),
      threadId: z.string().optional(),
    },
  },
  async ({ inboxId, threadId }) => {
    const client = new MailAgentClient();
    return toolText(await client.listThreads(inboxId, threadId));
  }
);

server.registerTool(
  "mailagent_diagnose_inbox",
  {
    description:
      "When wait/verify fails: messages, callbacks, hints, debugUiUrl, troubleshooting.",
    inputSchema: {
      inboxId: z.string().describe("Inbox id"),
      subjectContains: z.string().optional(),
      messageIndex: z.number().int().min(0).optional(),
    },
  },
  async ({ inboxId, subjectContains, messageIndex }) => {
    const client = new MailAgentClient();
    return toolText(
      await client.diagnoseInbox(inboxId, { subjectContains, messageIndex })
    );
  }
);

server.registerTool(
  "mailagent_get_inbox",
  {
    description: "Get inbox status: address, expiry, message count.",
    inputSchema: {
      inboxId: z.string().describe("Inbox id"),
    },
  },
  async ({ inboxId }) => {
    const client = new MailAgentClient();
    return toolText(await client.getInbox(inboxId));
  }
);

server.registerTool(
  "mailagent_delete_inbox",
  {
    description: "Delete inbox and all messages early (cleanup after verification).",
    inputSchema: {
      inboxId: z.string().describe("Inbox id"),
    },
  },
  async ({ inboxId }) => {
    const client = new MailAgentClient();
    return toolText(await client.deleteInbox(inboxId));
  }
);

server.registerTool(
  "mailagent_get_raw_message",
  {
    description:
      "Download archived .eml metadata or body (base64 via API when includeBody). Use when extract finds no OTP.",
    inputSchema: {
      inboxId: z.string().describe("Inbox id"),
      messageId: z.string().describe("Message id from list_messages or verify"),
      includeBody: z
        .boolean()
        .optional()
        .describe("Fetch metadata only when false (default)"),
    },
  },
  async ({ inboxId, messageId, includeBody }) => {
    const client = new MailAgentClient();
    try {
      if (includeBody) {
        const raw = await client.getRawMessage(inboxId, messageId, {
          metadataOnly: false,
        });
        const body =
          "body" in raw && typeof raw.body === "string" ? raw.body : "";
        return toolText({
          inboxId,
          messageId,
          contentType: raw.contentType,
          bodyPreview: body.slice(0, 4000),
          truncated: body.length > 4000,
        });
      }
      return toolText(
        await client.getRawMessage(inboxId, messageId, { metadataOnly: true })
      );
    } catch (e) {
      return toolText({ error: String(e) });
    }
  }
);

server.registerTool(
  "mailagent_check_email",
  {
    description:
      "Check email syntax, disposable, role, MX (DNS). ONLY for app validation tests — NOT before verify_signup.",
    inputSchema: {
      email: z.string().email().describe("Address to check"),
    },
  },
  async ({ email }) => {
    const client = new MailAgentClient();
    try {
      return toolText(await client.checkEmail(email));
    } catch (e) {
      return toolText({ error: String(e) });
    }
  }
);

server.registerTool(
  "mailagent_get_run_session",
  {
    description: "Read multi-step agent run state (JSON + step log) by runId.",
    inputSchema: {
      runId: z.string().describe("Agent run id (label agent-{runId})"),
    },
  },
  async ({ runId }) => {
    const client = new MailAgentClient();
    return toolText(await client.getRunSession(runId));
  }
);

server.registerTool(
  "mailagent_patch_run_session",
  {
    description: "Merge state and/or append a step for multi-step agent flows.",
    inputSchema: {
      runId: z.string(),
      merge: z.record(z.unknown()).optional(),
      replaceState: z.record(z.unknown()).optional(),
      step: z
        .object({
          name: z.string(),
          data: z.record(z.unknown()).optional(),
        })
        .optional(),
    },
  },
  async (args) => {
    const client = new MailAgentClient();
    return toolText(await client.patchRunSession(args.runId, args));
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("mailagent-mcp: connected (stdio)");
}

main().catch((err) => {
  console.error("mailagent-mcp fatal:", err);
  process.exit(1);
});
