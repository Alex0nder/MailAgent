import { Hono } from "hono";
import type { Env } from "../env";
import { getDb } from "../db/client";

export const healthRoutes = new Hono<{ Bindings: Env }>();

healthRoutes.get("/health", async (c) => {
  try {
    const sql = getDb(c.env);
    await sql`SELECT 1`;
    return c.json({ status: "ok", db: true });
  } catch (e) {
    return c.json(
      { status: "degraded", db: false, error: String(e) },
      503
    );
  }
});
