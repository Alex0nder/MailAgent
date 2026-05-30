import { Hono } from "hono";
import { Resend } from "resend";
import type { Env, EmailQueueMessage } from "../env";

export const webhookRoutes = new Hono<{ Bindings: Env }>();

/** Resend webhook: verify → enqueue → быстрый 200 */
webhookRoutes.post("/resend", async (c) => {
  const payload = await c.req.text();
  const resend = new Resend(c.env.RESEND_API_KEY);

  let event: { type: string; data: unknown };
  try {
    event = resend.webhooks.verify({
      payload,
      headers: {
        id: c.req.header("svix-id") ?? "",
        timestamp: c.req.header("svix-timestamp") ?? "",
        signature: c.req.header("svix-signature") ?? "",
      },
      webhookSecret: c.env.RESEND_WEBHOOK_SECRET,
    }) as { type: string; data: unknown };
  } catch {
    return c.json({ error: "invalid_signature" }, 401);
  }

  if (event.type !== "email.received") {
    return c.json({ ok: true, skipped: event.type });
  }

  const data = event.data as {
    email_id: string;
    from: string;
    to: string[];
    subject?: string;
  };

  const job: EmailQueueMessage = {
    provider: "resend",
    emailId: data.email_id,
    from: data.from,
    to: data.to ?? [],
    subject: data.subject ?? "",
    receivedAt: new Date().toISOString(),
  };

  await c.env.MAIL_QUEUE.send(job);
  return c.json({ ok: true, queued: true });
});
