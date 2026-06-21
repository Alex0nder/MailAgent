/** Persist encrypted Gmail OAuth refresh tokens per team/API key owner. */
import { nanoid } from "nanoid";
import type { Env } from "../env";
import { getDb } from "../db/client";
import { decryptTeamSecret, encryptTeamSecret } from "../lib/team-secrets";
import type { WorkspaceReminderAuth } from "./workspace-reminders";
import { workspaceOwnerKey } from "./workspace-reminders";

export const GMAIL_READONLY_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
export const GMAIL_COMPOSE_SCOPE = "https://www.googleapis.com/auth/gmail.compose";
export const GMAIL_WRITE_SCOPES = `${GMAIL_READONLY_SCOPE} ${GMAIL_COMPOSE_SCOPE}`;

export type UserMailAccount = {
  id: string;
  email: string;
  provider: "gmail";
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

function formatAccount(row: AccountRow): UserMailAccount {
  return {
    id: row.id,
    email: row.email,
    provider: "gmail",
    scopes: Array.isArray(row.scopes) ? row.scopes : [],
    connectedAt: row.connected_at,
    lastSyncAt: row.last_sync_at,
  };
}

function ownerKey(auth: WorkspaceReminderAuth): string {
  return workspaceOwnerKey(auth);
}

export function isGmailOAuthConfigured(env: Env): boolean {
  const clientId = env.GOOGLE_CLIENT_ID?.trim() || env.GMAIL_CLIENT_ID?.trim();
  const clientSecret =
    env.GOOGLE_CLIENT_SECRET?.trim() || env.GMAIL_CLIENT_SECRET?.trim();
  return Boolean(clientId && clientSecret);
}

export function gmailOAuthClient(env: Env): { clientId: string; clientSecret: string } | null {
  const clientId = env.GOOGLE_CLIENT_ID?.trim() || env.GMAIL_CLIENT_ID?.trim();
  const clientSecret =
    env.GOOGLE_CLIENT_SECRET?.trim() || env.GMAIL_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

export function gmailOAuthJwtSecret(env: Env): string {
  return env.MCP_OAUTH_JWT_SECRET?.trim() || env.API_KEY?.trim() || "mailagent-dev-only";
}

export async function listUserMailAccounts(
  env: Env,
  auth: WorkspaceReminderAuth
): Promise<UserMailAccount[]> {
  const sql = getDb(env);
  const key = ownerKey(auth);
  const rows = (await sql`
    SELECT id, owner_key, team_id, api_key_hint, provider, email,
           refresh_token_cipher, scopes, connected_at, last_sync_at, revoked_at
    FROM user_mail_accounts
    WHERE owner_key = ${key} AND provider = 'gmail' AND revoked_at IS NULL
    ORDER BY connected_at DESC
  `) as AccountRow[];
  return rows.map(formatAccount);
}

export async function getUserMailAccount(
  env: Env,
  auth: WorkspaceReminderAuth,
  accountId: string
): Promise<(UserMailAccount & { refreshToken: string }) | null> {
  const sql = getDb(env);
  const key = ownerKey(auth);
  const rows = (await sql`
    SELECT id, owner_key, team_id, api_key_hint, provider, email,
           refresh_token_cipher, scopes, connected_at, last_sync_at, revoked_at
    FROM user_mail_accounts
    WHERE id = ${accountId} AND owner_key = ${key} AND provider = 'gmail' AND revoked_at IS NULL
    LIMIT 1
  `) as AccountRow[];
  const row = rows[0];
  if (!row) return null;
  const refreshToken = await decryptTeamSecret(env, row.refresh_token_cipher);
  if (!refreshToken) return null;
  return { ...formatAccount(row), refreshToken };
}

export async function upsertGmailAccount(
  env: Env,
  auth: WorkspaceReminderAuth,
  input: { email: string; refreshToken: string; scopes: string[] }
): Promise<UserMailAccount> {
  const sql = getDb(env);
  const key = ownerKey(auth);
  const cipher = await encryptTeamSecret(env, input.refreshToken);
  const email = input.email.trim().toLowerCase();
  const scopes = input.scopes.length ? input.scopes : [GMAIL_READONLY_SCOPE];

  const existing = (await sql`
    SELECT id FROM user_mail_accounts
    WHERE owner_key = ${key} AND provider = 'gmail' AND email = ${email} AND revoked_at IS NULL
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

  const id = `uma_${nanoid(16)}`;
  const rows = (await sql`
    INSERT INTO user_mail_accounts (
      id, owner_key, team_id, api_key_hint, provider, email, refresh_token_cipher, scopes
    ) VALUES (
      ${id}, ${key}, ${auth.teamId}, ${auth.apiKeyHint}, 'gmail', ${email}, ${cipher}, ${scopes}
    )
    RETURNING id, owner_key, team_id, api_key_hint, provider, email,
              refresh_token_cipher, scopes, connected_at, last_sync_at, revoked_at
  `) as AccountRow[];
  return formatAccount(rows[0]!);
}

export async function revokeUserMailAccount(
  env: Env,
  auth: WorkspaceReminderAuth,
  accountId: string
): Promise<boolean> {
  const sql = getDb(env);
  const key = ownerKey(auth);
  const rows = (await sql`
    UPDATE user_mail_accounts
    SET revoked_at = NOW()
    WHERE id = ${accountId} AND owner_key = ${key} AND revoked_at IS NULL
    RETURNING id
  `) as { id: string }[];
  return Boolean(rows[0]);
}

export async function touchUserMailAccountSync(env: Env, accountId: string): Promise<void> {
  const sql = getDb(env);
  await sql`
    UPDATE user_mail_accounts SET last_sync_at = NOW() WHERE id = ${accountId}
  `;
}

export async function refreshGmailAccessToken(
  env: Env,
  refreshToken: string
): Promise<{ accessToken: string; expiresIn: number } | { error: string }> {
  const client = gmailOAuthClient(env);
  if (!client) return { error: "gmail_oauth_not_configured" };

  const body = new URLSearchParams({
    client_id: client.clientId,
    client_secret: client.clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  const json = (await res.json()) as {
    access_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  };

  if (!res.ok || !json.access_token) {
    return {
      error: json.error ?? json.error_description ?? "gmail_token_refresh_failed",
    };
  }

  return {
    accessToken: json.access_token,
    expiresIn: json.expires_in ?? 3600,
  };
}

export async function exchangeGmailOAuthCode(
  env: Env,
  code: string,
  redirectUri: string
): Promise<
  | { email: string; refreshToken: string; scopes: string[] }
  | { error: string }
> {
  const client = gmailOAuthClient(env);
  if (!client) return { error: "gmail_oauth_not_configured" };

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
      error: tokenJson.error ?? tokenJson.error_description ?? "gmail_oauth_exchange_failed",
    };
  }

  if (!tokenJson.refresh_token) {
    return { error: "gmail_refresh_token_missing" };
  }

  const profileRes = await fetch(
    "https://gmail.googleapis.com/gmail/v1/users/me/profile",
    { headers: { Authorization: `Bearer ${tokenJson.access_token}` } }
  );
  const profile = (await profileRes.json()) as { emailAddress?: string; error?: { message?: string } };
  if (!profileRes.ok || !profile.emailAddress) {
    return { error: profile.error?.message ?? "gmail_profile_failed" };
  }

  const scopes = tokenJson.scope?.split(" ").filter(Boolean) ?? [GMAIL_READONLY_SCOPE];
  return {
    email: profile.emailAddress,
    refreshToken: tokenJson.refresh_token,
    scopes,
  };
}

export function buildGmailAuthorizeUrl(
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
    scope: GMAIL_READONLY_SCOPE,
    access_type: "offline",
    prompt: "consent",
    state,
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${q}`;
}

export function buildGmailWriteAuthorizeUrl(
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
    scope: GMAIL_WRITE_SCOPES,
    access_type: "offline",
    prompt: "consent",
    state,
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${q}`;
}
