/** Ограничения scoped API key (label prefix, read-only) */
import type { InboxRow } from "../services/inbox";

export type ApiKeyScope = {
  labelPrefix: string | null;
  readOnly: boolean;
};

export const FULL_ACCESS_SCOPE: ApiKeyScope = {
  labelPrefix: null,
  readOnly: false,
};

export function scopeFromDb(row: {
  scope_label_prefix?: string | null;
  scope_read_only?: boolean | null;
}): ApiKeyScope {
  const prefix = row.scope_label_prefix?.trim().slice(0, 64) || null;
  return {
    labelPrefix: prefix,
    readOnly: Boolean(row.scope_read_only),
  };
}

export function isRestrictedScope(scope: ApiKeyScope): boolean {
  return scope.readOnly || Boolean(scope.labelPrefix);
}

/** Подмножество scope для нового ключа (team admin → sub-key) */
export function narrowScope(
  parent: ApiKeyScope,
  child: { labelPrefix?: string | null; readOnly?: boolean }
): { scope: ApiKeyScope } | { error: string; hint?: string } {
  const labelPrefix = child.labelPrefix?.trim().slice(0, 64) || null;
  const readOnly = child.readOnly ?? false;

  if (parent.readOnly) {
    return { error: "parent_key_read_only" };
  }
  if (parent.labelPrefix) {
    if (!labelPrefix || !labelPrefix.startsWith(parent.labelPrefix)) {
      return {
        error: "child_label_prefix_must_extend_parent",
        hint: `prefix must start with ${parent.labelPrefix}`,
      };
    }
  }

  return { scope: { labelPrefix, readOnly } };
}

export function assertWriteAllowed(scope: ApiKeyScope): { ok: true } | { ok: false; error: string } {
  if (scope.readOnly) return { ok: false, error: "scope_read_only" };
  return { ok: true };
}

export function assertLabelForCreate(
  scope: ApiKeyScope,
  label: string | undefined | null
): { ok: true; label: string | null } | { ok: false; error: string; hint?: string } {
  const trimmed = label?.trim().slice(0, 128) || null;
  if (!scope.labelPrefix) {
    return { ok: true, label: trimmed };
  }
  if (!trimmed) {
    return {
      ok: false,
      error: "label_required",
      hint: `Scoped key requires label starting with ${scope.labelPrefix}`,
    };
  }
  if (!trimmed.startsWith(scope.labelPrefix)) {
    return {
      ok: false,
      error: "label_prefix_mismatch",
      hint: `Label must start with ${scope.labelPrefix}`,
    };
  }
  return { ok: true, label: trimmed };
}

export function assertInboxAccessible(
  scope: ApiKeyScope,
  inbox: Pick<InboxRow, "label">
): { ok: true } | { ok: false; error: string } {
  if (!scope.labelPrefix) return { ok: true };
  const label = inbox.label ?? "";
  if (!label.startsWith(scope.labelPrefix)) {
    return { ok: false, error: "inbox_not_found" };
  }
  return { ok: true };
}

/** GET list: scoped key не может запросить чужой prefix */
export function effectiveLabelPrefix(
  scope: ApiKeyScope,
  requested?: string | null
): string | undefined {
  const req = requested?.trim().slice(0, 64);
  if (scope.labelPrefix) {
    if (req && !req.startsWith(scope.labelPrefix)) {
      return scope.labelPrefix;
    }
    return req || scope.labelPrefix;
  }
  return req;
}

export function parseScopeBody(body: {
  scope?: { labelPrefix?: string; readOnly?: boolean };
  labelPrefix?: string;
  readOnly?: boolean;
}): { labelPrefix?: string | null; readOnly?: boolean } {
  const nested = body.scope ?? {};
  return {
    labelPrefix: nested.labelPrefix ?? body.labelPrefix,
    readOnly: nested.readOnly ?? body.readOnly,
  };
}
