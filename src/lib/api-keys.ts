/** Проверка Bearer: один API_KEY или список API_KEYS через запятую */
import type { Env } from "../env";

export function allowedApiKeys(env: Env): string[] {
  const multi = env.API_KEYS?.trim();
  if (multi) {
    return multi
      .split(",")
      .map((k) => k.trim())
      .filter(Boolean);
  }
  if (env.API_KEY?.trim()) return [env.API_KEY.trim()];
  return [];
}

import { bearerToken } from "./api-key-hint";

export function isAuthorizedBearer(env: Env, header: string | undefined): boolean {
  const token = bearerToken(header);
  if (!token) return false;
  const keys = allowedApiKeys(env);
  return keys.length > 0 && keys.includes(token);
}
