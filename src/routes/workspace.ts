/** Workspace Agent API: safe mail/calendar assistant primitives. */
import { Hono } from "hono";
import type { Env } from "../env";
import type { ApiVariables } from "../lib/api-context";
import { requireApiKey } from "../lib/auth";
import { rateLimit } from "../lib/rate-limit";
import { configuredWorkspaceProvider } from "../services/llm-provider";
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
