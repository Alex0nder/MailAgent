/** Workspace Agent API: safe mail/calendar assistant primitives. */
import { Hono } from "hono";
import type { Env } from "../env";
import type { ApiVariables } from "../lib/api-context";
import { requireApiKey } from "../lib/auth";
import { rateLimit } from "../lib/rate-limit";
import { scopeAdminDenied, scopeInboxDenied, scopeWriteDenied } from "../lib/scope-guard";
import { auditRoute } from "../services/audit-log";
import { getInbox } from "../services/inbox";
import {
  probeWorkspaceProviders,
  workspaceProviderInfo,
} from "../services/llm-provider";
import {
  completeWorkspaceReminder,
  createWorkspaceReminder,
  listWorkspaceReminders,
  type WorkspaceReminderInput as WorkspaceReminderCreateInput,
} from "../services/workspace-reminders";
import {
  listWorkspaceActions,
  logWorkspaceAction,
  type WorkspaceActionInput,
} from "../services/workspace-actions";
import {
  getWorkspaceAutonomyPolicy,
  setWorkspaceAutonomyPolicy,
  type WorkspaceAutonomyPolicyInput,
} from "../services/workspace-autonomy";
import {
  executeWorkspaceReply,
  type WorkspaceExecuteReplyInput,
} from "../services/workspace-execution";
import {
  draftWorkspaceReply,
  suggestWorkspaceReminders,
  summarizeWorkspaceThread,
  type WorkspaceDraftReplyInput,
  type WorkspaceReminderInput,
  type WorkspaceSummarizeInput,
} from "../services/workspace-agent";

export const workspaceRoutes = new Hono<{ Bindings: Env; Variables: ApiVariables }>();

workspaceRoutes.use("*", requireApiKey);
workspaceRoutes.use("*", rateLimit);

workspaceRoutes.get("/", (c) => {
  const provider = workspaceProviderInfo(c.env);
  return c.json({
    name: "MailAgent Workspace Agent",
    status: "autonomy_preview",
    safety: {
      defaultMode: "read_only_and_draft_only",
      sendAllowed: "policy_gated",
      calendarWriteAllowed: false,
      redaction: "enabled",
      idempotency: "required_for_send",
    },
    model: {
      provider: provider.provider,
      model: provider.model,
      configured: provider.configured,
      fallbackEnabled: provider.fallbackEnabled,
    },
    endpoints: {
      summarize: "POST /v1/workspace/summarize",
      draftReply: "POST /v1/workspace/draft-reply",
      suggestReminders: "POST /v1/workspace/reminders/suggest",
      createReminder: "POST /v1/workspace/reminders",
      listReminders: "GET /v1/workspace/reminders",
      completeReminder: "PATCH /v1/workspace/reminders/:id/complete",
      logAction: "POST /v1/workspace/actions",
      listActions: "GET /v1/workspace/actions",
      getPolicy: "GET /v1/workspace/policy",
      setPolicy: "PUT /v1/workspace/policy",
      executeReply: "POST /v1/workspace/execute-reply",
      modelStatus: "GET /v1/workspace/models",
      modelProbe: "POST /v1/workspace/models/probe",
    },
    roadmap: "https://github.com/Alex0nder/MailAgent/blob/main/docs/WORKSPACE-AGENT-PBR.md",
  });
});

workspaceRoutes.get("/models", (c) => {
  return c.json({ readiness: workspaceProviderInfo(c.env) });
});

workspaceRoutes.post("/models/probe", async (c) => {
  const adminErr = scopeAdminDenied(c);
  if (adminErr) return adminErr;
  return c.json(await probeWorkspaceProviders(c.env));
});

workspaceRoutes.get("/policy", async (c) => {
  const policy = await getWorkspaceAutonomyPolicy(c.env, {
    teamId: c.get("teamId"),
    apiKeyHint: c.get("apiKeyHint"),
  });
  return c.json({
    policy,
    safety: {
      defaultMode: "draft_only",
      replyContextRequired: true,
      ruleFallbackAutoSend: false,
      idempotencyRequired: true,
    },
  });
});

workspaceRoutes.put("/policy", async (c) => {
  const adminErr = scopeAdminDenied(c);
  if (adminErr) return adminErr;
  let body: WorkspaceAutonomyPolicyInput = {};
  try {
    body = await c.req.json<WorkspaceAutonomyPolicyInput>();
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }
  const result = await setWorkspaceAutonomyPolicy(
    c.env,
    { teamId: c.get("teamId"), apiKeyHint: c.get("apiKeyHint") },
    body
  );
  if (!result.ok) return c.json({ error: result.error }, result.status);
  auditRoute(c, {
    action: "workspace.policy_updated",
    resourceType: "workspace_policy",
    meta: { mode: result.policy.mode },
  });
  return c.json(result.policy);
});

