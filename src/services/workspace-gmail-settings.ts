/** Per-team Gmail read retention and scan limits (P1.11). */
import type { Env } from "../env";
import { getDb } from "../db/client";
import { type WorkspaceReminderAuth, workspaceOwnerKey } from "./workspace-reminders";

export type WorkspaceGmailSettings = {
  threadLookbackDays: number;
  maxThreadsPerScan: number;
  digestMaxThreads: number;
  persisted: boolean;
  createdAt: string | null;
  updatedAt: string | null;
};

export type WorkspaceGmailSettingsInput = {
  threadLookbackDays?: number;
  maxThreadsPerScan?: number;
  digestMaxThreads?: number;
};

type SettingsRow = {
  thread_lookback_days: number;
  max_threads_per_scan: number;
  digest_max_threads: number;
  created_at: string;
  updated_at: string;
};

const DEFAULTS = {
  threadLookbackDays: 7,
  maxThreadsPerScan: 25,
  digestMaxThreads: 15,
} as const;

const LIMITS = {
  threadLookbackDays: { min: 1, max: 90 },
  maxThreadsPerScan: { min: 5, max: 50 },
  digestMaxThreads: { min: 5, max: 30 },
} as const;

function defaultSettings(): WorkspaceGmailSettings {
  return {
    ...DEFAULTS,
    persisted: false,
    createdAt: null,
    updatedAt: null,
  };
}

function formatSettings(row: SettingsRow): WorkspaceGmailSettings {
  return {
    threadLookbackDays: row.thread_lookback_days,
    maxThreadsPerScan: row.max_threads_per_scan,
    digestMaxThreads: row.digest_max_threads,
    persisted: true,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function clampInt(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

export function gmailRetentionQuery(settings: WorkspaceGmailSettings): string {
  return `newer_than:${settings.threadLookbackDays}d`;
}

export async function getWorkspaceGmailSettings(
  env: Env,
  auth: WorkspaceReminderAuth
): Promise<WorkspaceGmailSettings> {
  const sql = getDb(env);
  const rows = (await sql`
    SELECT thread_lookback_days, max_threads_per_scan, digest_max_threads,
           created_at, updated_at
    FROM workspace_gmail_settings
    WHERE owner_key = ${workspaceOwnerKey(auth)}
    LIMIT 1
  `) as SettingsRow[];
  return rows[0] ? formatSettings(rows[0]) : defaultSettings();
}

export async function setWorkspaceGmailSettings(
  env: Env,
  auth: WorkspaceReminderAuth,
  input: WorkspaceGmailSettingsInput
): Promise<
  | { ok: true; settings: WorkspaceGmailSettings }
  | {
      ok: false;
      status: 400;
      error:
        | "invalid_thread_lookback_days"
        | "invalid_max_threads_per_scan"
        | "invalid_digest_max_threads";
    }
> {
  const current = await getWorkspaceGmailSettings(env, auth);
  const threadLookbackDays = clampInt(
    Number(input.threadLookbackDays ?? current.threadLookbackDays),
    LIMITS.threadLookbackDays.min,
    LIMITS.threadLookbackDays.max
  );
  const maxThreadsPerScan = clampInt(
    Number(input.maxThreadsPerScan ?? current.maxThreadsPerScan),
    LIMITS.maxThreadsPerScan.min,
    LIMITS.maxThreadsPerScan.max
  );
  const digestMaxThreads = clampInt(
    Number(input.digestMaxThreads ?? current.digestMaxThreads),
    LIMITS.digestMaxThreads.min,
    LIMITS.digestMaxThreads.max
  );

  if (!Number.isFinite(threadLookbackDays)) {
    return { ok: false, status: 400, error: "invalid_thread_lookback_days" };
  }
  if (!Number.isFinite(maxThreadsPerScan)) {
    return { ok: false, status: 400, error: "invalid_max_threads_per_scan" };
  }
  if (!Number.isFinite(digestMaxThreads)) {
    return { ok: false, status: 400, error: "invalid_digest_max_threads" };
  }
  if (digestMaxThreads > maxThreadsPerScan) {
    return { ok: false, status: 400, error: "invalid_digest_max_threads" };
  }

  const sql = getDb(env);
  const rows = (await sql`
    INSERT INTO workspace_gmail_settings (
      owner_key, team_id, api_key_hint,
      thread_lookback_days, max_threads_per_scan, digest_max_threads
    )
    VALUES (
      ${workspaceOwnerKey(auth)}, ${auth.teamId}, ${auth.apiKeyHint},
      ${threadLookbackDays}, ${maxThreadsPerScan}, ${digestMaxThreads}
    )
    ON CONFLICT (owner_key) DO UPDATE SET
      team_id = EXCLUDED.team_id,
      api_key_hint = EXCLUDED.api_key_hint,
      thread_lookback_days = EXCLUDED.thread_lookback_days,
      max_threads_per_scan = EXCLUDED.max_threads_per_scan,
      digest_max_threads = EXCLUDED.digest_max_threads,
      updated_at = NOW()
    RETURNING thread_lookback_days, max_threads_per_scan, digest_max_threads,
              created_at, updated_at
  `) as SettingsRow[];

  return { ok: true, settings: formatSettings(rows[0]!) };
}
