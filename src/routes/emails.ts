/** POST /v1/emails/check — syntax, disposable, role, MX (self-contained) */
import { Hono } from "hono";
import type { Env } from "../env";
import type { ApiVariables } from "../lib/api-context";
import { requireApiKey } from "../lib/auth";
import { rateLimit } from "../lib/rate-limit";
import { checkEmailAddress } from "../services/email-check";

export const emailRoutes = new Hono<{ Bindings: Env; Variables: ApiVariables }>();

emailRoutes.use("*", requireApiKey);
emailRoutes.use("*", rateLimit);

emailRoutes.post("/check", async (c) => {
  let body: { email?: string } = {};
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }

  const result = await checkEmailAddress(c.env, {
    email: body.email ?? "",
  });

  if ("error" in result) {
    return c.json({ error: "invalid_email" }, 400);
  }

  return c.json(result);
});
