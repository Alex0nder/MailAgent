import { Hono } from "hono";
import type { Env } from "../env";
import type { ApiVariables } from "../lib/api-context";
import { requireApiKey } from "../lib/auth";
import { rateLimit } from "../lib/rate-limit";
import { parseCallbackUrl } from "../lib/callback-url";
import { resolveExpectFrom } from "../lib/service-presets";
import {
  createInbox,
  deleteInbox,
  getInbox,
  listInboxes,
  listMessages,
  type InboxRow,
} from "../services/inbox";
import { primaryLink } from "../services/extract";
import { waitForFirstMessage } from "../services/wait";

export const inboxRoutes = new Hono<{ Bindings: Env; Variables: ApiVariables }>();

inboxRoutes.use("*", requireApiKey);
inboxRoutes.use("*", rateLimit);

/** One-shot: create → wait → extract → delete (для агентов и CI) */
type CreateBody = {
  ttlMinutes?: number;
  service?: string;
  expectFrom?: string | string[];
  allowedSenders?: string | string[];
  label?: string;
  callbackUrl?: string;
  subjectContains?: string;
  timeoutSeconds?: number;
  deleteAfter?: boolean;
};

inboxRoutes.post("/open", async (c) => {
  let body: CreateBody = {};
  try {
    body = await c.req.json();
  } catch {
    body = {};
  }

  const opts = inboxOptionsFromBody(body);
  const clean = rejectInvalidCallback(opts);
  if ("error" in clean) return c.json(clean, 400);

  const inbox = await createInbox(c.env, {
    ...clean,
    apiKeyHint: c.get("apiKeyHint"),
  });
  const timeoutSec = Math.min(Number(body.timeoutSeconds ?? 90), 120);
  const message = await waitForFirstMessage(c.env, inbox.id, timeoutSec, {
    subjectContains: body.subjectContains,
  });

  if (!message) {
    if (body.deleteAfter !== false) {
      await deleteInbox(c.env, inbox.id);
    }
    return c.json(
      {
        error: "timeout",
        ...formatInbox(inbox),
        hint: "No matching email. Check webhook, expectFrom, subjectContains.",
      },
      408
    );
  }

  const verification = formatVerification(message);
  const deleted = body.deleteAfter !== false;
  if (deleted) await deleteInbox(c.env, inbox.id);

  return c.json(
    {
      ...formatInbox(inbox),
      inboxId: inbox.id,
      verification,
      deleted,
    },
    201
  );
});

/** QA: список inbox по label (например label=ci-run-42) */
inboxRoutes.get("/", async (c) => {
  const label = c.req.query("label");
  const limit = Number(c.req.query("limit") ?? "20");
  const rows = await listInboxes(c.env, {
    label,
    limit,
    apiKeyHint: c.get("apiKeyHint"),
  });
  return c.json({
    inboxes: rows.map((row) => ({
      ...formatInbox(row),
      id: row.id,
    })),
  });
});

inboxRoutes.post("/", async (c) => {
  let body: CreateBody = {};
  try {
    body = await c.req.json();
  } catch {
    body = {};
  }
  const opts = inboxOptionsFromBody(body);
  const clean = rejectInvalidCallback(opts);
  if ("error" in clean) return c.json(clean, 400);

  const inbox = await createInbox(c.env, {
    ...clean,
    apiKeyHint: c.get("apiKeyHint"),
  });
  return c.json({ id: inbox.id, ...formatInbox(inbox) }, 201);
});

inboxRoutes.get("/:id", async (c) => {
  const inbox = await getInbox(c.env, c.req.param("id"), {
    apiKeyHint: c.get("apiKeyHint"),
  });
  if (!inbox) return c.json({ error: "inbox_not_found" }, 404);
  const messages = await listMessages(c.env, inbox.id);
  return c.json({
    ...formatInbox(inbox),
    id: inbox.id,
    messageCount: messages.length,
  });
});

inboxRoutes.get("/:id/messages", async (c) => {
  const inbox = await getInbox(c.env, c.req.param("id"), {
    apiKeyHint: c.get("apiKeyHint"),
  });
  if (!inbox) return c.json({ error: "inbox_not_found" }, 404);
  const messages = await listMessages(c.env, inbox.id);
  return c.json({
    messages: messages.map(formatMessage),
  });
});

