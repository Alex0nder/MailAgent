/** Audit log API — team / key scoped */
import { Hono } from "hono";
import type { Env } from "../env";
import type { ApiVariables } from "../lib/api-context";
import { requireApiKey } from "../lib/auth";
import { rateLimit } from "../lib/rate-limit";
import { listAuditEvents } from "../services/audit-log";

export const auditRoutes = new Hono<{ Bindings: Env; Variables: ApiVariables }>();

auditRoutes.use("*", requireApiKey);
auditRoutes.use("*", rateLimit);

auditRoutes.get("/", async (c) => {
  const limit = Math.min(Number(c.req.query("limit") ?? 50), 100);
  const events = await listAuditEvents(
    c.env,
    { teamId: c.get("teamId"), apiKeyHint: c.get("apiKeyHint") },
    { limit }
  );
  return c.json({ events, count: events.length });
});
