/** MCP tool definitions for remote HTTP + docs */
import {
  SERVICE_EXPECT_FROM,
  formatSubjectHintsForDocs,
} from "../lib/service-presets";

export const SERVICE_NAMES = Object.keys(SERVICE_EXPECT_FROM);

const servicesEnum = SERVICE_NAMES;
const subjectContainsDesc = `Filter by subject substring. Per service: ${formatSubjectHintsForDocs()}.`;
const verifySignupDesc =
  "Preferred: wait for verification email and return agent.primaryAction (OTP or magic link). " +
  `Set service for allowlist. subjectContains hints: ${formatSubjectHintsForDocs(10)}. ` +
  "On timeout response includes debugUiUrl — open or call mailagent_diagnose_inbox.";

export const MCP_SERVER_INFO = {
  name: "mailagent",
  version: "0.8.1",
};

export const MCP_TOOLS = [
  {
    name: "mailagent_verify_signup",
    description: verifySignupDesc,
    inputSchema: {
      type: "object",
      properties: {
        inboxId: { type: "string", description: "Existing inbox after form submit" },
        service: { type: "string", enum: servicesEnum },
        runId: { type: "string", description: "Agent run id (stored as label for tracing)" },
        label: { type: "string" },
        subjectContains: { type: "string", description: subjectContainsDesc },
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
        username: {
          type: "string",
          description: "Local part for custom domain inbox (requires domainId)",
        },
        domainId: { type: "string", description: "Verified custom domain id" },
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
        subjectContains: { type: "string", description: subjectContainsDesc },
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
        subjectContains: { type: "string", description: subjectContainsDesc },
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
    name: "mailagent_simulate_message",
    description:
      "QA/dev: inject a test OTP email into an inbox without real SMTP (provider id sim_*).",
    inputSchema: {
      type: "object",
      required: ["inboxId"],
      properties: {
        inboxId: { type: "string" },
        otp: { type: "string" },
        from: { type: "string" },
        subject: { type: "string" },
        fireCallback: { type: "boolean" },
        attachmentFilename: { type: "string" },
        inReplyToMessageId: { type: "string" },
        rfcMessageId: { type: "string" },
        inReplyTo: { type: "string" },
        references: { type: "string" },
      },
    },
  },
  {
    name: "mailagent_send_message",
    description:
      "Send outbound email from inbox (reply to thread). Shared: OUTBOUND_FROM on Worker. Enterprise dedicated Resend: custom-domain inbox only.",
    inputSchema: {
      type: "object",
      required: ["inboxId", "to", "subject"],
      properties: {
        inboxId: { type: "string" },
        to: { oneOf: [{ type: "string" }, { type: "array", items: { type: "string" } }] },
        subject: { type: "string" },
        text: { type: "string" },
        html: { type: "string" },
        inReplyToMessageId: { type: "string" },
      },
    },
  },
  {
    name: "mailagent_list_threads",
    description: "List email threads in an inbox (conversation view).",
    inputSchema: {
      type: "object",
      required: ["inboxId"],
      properties: {
        inboxId: { type: "string" },
        threadId: { type: "string", description: "If set, return messages in thread" },
      },
    },
  },
  {
    name: "mailagent_add_domain",
    description:
      "Register custom domain in Resend; returns DNS records to add before verify.",
    inputSchema: {
      type: "object",
      required: ["name"],
      properties: {
        name: { type: "string", description: "e.g. mail.example.com" },
      },
    },
  },
  {
    name: "mailagent_list_domains",
    description: "List custom domains for the current team or API key.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "mailagent_verify_domain",
    description: "Trigger DNS verification poll for a custom domain.",
    inputSchema: {
      type: "object",
      required: ["domainId"],
      properties: { domainId: { type: "string" } },
    },
  },
  {
    name: "mailagent_extract_structured",
    description:
      "Extract structured JSON from a message using preset (2fa, invoice, receipt) or custom schema (requires Workers AI).",
    inputSchema: {
      type: "object",
      required: ["inboxId", "messageId"],
      properties: {
        inboxId: { type: "string" },
        messageId: { type: "string" },
        preset: { type: "string", enum: ["2fa", "invoice", "receipt"] },
        schema: { type: "object", description: "Custom JSON schema properties (AI)" },
      },
    },
  },
  {
    name: "mailagent_search_messages",
    description:
      "Search inbox messages by keyword (subject/body/from/otp) and optional semantic similarity.",
    inputSchema: {
      type: "object",
      required: ["inboxId", "q"],
      properties: {
        inboxId: { type: "string" },
        q: { type: "string" },
        limit: { type: "integer", maximum: 50 },
        mode: { type: "string", enum: ["auto", "keyword", "semantic"] },
      },
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
        subjectContains: { type: "string", description: subjectContainsDesc },
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
        subjectContains: { type: "string", description: subjectContainsDesc },
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
  {
    name: "mailagent_get_run_session",
    description:
      "Read multi-step agent run state (JSON + step log) keyed by runId.",
    inputSchema: {
      type: "object",
      required: ["runId"],
      properties: {
        runId: { type: "string", description: "Agent run id (label agent-{runId})" },
      },
    },
  },
  {
    name: "mailagent_patch_run_session",
    description:
      "Merge state and/or append a step for multi-step agent flows.",
    inputSchema: {
      type: "object",
      required: ["runId"],
      properties: {
        runId: { type: "string" },
        merge: { type: "object", description: "Shallow merge into session state" },
        replaceState: { type: "object", description: "Replace entire state object" },
        step: {
          type: "object",
          properties: {
            name: { type: "string" },
            data: { type: "object" },
          },
          required: ["name"],
        },
      },
    },
  },
] as const;

/** Tool names for GET /v1/agent and GET /v1 — single source with MCP_TOOLS */
export const MCP_TOOL_NAMES: string[] = MCP_TOOLS.map((t) => t.name);
