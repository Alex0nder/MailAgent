import { neon } from "@neondatabase/serverless";
import type { Env } from "../env";

export function getDb(env: Env) {
  return neon(env.DATABASE_URL);
}
