/** HTTP helpers: проверка scoped key в routes */
import type { Context } from "hono";
import type { Env } from "../env";
import type { ApiVariables } from "./api-context";
import type { InboxRow } from "../services/inbox";
import {
  assertInboxAccessible,
  assertLabelForCreate,
  assertWriteAllowed,
  effectiveLabelPrefix,
  isRestrictedScope,
} from "./key-scope";

type C = Context<{ Bindings: Env; Variables: ApiVariables }>;

export function getScope(c: C) {
  return c.get("apiKeyScope");
}

export function scopeWriteDenied(c: C): Response | null {
  const check = assertWriteAllowed(getScope(c));
  if (!check.ok) {
    return c.json({ error: check.error }, 403);
  }
  return null;
}

export function scopeAdminDenied(c: C): Response | null {
  if (isRestrictedScope(getScope(c))) {
    return c.json({ error: "scope_admin_required", hint: "Use an unrestricted team key" }, 403);
  }
  return null;
}

export function scopeLabelForCreate(
  c: C,
  label: string | undefined | null
): { label: string | null } | Response {
  const check = assertLabelForCreate(getScope(c), label);
  if (!check.ok) {
    return c.json({ error: check.error, hint: check.hint }, 403);
  }
  return { label: check.label };
}

export function scopeInboxDenied(c: C, inbox: InboxRow | null): Response | null {
  if (!inbox) return c.json({ error: "inbox_not_found" }, 404);
  const check = assertInboxAccessible(getScope(c), inbox);
  if (!check.ok) {
    return c.json({ error: check.error }, 404);
  }
  return null;
}

export function scopeListPrefix(c: C, requested?: string | null): string | undefined {
  return effectiveLabelPrefix(getScope(c), requested);
}
