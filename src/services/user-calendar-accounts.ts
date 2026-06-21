/** Google Calendar OAuth accounts (read-only, P2). */
import { nanoid } from "nanoid";
import type { Env } from "../env";
import { getDb } from "../db/client";
import { decryptTeamSecret, encryptTeamSecret } from "../lib/team-secrets";
import type { WorkspaceReminderAuth } from "./workspace-reminders";
import { workspaceOwnerKey } from "./workspace-reminders";
import {
  gmailOAuthClient,
  gmailOAuthJwtSecret,
  isGmailOAuthConfigured,
  refreshGmailAccessToken,
} from "./user-mail-accounts";

export const CALENDAR_READONLY_SCOPE = "https://www.googleapis.com/auth/calendar.readonly";
export const CALENDAR_EVENTS_SCOPE = "https://www.googleapis.com/auth/calendar.events";
export const USERINFO_EMAIL_SCOPE = "https://www.googleapis.com/auth/userinfo.email";
/** OAuth connect: calendar + email (userinfo / account binding). */
export const CALENDAR_CONNECT_SCOPES = `${CALENDAR_READONLY_SCOPE} ${USERINFO_EMAIL_SCOPE}`;
export const CALENDAR_WRITE_SCOPES = `${CALENDAR_READONLY_SCOPE} ${CALENDAR_EVENTS_SCOPE}`;

export type UserCalendarAccount = {
  id: string;
  email: string;
  provider: "google_calendar";
  scopes: string[];
  connectedAt: string;
  lastSyncAt: string | null;
};

type AccountRow = {
  id: string;
  owner_key: string;
  team_id: string | null;
  api_key_hint: string;
  provider: string;
  email: string;
  refresh_token_cipher: string;
  scopes: string[];
  connected_at: string;
  last_sync_at: string | null;
  revoked_at: string | null;
};

function formatAccount(row: AccountRow): UserCalendarAccount {
  return {
    id: row.id,
    email: row.email,
    provider: "google_calendar",
    scopes: Array.isArray(row.scopes) ? row.scopes : [],
    connectedAt: row.connected_at,
    lastSyncAt: row.last_sync_at,
  };
}

function ownerKey(auth: WorkspaceReminderAuth): string {
  return workspaceOwnerKey(auth);
}

export function isCalendarOAuthConfigured(env: Env): boolean {
  return isGmailOAuthConfigured(env);
}

export function calendarOAuthJwtSecret(env: Env): string {
  return gmailOAuthJwtSecret(env);
}

export async function listUserCalendarAccounts(
  env: Env,
  auth: WorkspaceReminderAuth
): Promise<UserCalendarAccount[]> {
  const sql = getDb(env);
  const key = ownerKey(auth);
  const rows = (await sql`
    SELECT id, owner_key, team_id, api_key_hint, provider, email,
           refresh_token_cipher, scopes, connected_at, last_sync_at, revoked_at
    FROM user_mail_accounts
    WHERE owner_key = ${key} AND provider = 'google_calendar' AND revoked_at IS NULL
    ORDER BY connected_at DESC
  `) as AccountRow[];
  return rows.map(formatAccount);
}

export async function getUserCalendarAccount(
  env: Env,
  auth: WorkspaceReminderAuth,
  accountId: string
): Promise<(UserCalendarAccount & { refreshToken: string }) | null> {
  const sql = getDb(env);
  const key = ownerKey(auth);
  const rows = (await sql`
    SELECT id, owner_key, team_id, api_key_hint, provider, email,
           refresh_token_cipher, scopes, connected_at, last_sync_at, revoked_at
    FROM user_mail_accounts
    WHERE id = ${accountId} AND owner_key = ${key}
      AND provider = 'google_calendar' AND revoked_at IS NULL
    LIMIT 1
  `) as AccountRow[];
  const row = rows[0];
  if (!row) return null;
  const refreshToken = await decryptTeamSecret(env, row.refresh_token_cipher);
  if (!refreshToken) return null;
  return { ...formatAccount(row), refreshToken };
}

export async function upsertCalendarAccount(
  env: Env,
  auth: WorkspaceReminderAuth,
  input: { email: string; refreshToken: string; scopes: string[] }
): Promise<UserCalendarAccount> {
  const sql = getDb(env);
  const key = ownerKey(auth);
  const cipher = await encryptTeamSecret(env, input.refreshToken);
  const email = input.email.trim().toLowerCase();
  const scopes = input.scopes.length ? input.scopes : [CALENDAR_READONLY_SCOPE];

  const existing = (await sql`
    SELECT id FROM user_mail_accounts
    WHERE owner_key = ${key} AND provider = 'google_calendar' AND email = ${email}
      AND revoked_at IS NULL
    LIMIT 1
  `) as { id: string }[];

  if (existing[0]) {
    const rows = (await sql`
      UPDATE user_mail_accounts
      SET refresh_token_cipher = ${cipher},
          scopes = ${scopes},
          connected_at = NOW(),
          last_sync_at = NULL
      WHERE id = ${existing[0].id}
      RETURNING id, owner_key, team_id, api_key_hint, provider, email,
                refresh_token_cipher, scopes, connected_at, last_sync_at, revoked_at
    `) as AccountRow[];
    return formatAccount(rows[0]!);
  }

  const id = `uca_${nanoid(16)}`;
  const rows = (await sql`
    INSERT INTO user_mail_accounts (
      id, owner_key, team_id, api_key_hint, provider, email, refresh_token_cipher, scopes
    ) VALUES (
      ${id}, ${key}, ${auth.teamId}, ${auth.apiKeyHint}, 'google_calendar', ${email},
      ${cipher}, ${scopes}
    )
    RETURNING id, owner_key, team_id, api_key_hint, provider, email,
              refresh_token_cipher, scopes, connected_at, last_sync_at, revoked_at
  `) as AccountRow[];
  return formatAccount(rows[0]!);
}

