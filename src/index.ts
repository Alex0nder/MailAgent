import { Hono } from "hono";
import { cors } from "hono/cors";
import { InboxWait } from "./durable-objects/inbox-wait";
import type { Env, EmailQueueMessage } from "./env";
import { handleQueueBatch } from "./queue/consumer";
import { apiMetaRoutes } from "./routes/api-meta";
import { openapiRoutes } from "./routes/openapi";
import { healthRoutes } from "./routes/health";
import { inboxRoutes } from "./routes/inboxes";
import { statsRoutes } from "./routes/stats";
import { meRoutes } from "./routes/me";
import { billingRoutes } from "./routes/billing";
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
app.route("/v1/stats", statsRoutes);
app.route("/v1/me", meRoutes);
app.route("/v1/billing", billingRoutes);

app.notFound((c) => c.json({ error: "not_found" }, 404));

/** Cloudflare отдаёт http:// без редиректа, если не включён Always Use HTTPS */
function isInsecureRequest(request: Request): boolean {
  const proto = request.headers.get("X-Forwarded-Proto");
  if (proto === "http") return true;
  const visitor = request.headers.get("CF-Visitor");
  if (visitor) {
    try {
      const parsed = JSON.parse(visitor) as { scheme?: string };
      return parsed.scheme === "http";
    } catch {
      /* ignore malformed header */
    }
  }
  return new URL(request.url).protocol === "http:";
}

const HTTPS_HOSTS = new Set([
  "webmailagent.com",
  "www.webmailagent.com",
  "api.webmailagent.com",
]);

/** API → Hono; остальное → статика public/; www → apex; http → https */
async function handleFetch(
  request: Request,
  env: Env,
  ctx: ExecutionContext
): Promise<Response> {
  const url = new URL(request.url);

  if (isInsecureRequest(request) && HTTPS_HOSTS.has(url.hostname)) {
    const host =
      url.hostname === "www.webmailagent.com" ? "webmailagent.com" : url.hostname;
    return Response.redirect(
      `https://${host}${url.pathname}${url.search}`,
      301
    );
  }

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
