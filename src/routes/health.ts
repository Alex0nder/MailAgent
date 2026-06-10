import { Hono } from "hono";
import type { Env } from "../env";
import { getDb } from "../db/client";
import { MCP_SERVER_INFO } from "../mcp/manifest";

export const healthRoutes = new Hono<{ Bindings: Env }>();

healthRoutes.get("/health", async (c) => {
  try {
    const sql = getDb(c.env);
    await sql`SELECT 1`;
    return c.json({
      status: "ok",
      db: true,
      version: MCP_SERVER_INFO.version,
      webhook: "/webhooks/resend",
    });
  } catch (e) {
    return c.json(
      { status: "degraded", db: false, error: String(e) },
      503
    );
  }
});