export async function revokeUserCalendarAccount(
  env: Env,
  auth: WorkspaceReminderAuth,
  accountId: string
): Promise<boolean> {
  const sql = getDb(env);
  const key = ownerKey(auth);
  const rows = (await sql`
    UPDATE user_mail_accounts
    SET revoked_at = NOW()
    WHERE id = ${accountId} AND owner_key = ${key}
      AND provider = 'google_calendar' AND revoked_at IS NULL
    RETURNING id
  `) as { id: string }[];
  return Boolean(rows[0]);
}

export async function touchUserCalendarAccountSync(env: Env, accountId: string): Promise<void> {
  const sql = getDb(env);
  await sql`
    UPDATE user_mail_accounts SET last_sync_at = NOW() WHERE id = ${accountId}
  `;
}

export async function refreshCalendarAccessToken(
  env: Env,
  refreshToken: string
): Promise<{ accessToken: string; expiresIn: number } | { error: string }> {
  return refreshGmailAccessToken(env, refreshToken);
}

async function resolveCalendarAccountEmail(
  env: Env,
  accessToken: string,
  ownerKey?: string
): Promise<string | null> {
  const profileRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const profile = (await profileRes.json()) as { email?: string };
  if (profileRes.ok && profile.email?.trim()) {
    return profile.email.trim().toLowerCase();
  }

  const calRes = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const cal = (await calRes.json()) as { id?: string };
  if (calRes.ok && cal.id?.includes("@")) {
    return cal.id.trim().toLowerCase();
  }

  if (!ownerKey) return null;
  const sql = getDb(env);
  const rows = (await sql`
    SELECT email FROM user_mail_accounts
    WHERE owner_key = ${ownerKey} AND provider = 'gmail' AND revoked_at IS NULL
    ORDER BY connected_at DESC
    LIMIT 1
  `) as { email: string }[];
  return rows[0]?.email?.trim().toLowerCase() ?? null;
}

export async function exchangeCalendarOAuthCode(
  env: Env,
  code: string,
  redirectUri: string,
  ownerKey?: string
): Promise<
  | { email: string; refreshToken: string; scopes: string[] }
  | { error: string }
> {
  const client = gmailOAuthClient(env);
  if (!client) return { error: "calendar_oauth_not_configured" };

  const body = new URLSearchParams({
    code,
    client_id: client.clientId,
    client_secret: client.clientSecret,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  });

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  const tokenJson = (await tokenRes.json()) as {
    access_token?: string;
    refresh_token?: string;
    scope?: string;
    error?: string;
    error_description?: string;
  };

  if (!tokenRes.ok || !tokenJson.access_token) {
    return {
      error: tokenJson.error ?? tokenJson.error_description ?? "calendar_oauth_exchange_failed",
    };
  }

  const email = await resolveCalendarAccountEmail(env, tokenJson.access_token, ownerKey);
  if (!email) {
    return { error: "calendar_profile_failed" };
  }

  let refreshToken = tokenJson.refresh_token?.trim();
  if (!refreshToken && ownerKey) {
    const sql = getDb(env);
    const rows = (await sql`
      SELECT refresh_token_cipher FROM user_mail_accounts
      WHERE owner_key = ${ownerKey} AND provider = 'gmail' AND email = ${email}
        AND revoked_at IS NULL
      LIMIT 1
    `) as { refresh_token_cipher: string }[];
    if (rows[0]) {
      refreshToken = (await decryptTeamSecret(env, rows[0].refresh_token_cipher)) ?? undefined;
    }
  }

  if (!refreshToken) {
    return { error: "calendar_refresh_token_missing" };
  }

  const scopes = tokenJson.scope?.split(" ").filter(Boolean) ?? [CALENDAR_READONLY_SCOPE];
  return {
    email,
    refreshToken,
    scopes,
  };
}

export function buildCalendarAuthorizeUrl(
  env: Env,
  redirectUri: string,
  state: string
): string | null {
  const client = gmailOAuthClient(env);
  if (!client) return null;

  const q = new URLSearchParams({
    client_id: client.clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: CALENDAR_CONNECT_SCOPES,
    access_type: "offline",
    prompt: "consent",
    state,
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${q}`;
}

export function buildCalendarWriteAuthorizeUrl(
  env: Env,
  redirectUri: string,
  state: string
): string | null {
  const client = gmailOAuthClient(env);
  if (!client) return null;

  const q = new URLSearchParams({
    client_id: client.clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: CALENDAR_WRITE_SCOPES,
    access_type: "offline",
    prompt: "consent",
    state,
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${q}`;
}
