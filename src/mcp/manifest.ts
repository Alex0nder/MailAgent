/** MCP tool definitions для remote HTTP + docs */
import { SERVICE_EXPECT_FROM } from "../lib/service-presets";

export const SERVICE_NAMES = Object.keys(SERVICE_EXPECT_FROM);

const servicesEnum = SERVICE_NAMES;

export const MCP_SERVER_INFO = {
  name: "mailagent",
  version: "0.7.0",
};

export const MCP_TOOLS = [
  {
    name: "mailagent_verify_signup",
    description:
      "Preferred: wait for verification email and return agent.primaryAction (OTP or magic link + instruction).",
    inputSchema: {
      type: "object",
      properties: {
        inboxId: { type: "string", description: "Existing inbox after form submit" },
        service: { type: "string", enum: servicesEnum },
        runId: { type: "string", description: "Agent run id (stored as label for tracing)" },
        label: { type: "string" },
        subjectContains: { type: "string" },
        messageIndex: {
          type: "integer",
          minimum: 0,
          description: "0=newest matching email, 1=second, …",
        },
        timeoutSeconds: { type: "integer", minimum: 5, maximum: 120 },
        ttlMinutes: { type: "integer" },
        deleteAfter: { type: "boolean" },
      },
    },
  },
  {
    name: "mailagent_create_inbox",
    description: "Create temporary inbox; returns address for signup forms.",
    inputSchema: {
      type: "object",
      properties: {
        service: { type: "string", enum: servicesEnum },
        runId: { type: "string" },
        label: { type: "string" },
        ttlMinutes: { type: "integer" },
        callbackUrl: { type: "string", format: "uri" },
      },
    },
  },
  {
    name: "mailagent_wait_and_extract",
    description: "Create/wait/extract/delete one-shot flow.",
    inputSchema: {
      type: "object",
      properties: {
        inboxId: { type: "string" },
        service: { type: "string", enum: servicesEnum },
        runId: { type: "string" },
        subjectContains: { type: "string" },
        messageIndex: {
          type: "integer",
          minimum: 0,
          description: "0=newest matching email, 1=second, …",
        },
        timeoutSeconds: { type: "integer" },
        deleteAfter: { type: "boolean" },
      },
    },
  },
  {
    name: "mailagent_list_inboxes",
    description: "List inboxes by label (debug agent/CI runs).",
    inputSchema: {
      type: "object",
      properties: {
        label: { type: "string" },
        runId: { type: "string" },
        limit: { type: "integer", maximum: 50 },
      },
    },
  },
  {
    name: "mailagent_wait_for_message",
    description: "Block until Nth email (messageIndex 0=newest, poll on server).",
    inputSchema: {
      type: "object",
      required: ["inboxId"],
      properties: {
        inboxId: { type: "string" },
        timeoutSeconds: { type: "integer" },
        subjectContains: { type: "string" },
        messageIndex: {
          type: "integer",
          minimum: 0,
          description: "0=newest matching email, 1=second, …",
        },
      },
    },
  },
  {
    name: "mailagent_extract_verification",
    description: "OTP + links from latest message.",
    inputSchema: {
      type: "object",
      required: ["inboxId"],
      properties: { inboxId: { type: "string" } },
    },
  },
  {
    name: "mailagent_diagnose_inbox",
    description:
      "When wait/verify fails: messages, callbacks, wait hints, debugUiUrl, troubleshooting steps.",
    inputSchema: {
      type: "object",
      required: ["inboxId"],
      properties: {
        inboxId: { type: "string" },
        subjectContains: { type: "string" },
        messageIndex: {
          type: "integer",
          minimum: 0,
          description: "Same index used in wait (0=newest match)",
        },
      },
    },
  },
  {
    name: "mailagent_get_inbox",
    description: "Inbox status and message count.",
    inputSchema: {
      type: "object",
      required: ["inboxId"],
      properties: { inboxId: { type: "string" } },
    },
  },
  {
    name: "mailagent_delete_inbox",
    description: "Delete inbox early.",
    inputSchema: {
      type: "object",
      required: ["inboxId"],
      properties: { inboxId: { type: "string" } },
    },
  },
  {
    name: "mailagent_list_messages",
    description: "List messages in inbox (id, otp, hasRaw, rawUrl).",
    inputSchema: {
      type: "object",
      required: ["inboxId"],
      properties: {
        inboxId: { type: "string" },
        subjectContains: { type: "string" },
      },
    },
  },
  {
    name: "mailagent_get_raw_message",
    description:
      "Fetch archived .eml metadata or base64 body when extract fails (R2).",
    inputSchema: {
      type: "object",
      required: ["inboxId", "messageId"],
      properties: {
        inboxId: { type: "string" },
        messageId: { type: "string" },
        includeBody: {
          type: "boolean",
          description: "Return bodyBase64 (truncated to agent limit)",
        },
      },
    },
  },
  {
    name: "mailagent_list_attachments",
    description: "List attachment metadata for a message (filename, size, downloadUrl).",
    inputSchema: {
      type: "object",
      required: ["inboxId", "messageId"],
      properties: {
        inboxId: { type: "string" },
        messageId: { type: "string" },
      },
    },
  },
  {
    name: "mailagent_get_attachment",
    description:
      "Resend signed download URL + cache flag for one attachment (use REST download for bytes).",
    inputSchema: {
      type: "object",
      required: ["inboxId", "messageId", "attachmentId"],
      properties: {
        inboxId: { type: "string" },
        messageId: { type: "string" },
        attachmentId: { type: "string" },
      },
    },
  },
] as const;

/** Имена tools для GET /v1/agent и GET /v1 — единый источник с MCP_TOOLS */
export const MCP_TOOL_NAMES: string[] = MCP_TOOLS.map((t) => t.name);
