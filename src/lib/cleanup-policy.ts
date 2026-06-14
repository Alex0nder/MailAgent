export type CleanupPolicyInput = {
  deleteAfter?: boolean;
  deleteAfterSuccess?: boolean;
  keepOnFailure?: boolean;
  deleteAfterMinutes?: number;
  ttlMinutes?: number;
};

export type CleanupPolicy = {
  deleteAfterSuccess: boolean;
  keepOnFailure: boolean;
  ttlMinutes?: number;
  deleteAfterMinutes?: number;
};

export function resolveCleanupPolicy(
  input: CleanupPolicyInput,
  defaults: { deleteAfterSuccess: boolean; keepOnFailure: boolean }
): CleanupPolicy {
  const deleteAfterSuccess =
    input.deleteAfterSuccess ??
    input.deleteAfter ??
    defaults.deleteAfterSuccess;
  const keepOnFailure =
    input.keepOnFailure ?? (input.deleteAfter === false ? true : defaults.keepOnFailure);
  const deleteAfterMinutes = normalizeMinutes(input.deleteAfterMinutes);
  const ttlMinutes = deleteAfterMinutes ?? normalizeMinutes(input.ttlMinutes);

  return {
    deleteAfterSuccess,
    keepOnFailure,
    ...(ttlMinutes !== undefined ? { ttlMinutes } : {}),
    ...(deleteAfterMinutes !== undefined ? { deleteAfterMinutes } : {}),
  };
}

function normalizeMinutes(value: number | undefined): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isFinite(value)) return undefined;
  return Math.min(1440, Math.max(1, Math.floor(value)));
}
