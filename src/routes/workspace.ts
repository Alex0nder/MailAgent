/** Workspace Agent API: safe mail/calendar assistant primitives. */
import { Hono } from "hono";
import type { Env } from "../env";
import type { ApiVariables } from "../lib/api-context";
import { requireApiKey } from "../lib/auth";
import { rateLimit } from "../lib/rate-limit";
import { scopeWriteDenied } from "../lib/scope-guard";
import { configuredWorkspaceProvider } from "../services/llm-provider";
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
  const provider = configuredWorkspaceProvider(c.env);
  return c.json({
    name: "MailAgent Workspace Agent",
    status: "preview",
    safety: {
      defaultMode: "read_only_and_draft_only",
      sendAllowed: false,
      calendarWriteAllowed: false,
      redaction: "enabled",
    },
    model: {
      provider: provider.provider,
      model: provider.model,
      configured: Boolean(provider.apiKey && provider.baseUrl),
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
    },
    roadmap: "https://github.com/Alex0nder/MailAgent/blob/main/docs/WORKSPACE-AGENT-PBR.md",
  });
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
