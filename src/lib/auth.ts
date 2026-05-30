import type { Context, Next } from "hono";
import type { Env } from "../env";
import { isAuthorizedBearer } from "./api-keys";
import type { ApiVariables } from "./api-context";
import { apiKeyHintFromToken, bearerToken } from "./api-key-hint";

/** Bearer API_KEY или любой ключ из API_KEYS; кладёт apiKeyHint в context */
export async function requireApiKey(
  c: Context<{ Bindings: Env; Variables: ApiVariables }>,
  next: Next
) {
  const header = c.req.header("Authorization");
  if (!isAuthorizedBearer(c.env, header)) {
    return c.json({ error: "unauthorized" }, 401);
  }
  const token = bearerToken(header)!;
  c.set("apiKeyHint", await apiKeyHintFromToken(token));
  await next();
}
