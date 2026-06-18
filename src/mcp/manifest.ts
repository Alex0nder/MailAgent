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
const workspaceMessageSchema = {
  type: "object",
  properties: {
    id: { type: "string" },
    from: { type: "string" },
    to: { type: "array", items: { type: "string" } },
    cc: { type: "array", items: { type: "string" } },
    subject: { type: "string" },
    text: { type: "string" },
    receivedAt: { type: "string" },
  },
} as const;
const workspaceThreadProps = {
  threadId: { type: "string", description: "Optional source thread id" },
  goal: { type: "string", description: "What the agent should optimize for" },
  messages: {
    type: "array",
    items: workspaceMessageSchema,
    description: "Supplied mail messages. Preview mode does not connect to Gmail yet.",
  },
} as const;

export const MCP_SERVER_INFO = {
  name: "mailagent",
  version: "0.8.2",
};

export const MCP_TOOLS = [
  {
    name: "mailagent_issue_access",
    description:
      "Issue a short-lived scoped MailAgent API key for one autonomous agent run. Requires an unrestricted DB team key; returns the key once, expiry, labelPrefix policy, and next planner payload.",
    inputSchema: {
      type: "object",
      properties: {
        purpose: { type: "string", description: "Short reason/label for the access grant" },
        runId: { type: "string", description: "Agent or CI run id used to derive labelPrefix" },
        labelPrefix: {
          type: "string",
          description: "Required access boundary for created inbox labels; generated from runId if omitted",
        },
        ttlMinutes: { type: "integer", minimum: 5, maximum: 1440, default: 240 },
        readOnly: { type: "boolean", default: false },
        service: { type: "string", description: "Optional service preset for returned next payload" },
        allowSimulate: { type: "boolean", default: true },
      },
    },
  },
  {
    name: "mailagent_plan_next",
    description:
      "Autopilot planner: given service/sender hints, inboxId, status, or timeout, return the next best MailAgent tool and ready payloads. Use when an agent is unsure what to do next.",
    inputSchema: {
      type: "object",
      properties: {
        inboxId: { type: "string", description: "Existing inbox id, if already created" },
        status: {
          type: "string",
          enum: [
            "start",
            "address_ready",
            "form_submitted",
            "timeout",
            "message_received",
            "verified",
            "failed",
          ],
        },
        service: { type: "string", description: "Known service preset, if any" },
        from: { type: "string", description: "Sample From header for preset advice" },
        subject: { type: "string", description: "Sample or expected subject" },
        text: { type: "string", description: "Optional sample body text" },
        html: { type: "string", description: "Optional sample HTML" },
        flow: {
          type: "string",
          enum: ["signup", "login", "password_reset", "invite_accept", "magic_link_login"],
        },
        runId: { type: "string" },
        label: { type: "string" },
        subjectContains: { type: "string", description: subjectContainsDesc },
        messageIndex: { type: "integer", minimum: 0 },
        timeoutSeconds: { type: "integer", minimum: 5, maximum: 120 },
        deleteAfterSuccess: { type: "boolean" },
        keepOnFailure: { type: "boolean" },
        allowSimulate: { type: "boolean" },
        lastError: { type: "string" },
      },
    },
  },
  {
    name: "mailagent_start_run",
    description:
      "Start a server-side autonomous agent run session and return the first autopilot plan. Use before multi-step signup/login QA so progress can be resumed without human bookkeeping.",
    inputSchema: {
      type: "object",
      properties: {
        runId: { type: "string", description: "Optional stable run id; generated when omitted" },
        appUrl: { type: "string", description: "App or staging URL under test" },
        notes: { type: "string", description: "Short context for the run" },
        service: { type: "string", description: "Known service preset, if any" },
        from: { type: "string", description: "Sample From header for preset advice" },
        subject: { type: "string", description: "Expected or sample subject" },
        flow: {
          type: "string",
          enum: ["signup", "login", "password_reset", "invite_accept", "magic_link_login"],
        },
        label: { type: "string" },
        subjectContains: { type: "string", description: subjectContainsDesc },
        timeoutSeconds: { type: "integer", minimum: 5, maximum: 120 },
        deleteAfterSuccess: { type: "boolean" },
        keepOnFailure: { type: "boolean" },
        allowSimulate: { type: "boolean" },
      },
    },
  },
  {
    name: "mailagent_next_run",
    description:
      "Resume an agent run and return the next best tool/payload from saved session state. Optionally merge fresh status, inboxId, service, or subject hints first.",
    inputSchema: {
      type: "object",
      required: ["runId"],
      properties: {
        runId: { type: "string" },
        inboxId: { type: "string" },
        status: {
          type: "string",
          enum: [
            "start",
            "address_ready",
            "form_submitted",
            "timeout",
            "message_received",
            "verified",
            "failed",
          ],
        },
        service: { type: "string" },
        from: { type: "string" },
        subject: { type: "string" },
        text: { type: "string" },
        html: { type: "string" },
        flow: {
          type: "string",
          enum: ["signup", "login", "password_reset", "invite_accept", "magic_link_login"],
        },
        label: { type: "string" },
        subjectContains: { type: "string", description: subjectContainsDesc },
        messageIndex: { type: "integer", minimum: 0 },
        timeoutSeconds: { type: "integer", minimum: 5, maximum: 120 },
        deleteAfterSuccess: { type: "boolean" },
        keepOnFailure: { type: "boolean" },
        allowSimulate: { type: "boolean" },
        lastError: { type: "string" },
      },
    },
  },
  {
    name: "mailagent_report_run",
    description:
      "Report agent run progress or failure, append a timeline step, update saved state, and return the next autopilot plan.",
    inputSchema: {
      type: "object",
      required: ["runId"],
      properties: {
        runId: { type: "string" },
        status: {
          type: "string",
          enum: [
            "start",
            "address_ready",
            "form_submitted",
            "timeout",
            "message_received",
            "verified",
            "failed",
          ],
        },
        step: { type: "string", description: "Optional custom step name" },
        error: { type: "string", description: "Last error for recovery planning" },
        result: { type: "object", description: "Small structured result from the previous action" },
        inboxId: { type: "string" },
        service: { type: "string" },
        from: { type: "string" },
        subject: { type: "string" },
        text: { type: "string" },
        html: { type: "string" },
        flow: {
          type: "string",
          enum: ["signup", "login", "password_reset", "invite_accept", "magic_link_login"],
        },
        label: { type: "string" },
        subjectContains: { type: "string", description: subjectContainsDesc },
        messageIndex: { type: "integer", minimum: 0 },
        timeoutSeconds: { type: "integer", minimum: 5, maximum: 120 },
        deleteAfterSuccess: { type: "boolean" },
        keepOnFailure: { type: "boolean" },
        allowSimulate: { type: "boolean" },
      },
    },
  },
  {
    name: "mailagent_suggest_preset",
    description:
      "Suggest service preset, expectFrom, subjectContains, flow, and snippets from a sample auth email From/Subject/body. Use before verify when sender or service is unclear.",
    inputSchema: {
      type: "object",
      properties: {
        service: {
          type: "string",
          description: "Optional known service name; unknown values fall back to custom expectFrom.",
        },
        from: {
          type: "string",
          description: "Sample From header, e.g. Auth0 <no-reply@auth0.com>.",
        },
        subject: {
          type: "string",
          description: "Sample subject from the auth email.",
        },
        text: {
          type: "string",
          description: "Optional text body sample; do not include secrets unless needed.",
        },
        html: {
          type: "string",
          description: "Optional HTML body sample; tags are ignored for routing hints.",
        },
        flow: {
          type: "string",
          enum: ["signup", "login", "password_reset", "invite_accept", "magic_link_login"],
        },
      },
    },
  },
  {
    name: "mailagent_workspace_summarize",
    description:
      "Workspace Agent preview: summarize supplied mail/thread messages, extract action items, decisions, and open questions. Uses DeepSeek/Qwen if configured, otherwise deterministic rules.",
    inputSchema: {
      type: "object",
      properties: workspaceThreadProps,
    },
  },
  {
    name: "mailagent_workspace_draft_reply",
    description:
      "Workspace Agent preview: draft a reply from supplied messages. Draft-only; never sends and always requires approval.",
    inputSchema: {
      type: "object",
      properties: {
        ...workspaceThreadProps,
        tone: { type: "string", enum: ["concise", "friendly", "formal"] },
        instruction: { type: "string", description: "Extra reply guidance" },
      },
    },
  },
  {
    name: "mailagent_workspace_suggest_reminders",
    description:
      "Workspace Agent preview: suggest reminders/follow-ups from supplied mail messages. Does not create reminders yet.",
    inputSchema: {
      type: "object",
      properties: {
        ...workspaceThreadProps,
        now: { type: "string", description: "Current timestamp for due hints" },
        timezone: { type: "string", description: "IANA timezone, e.g. Asia/Tbilisi" },
      },
    },
  },
  {
    name: "mailagent_workspace_create_reminder",
    description:
      "Workspace Agent preview: persist a reminder/follow-up. Does not send email or create calendar events.",
    inputSchema: {
      type: "object",
      required: ["title"],
      properties: {
        title: { type: "string" },
        dueAt: { type: "string", description: "ISO timestamp when known" },
        dueHint: { type: "string", description: "Human due hint, e.g. tomorrow" },
        source: { type: "string", description: "message, thread, manual, etc." },
        sourceThreadId: { type: "string" },
        sourceMessageId: { type: "string" },
        meta: { type: "object" },
      },
    },
  },
  {
    name: "mailagent_workspace_list_reminders",
    description:
      "Workspace Agent preview: list saved reminders/follow-ups for the current team or API key.",
    inputSchema: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["open", "completed", "all"] },
        limit: { type: "integer", minimum: 1, maximum: 100 },
      },
    },
  },
  {
    name: "mailagent_workspace_complete_reminder",
    description:
      "Workspace Agent preview: mark a saved reminder/follow-up as completed.",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: {
        id: { type: "string" },
      },
    },
  },
  {
    name: "mailagent_verify_signup",
    description: verifySignupDesc,
    inputSchema: {
      type: "object",
      properties: {
        inboxId: { type: "string", description: "Existing inbox after form submit" },
        service: { type: "string", enum: servicesEnum },
        expectFrom: {
          oneOf: [
            { type: "string" },
            { type: "array", items: { type: "string" } },
          ],
          description: "Custom sender allowlist when no service preset exists.",
        },
        flow: {
          type: "string",
          enum: ["signup", "login", "password_reset"],
          description:
            "Default subjectContains when omitted: signup=verify, login=2FA code, password_reset=reset link",
        },
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
        deleteAfterSuccess: { type: "boolean" },
        keepOnFailure: { type: "boolean" },
        deleteAfterMinutes: {
          type: "integer",
          minimum: 1,
          maximum: 1440,
          description: "Set inbox TTL/auto-expiry in minutes",
        },
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
        expectFrom: {
          oneOf: [
            { type: "string" },
            { type: "array", items: { type: "string" } },
          ],
          description: "Custom sender allowlist when no service preset exists.",
        },
        runId: { type: "string" },
        label: { type: "string" },
        ttlMinutes: { type: "integer" },
        deleteAfterMinutes: {
          type: "integer",
          minimum: 1,
          maximum: 1440,
          description: "Set inbox TTL/auto-expiry in minutes",
        },
        callbackUrl: { type: "string", format: "uri" },
        notifyEmail: {
          type: "string",
          description: "Developer real inbox — relay OTP/summary after verification mail",
        },
        notifyMode: {
          type: "string",
          enum: ["verification", "off"],
        },
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
        expectFrom: {
          oneOf: [
            { type: "string" },
            { type: "array", items: { type: "string" } },
          ],
          description: "Custom sender allowlist when no service preset exists.",
        },
        runId: { type: "string" },
        subjectContains: { type: "string", description: subjectContainsDesc },
        messageIndex: {
          type: "integer",
          minimum: 0,
          description: "0=newest matching email, 1=second, …",
        },
        timeoutSeconds: { type: "integer" },
        deleteAfter: { type: "boolean" },
        deleteAfterSuccess: { type: "boolean" },
        keepOnFailure: { type: "boolean" },
        deleteAfterMinutes: { type: "integer", minimum: 1, maximum: 1440 },
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
    description:
      "OTP + links from latest message, including confidence, matchedRule, reason, and alternatives.",
    inputSchema: {
      type: "object",
      required: ["inboxId"],
      properties: { inboxId: { type: "string" } },
    },
  },
  {
    name: "mailagent_simulate_message",
    description:
      "QA/dev: inject test mail without SMTP. Use scenario preset (otp, magic_link, attachment, invite, invoice_fixture) or override fields. List: GET /v1/inboxes/simulate/scenarios.",
    inputSchema: {
      type: "object",
      required: ["inboxId"],
      properties: {
        inboxId: { type: "string" },
        scenario: {
          type: "string",
          enum: [
            "otp",
            "magic_link",
            "attachment",
            "invite",
            "invoice_fixture",
            "login_2fa",
            "password_reset",
          ],
        },
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
      "Extract structured JSON from a message using preset (2fa, magic_link, invite, invoice, receipt) or custom schema (requires Workers AI).",
    inputSchema: {
      type: "object",
      required: ["inboxId", "messageId"],
      properties: {
        inboxId: { type: "string" },
        messageId: { type: "string" },
        preset: {
          type: "string",
          enum: ["2fa", "magic_link", "invite", "invoice", "receipt"],
        },
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
    name: "mailagent_check_email",
    description:
      "Check email syntax, disposable domain, role account, and MX (DNS). Use ONLY when testing whether an app rejects bad addresses — NOT before mailagent_verify_signup (temp inbox is always valid). No SMTP mailbox probe.",
    inputSchema: {
      type: "object",
      required: ["email"],
      properties: {
        email: { type: "string", description: "Address to verify (e.g. user@company.com)" },
      },
    },
  },
  {
    name: "mailagent_diagnose_inbox",
    description:
      "When wait/verify fails: messages, callbacks, wait hints, debugUiUrl, troubleshooting steps, and machine-readable recommendedAction/retry payloads.",
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
    name: "mailagent_cleanup_inboxes",
    description:
      "Delete all inboxes matching a labelPrefix, or an agent run via runId (label agent-{runId}). Useful after CI/QA runs.",
    inputSchema: {
      type: "object",
      properties: {
        labelPrefix: { type: "string", minLength: 3 },
        runId: { type: "string", description: "Deletes label prefix agent-{runId}" },
      },
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
    name: "mailagent_get_run_timeline",
    description:
      "Read normalized agent run timeline events for inbox, wait, message, extraction, callback, notify, and diagnose milestones.",
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