inboxRoutes.get("/:id/extract", async (c) => {
  const inbox = await getInbox(c.env, c.req.param("id"), {
    apiKeyHint: c.get("apiKeyHint"),
  });
  if (!inbox) return c.json({ error: "inbox_not_found" }, 404);
  const messages = await listMessages(c.env, inbox.id);
  const latest = messages[0];
  if (!latest) return c.json({ error: "no_messages" }, 404);
  return c.json(formatVerification(latest));
});

/** SSE: ждём первое письмо (надёжнее long-poll 120s на Workers) */
inboxRoutes.get("/:id/events", async (c) => {
  const inbox = await getInbox(c.env, c.req.param("id"), {
    apiKeyHint: c.get("apiKeyHint"),
  });
  if (!inbox) return c.json({ error: "inbox_not_found" }, 404);

  const id = c.env.INBOX_WAIT.idFromName(inbox.id);
  const stub = c.env.INBOX_WAIT.get(id);
  return stub.fetch("http://do/subscribe", { method: "GET" });
});

/** Fallback poll: ?timeout=60, interval 2s */
inboxRoutes.get("/:id/wait", async (c) => {
  const inbox = await getInbox(c.env, c.req.param("id"), {
    apiKeyHint: c.get("apiKeyHint"),
  });
  if (!inbox) return c.json({ error: "inbox_not_found" }, 404);

  const timeoutSec = Math.min(Number(c.req.query("timeout") ?? 60), 120);
  const subjectContains = c.req.query("subjectContains") ?? undefined;
  const message = await waitForFirstMessage(c.env, inbox.id, timeoutSec, {
    subjectContains,
  });
  if (!message) return c.json({ error: "timeout" }, 408);
  return c.json({ message: formatMessage(message) });
});

inboxRoutes.delete("/:id", async (c) => {
  const ok = await deleteInbox(c.env, c.req.param("id"), {
    apiKeyHint: c.get("apiKeyHint"),
  });
  if (!ok) return c.json({ error: "inbox_not_found" }, 404);
  return c.json({ deleted: true });
});

function formatMessage(m: {
  id: string;
  from_addr: string;
  subject: string;
  text_preview: string | null;
  otp: string | null;
  links_json: unknown;
  received_at: string;
}) {
  const links = parseLinks(m.links_json);
  return {
    id: m.id,
    from: m.from_addr,
    subject: m.subject,
    textPreview: m.text_preview,
    otp: m.otp,
    links,
    primaryLink: primaryLink(links),
    receivedAt: m.received_at,
  };
}

function formatVerification(m: {
  id: string;
  from_addr: string;
  subject: string;
  otp: string | null;
  links_json: unknown;
}) {
  const links = parseLinks(m.links_json);
  return {
    otp: m.otp,
    links,
    primaryLink: primaryLink(links),
    from: m.from_addr,
    subject: m.subject,
    messageId: m.id,
  };
}

function inboxOptionsFromBody(body: CreateBody) {
  const expectFrom = resolveExpectFrom(body.service, body.expectFrom);
  const callbackUrl = parseCallbackUrl(body.callbackUrl);
  return {
    ttlMinutes: body.ttlMinutes,
    expectFrom,
    allowedSenders: body.allowedSenders,
    label: body.label,
    callbackUrl,
    callbackInvalid: Boolean(body.callbackUrl && !callbackUrl),
  };
}

function rejectInvalidCallback(
  opts: ReturnType<typeof inboxOptionsFromBody>
) {
  if (opts.callbackInvalid) {
    return { error: "invalid_callback_url" as const };
  }
  const { callbackInvalid: _, ...rest } = opts;
  return rest;
}

function formatInbox(inbox: InboxRow) {
  return {
    address: inbox.address,
    expiresAt: inbox.expires_at,
    createdAt: inbox.created_at,
    allowedSenders: inbox.allowed_senders,
    label: inbox.label,
    callbackUrl: inbox.callback_url,
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
