import type { Context } from "hono";
import type { Env } from "../env";

/** Bearer API_KEY для всех /v1/* маршрутов */
export async function requireApiKey(
  c: Context<{ Bindings: Env }>,
  next: () => Promise<void>
) {
  const header = c.req.header("Authorization");
  const expected = `Bearer ${c.env.API_KEY}`;
  if (!header || header !== expected) {
    return c.json({ error: "unauthorized" }, 401);
  }
  await next();
}
