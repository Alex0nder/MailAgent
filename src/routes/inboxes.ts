import { Hono } from "hono";
import type { Env } from "../env";
import { requireApiKey } from "../lib/auth";
import { resolveExpectFrom } from "../lib/service-presets";
import {
  createInbox,
  deleteInbox,
  getInbox,
  listMessages,
} from "../services/inbox";
import { waitForFirstMessage } from "../services/wait";

export const inboxRoutes = new Hono<{ Bindings: Env }>();

inboxRoutes.use("*", requireApiKey);

/** One-shot: create → wait → extract → delete (для агентов и CI) */
inboxRoutes.post("/open", async (c) => {
  let body: {
    ttlMinutes?: number;
    service?: string;
    expectFrom?: string | string[];
    allowedSenders?: string | string[];
    timeoutSeconds?: number;
    deleteAfter?: boolean;
  } = {};
  try {
    body = await c.req.json();
  } catch {
    body = {};
  }

  const expectFrom = resolveExpectFrom(body.service, body.expectFrom);
  const inbox = await createInbox(c.env, {
    ttlMinutes: body.ttlMinutes,
    expectFrom,
    allowedSenders: body.allowedSenders,
  });

  const timeoutSec = Math.min(Number(body.timeoutSeconds ?? 90), 120);
  const message = await waitForFirstMessage(c.env, inbox.id, timeoutSec);

  if (!message) {
    if (body.deleteAfter !== false) {
      await deleteInbox(c.env, inbox.id);
    }
    return c.json(
      {
        error: "timeout",
        inboxId: inbox.id,
        address: inbox.address,
        allowedSenders: inbox.allowed_senders,
        hint: "No email yet. Check Resend inbound, webhook, and expectFrom.",
      },
      408
    );
  }

  const verification = formatVerification(message);
  const deleted = body.deleteAfter !== false;
  if (deleted) await deleteInbox(c.env, inbox.id);

  return c.json(
    {
      inboxId: inbox.id,
      address: inbox.address,
      allowedSenders: inbox.allowed_senders,
      verification,
      deleted,
    },
    201
  );
});

inboxRoutes.post("/", async (c) => {
  let body: {
    ttlMinutes?: number;
    service?: string;
    expectFrom?: string | string[];
    allowedSenders?: string | string[];
  } = {};
  try {
    body = await c.req.json();
  } catch {
    body = {};
  }
  const expectFrom = resolveExpectFrom(body.service, body.expectFrom);
  const inbox = await createInbox(c.env, {
    ttlMinutes: body.ttlMinutes,
    expectFrom,
    allowedSenders: body.allowedSenders,
  });
  return c.json({
    id: inbox.id,
    address: inbox.address,
    expiresAt: inbox.expires_at,
    createdAt: inbox.created_at,
    allowedSenders: inbox.allowed_senders,
  }, 201);
});

inboxRoutes.get("/:id", async (c) => {
  const inbox = await getInbox(c.env, c.req.param("id"));
  if (!inbox) return c.json({ error: "inbox_not_found" }, 404);
  const messages = await listMessages(c.env, inbox.id);
  return c.json({
    id: inbox.id,
    address: inbox.address,
    expiresAt: inbox.expires_at,
    allowedSenders: inbox.allowed_senders,
    messageCount: messages.length,
  });
});

inboxRoutes.get("/:id/messages", async (c) => {
  const inbox = await getInbox(c.env, c.req.param("id"));
  if (!inbox) return c.json({ error: "inbox_not_found" }, 404);
  const messages = await listMessages(c.env, inbox.id);
  return c.json({
    messages: messages.map(formatMessage),
  });
});

inboxRoutes.get("/:id/extract", async (c) => {
  const inbox = await getInbox(c.env, c.req.param("id"));
  if (!inbox) return c.json({ error: "inbox_not_found" }, 404);
  const messages = await listMessages(c.env, inbox.id);
  const latest = messages[0];
  if (!latest) return c.json({ error: "no_messages" }, 404);
  return c.json(formatVerification(latest));
});

/** SSE: ждём первое письмо (надёжнее long-poll 120s на Workers) */
inboxRoutes.get("/:id/events", async (c) => {
  const inbox = await getInbox(c.env, c.req.param("id"));
  if (!inbox) return c.json({ error: "inbox_not_found" }, 404);

  const id = c.env.INBOX_WAIT.idFromName(inbox.id);
  const stub = c.env.INBOX_WAIT.get(id);
  return stub.fetch("http://do/subscribe", { method: "GET" });
});

/** Fallback poll: ?timeout=60, interval 2s */
inboxRoutes.get("/:id/wait", async (c) => {
  const inbox = await getInbox(c.env, c.req.param("id"));
  if (!inbox) return c.json({ error: "inbox_not_found" }, 404);

  const timeoutSec = Math.min(Number(c.req.query("timeout") ?? 60), 120);
  const message = await waitForFirstMessage(c.env, inbox.id, timeoutSec);
  if (!message) return c.json({ error: "timeout" }, 408);
  return c.json({ message: formatMessage(message) });
});

inboxRoutes.delete("/:id", async (c) => {
  const ok = await deleteInbox(c.env, c.req.param("id"));
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
  return {
    id: m.id,
    from: m.from_addr,
    subject: m.subject,
    textPreview: m.text_preview,
    otp: m.otp,
    links: parseLinks(m.links_json),
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
  return {
    otp: m.otp,
    links: parseLinks(m.links_json),
    from: m.from_addr,
    subject: m.subject,
    messageId: m.id,
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