workspaceRoutes.post("/execute-reply", async (c) => {
  const writeErr = scopeWriteDenied(c);
  if (writeErr) return writeErr;
  let body: WorkspaceExecuteReplyInput = {};
  try {
    body = await c.req.json<WorkspaceExecuteReplyInput>();
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }
  if (!body.inboxId || !body.messageId) {
    return c.json({ error: "inbox_id_and_message_id_required" }, 400);
  }
  const inbox = body.inboxId
    ? await getInbox(c.env, body.inboxId, { apiKeyHint: c.get("apiKeyHint") })
    : null;
  const inboxErr = scopeInboxDenied(c, inbox);
  if (inboxErr) return inboxErr;
  const result = await executeWorkspaceReply(
    c.env,
    { teamId: c.get("teamId"), apiKeyHint: c.get("apiKeyHint") },
    body
  );
  if (!result.ok) return c.json({ error: result.error }, result.status);
  if (result.sent) {
    auditRoute(c, {
      action: "workspace.reply_sent",
      resourceType: "message",
      resourceId: body.messageId,
      meta: { inboxId: body.inboxId, reminderId: body.reminderId },
    });
  }
  return c.json(result, result.sent ? 201 : 200);
});

workspaceRoutes.post("/summarize", async (c) => {
  let body: WorkspaceSummarizeInput = {};
  try {
    body = await c.req.json<WorkspaceSummarizeInput>();
  } catch {
    body = {};
  }
  return c.json(await summarizeWorkspaceThread(c.env, body));
});

workspaceRoutes.post("/draft-reply", async (c) => {
  let body: WorkspaceDraftReplyInput = {};
  try {
    body = await c.req.json<WorkspaceDraftReplyInput>();
  } catch {
    body = {};
  }
  return c.json(await draftWorkspaceReply(c.env, body));
});

workspaceRoutes.post("/reminders/suggest", async (c) => {
  let body: WorkspaceReminderInput = {};
  try {
    body = await c.req.json<WorkspaceReminderInput>();
  } catch {
    body = {};
  }
  return c.json(await suggestWorkspaceReminders(c.env, body));
});

workspaceRoutes.get("/reminders", async (c) => {
  const statusRaw = c.req.query("status")?.trim();
  const status =
    statusRaw === "completed" || statusRaw === "all" ? statusRaw : "open";
  const limit = Number(c.req.query("limit") ?? 50);
  const reminders = await listWorkspaceReminders(
    c.env,
    { teamId: c.get("teamId"), apiKeyHint: c.get("apiKeyHint") },
    { status, limit }
  );
  return c.json({ reminders, count: reminders.length });
});

workspaceRoutes.post("/reminders", async (c) => {
  const writeErr = scopeWriteDenied(c);
  if (writeErr) return writeErr;

  let body: WorkspaceReminderCreateInput = {};
  try {
    body = await c.req.json<WorkspaceReminderCreateInput>();
  } catch {
    body = {};
  }

  const result = await createWorkspaceReminder(
    c.env,
    { teamId: c.get("teamId"), apiKeyHint: c.get("apiKeyHint") },
    body
  );
  if (!result.ok) return c.json({ error: result.error }, result.status);
  return c.json(result.reminder, 201);
});

workspaceRoutes.patch("/reminders/:id/complete", async (c) => {
  const writeErr = scopeWriteDenied(c);
  if (writeErr) return writeErr;

  const result = await completeWorkspaceReminder(
    c.env,
    { teamId: c.get("teamId"), apiKeyHint: c.get("apiKeyHint") },
    c.req.param("id")
  );
  if (!result.ok) return c.json({ error: result.error }, result.status);
  return c.json(result.reminder);
});

workspaceRoutes.get("/actions", async (c) => {
  const actions = await listWorkspaceActions(
    c.env,
    { teamId: c.get("teamId"), apiKeyHint: c.get("apiKeyHint") },
    {
      reminderId: c.req.query("reminderId") ?? undefined,
      threadId: c.req.query("threadId") ?? undefined,
      limit: Number(c.req.query("limit") ?? 50),
    }
  );
  return c.json({ actions, count: actions.length });
});

workspaceRoutes.post("/actions", async (c) => {
  const writeErr = scopeWriteDenied(c);
  if (writeErr) return writeErr;

  let body: WorkspaceActionInput = {};
  try {
    body = await c.req.json<WorkspaceActionInput>();
  } catch {
    body = {};
  }

  const result = await logWorkspaceAction(
    c.env,
    { teamId: c.get("teamId"), apiKeyHint: c.get("apiKeyHint") },
    body
  );
  if (!result.ok) return c.json({ error: result.error }, result.status);
  return c.json(result.action, 201);
});
