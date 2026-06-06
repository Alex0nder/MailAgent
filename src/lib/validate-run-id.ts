/** runId validation for agent session memory */
const RUN_ID_RE = /^[a-zA-Z0-9._-]{1,128}$/;

export function validateRunId(runId: string): boolean {
  return RUN_ID_RE.test(runId.trim());
}

export function normalizeRunId(runId: string): string {
  return runId.trim();
}
