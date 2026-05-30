import { Hono } from "hono";
import { cors } from "hono/cors";
import { InboxWait } from "./durable-objects/inbox-wait";
import type { Env, EmailQueueMessage } from "./env";
import { handleQueueBatch } from "./queue/consumer";
import { apiMetaRoutes } from "./routes/api-meta";
import { openapiRoutes } from "./routes/openapi";
import { healthRoutes } from "./routes/health";
import { inboxRoutes } from "./routes/inboxes";
import { webhookRoutes } from "./routes/webhooks";
import { purgeExpired } from "./services/inbox";

export { InboxWait };

const app = new Hono<{ Bindings: Env }>();

app.use("*", cors());

app.route("/", healthRoutes);
app.route("/webhooks", webhookRoutes);
app.route("/v1", apiMetaRoutes);
app.route("/v1", openapiRoutes);
app.route("/v1/inboxes", inboxRoutes);

app.notFound((c) => c.json({ error: "not_found" }, 404));

/** API → Hono; остальное → статика public/; www → apex */
async function handleFetch(
  request: Request,
  env: Env,
  ctx: ExecutionContext
): Promise<Response> {
  const url = new URL(request.url);

  if (url.hostname === "www.webmailagent.com") {
    return Response.redirect(
      `https://webmailagent.com${url.pathname}${url.search}`,
      301
    );
  }

  const path = url.pathname;
  const isApi =
    path.startsWith("/v1") ||
    path.startsWith("/webhooks") ||
    path === "/health";

  if (isApi) {
    return app.fetch(request, env, ctx);
  }

  return env.ASSETS.fetch(request);
}

export default {
  fetch: handleFetch,

  async queue(
    batch: MessageBatch<EmailQueueMessage>,
    env: Env
  ): Promise<void> {
    await handleQueueBatch(batch, env);
  },

  async scheduled(_controller: ScheduledController, env: Env): Promise<void> {
    const result = await purgeExpired(env);
    console.log("cron purge", result);
  },
};
