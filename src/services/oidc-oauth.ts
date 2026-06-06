/** OIDC IdP (Auth0/Google): authorize → callback → authorization_code → mat_ token */
import { nanoid } from "nanoid";
import type { Env } from "../env";
import { getDb } from "../db/client";
import { FULL_ACCESS_SCOPE } from "../lib/key-scope";
import { isJwtMatBody } from "../lib/mcp-jwt";
import { mcpSigningSecret } from "../lib/mcp-signing-secret";
import {
  signOidcAuthCode,
  signOidcPendingState,
  verifyOidcAuthCode,
  verifyOidcPendingState,
} from "../lib/oidc-flow-jwt";
import { normalizePlan, type PlanId } from "../lib/plans";
import type { ResolvedAuth } from "./api-key-store";
import { issueMcpAccessToken } from "./mcp-oauth";

const STATE_PREFIX = "oauth:oidc:state:";
const CODE_PREFIX = "oauth:oidc:code:";
const FLOW_TTL_SEC = 600;

type OidcConfig = {
  issuer: string;
  clientId: string;
  clientSecret: string;
  audience?: string;
};

type PendingAuthorize = {
  clientRedirectUri: string;
  clientState: string;
  codeChallenge: string;
  codeChallengeMethod: string;
};

type PendingCode = {
  auth: ResolvedAuth;
  codeChallenge: string;
  redirectUri: string;
};

type OidcDiscovery = {
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri: string;
};

export function isOidcEnabled(env: Env): boolean {
  const issuer = env.OIDC_ISSUER?.trim();
  const clientId = env.OIDC_CLIENT_ID?.trim();
  const clientSecret = env.OIDC_CLIENT_SECRET?.trim();
  return Boolean(issuer && clientId && clientSecret);
}

function oidcConfig(env: Env): OidcConfig | null {
  if (!isOidcEnabled(env)) return null;
  return {
    issuer: env.OIDC_ISSUER!.trim().replace(/\/$/, ""),
    clientId: env.OIDC_CLIENT_ID!.trim(),
    clientSecret: env.OIDC_CLIENT_SECRET!.trim(),
    audience: env.OIDC_AUDIENCE?.trim() || undefined,
  };
}

function kv(env: Env): KVNamespace | undefined {
  return env.RATE_LIMIT;
}

async function fetchDiscovery(issuer: string): Promise<OidcDiscovery> {
  const res = await fetch(`${issuer}/.well-known/openid-configuration`);
  if (!res.ok) throw new Error(`oidc_discovery_failed:${res.status}`);
  return (await res.json()) as OidcDiscovery;
}

/** GET /v1/oauth/authorize — redirect to IdP (Auth0/Google) */
export async function startOidcAuthorize(
  env: Env,
  origin: string,
  params: {
    redirectUri: string;
    state: string;
    codeChallenge: string;
    codeChallengeMethod?: string;
  }
): Promise<string> {
  const cfg = oidcConfig(env);
  const secret = mcpSigningSecret(env);
  const store = kv(env);
  if (!cfg || (!secret && !store)) throw new Error("oidc_not_configured");

  const method = params.codeChallengeMethod ?? "S256";
  if (method !== "S256") throw new Error("invalid_code_challenge_method");

  const discovery = await fetchDiscovery(cfg.issuer);

  const pending: PendingAuthorize = {
    clientRedirectUri: params.redirectUri,
    clientState: params.state,
    codeChallenge: params.codeChallenge,
    codeChallengeMethod: method,
  };

  let internalState: string;
  if (secret) {
    internalState = await signOidcPendingState(secret, pending);
  } else {
    internalState = nanoid(32);
    await store!.put(STATE_PREFIX + internalState, JSON.stringify(pending), {
      expirationTtl: FLOW_TTL_SEC,
    });
  }

  const callback = `${origin}/v1/oauth/callback`;
  const q = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: callback,
    response_type: "code",
    scope: "openid profile email",
    state: internalState,
    code_challenge: params.codeChallenge,
    code_challenge_method: "S256",
  });
  if (cfg.audience) q.set("audience", cfg.audience);

  return `${discovery.authorization_endpoint}?${q}`;
}

/** GET /v1/oauth/callback — IdP → MailAgent code for MCP client */
export async function finishOidcCallback(
  env: Env,
  origin: string,
  idpCode: string,
  internalState: string
): Promise<{ redirectUrl: string }> {
  const cfg = oidcConfig(env);
  const secret = mcpSigningSecret(env);
  const store = kv(env);
  if (!cfg || (!secret && !store)) throw new Error("oidc_not_configured");

  let pending: PendingAuthorize | null = null;
  if (secret && isJwtMatBody(internalState)) {
    pending = await verifyOidcPendingState(secret, internalState);
  } else if (store) {
    const raw = await store.get(STATE_PREFIX + internalState);
    if (raw) {
      await store.delete(STATE_PREFIX + internalState);
      pending = JSON.parse(raw) as PendingAuthorize;
    }
  }
  if (!pending) throw new Error("invalid_state");
  const discovery = await fetchDiscovery(cfg.issuer);
  const callback = `${origin}/v1/oauth/callback`;

  const tokenRes = await fetch(discovery.token_endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      code: idpCode,
      redirect_uri: callback,
    }),
  });
  if (!tokenRes.ok) throw new Error(`idp_token_exchange_failed:${tokenRes.status}`);

  const tokens = (await tokenRes.json()) as {
    id_token?: string;
    access_token?: string;
  };
  if (!tokens.id_token) throw new Error("missing_id_token");

  const claims = await verifyIdToken(tokens.id_token, cfg, discovery.jwks_uri);
  const sub = String(claims.sub ?? "");
  if (!sub) throw new Error("missing_sub");

  const auth = await resolveOidcTeam(env, cfg.issuer, sub, claims.email as string | undefined);
  const codePayload: PendingCode = {
    auth,
    codeChallenge: pending.codeChallenge,
    redirectUri: pending.clientRedirectUri,
  };

  let mailagentCode: string;
  if (secret) {
    mailagentCode = await signOidcAuthCode(secret, codePayload);
  } else {
    mailagentCode = nanoid(40);
    await store!.put(CODE_PREFIX + mailagentCode, JSON.stringify(codePayload), {
      expirationTtl: FLOW_TTL_SEC,
    });
  }

  const redirect = new URL(pending.clientRedirectUri);
  redirect.searchParams.set("code", mailagentCode);
  redirect.searchParams.set("state", pending.clientState);
  return { redirectUrl: redirect.toString() };
}

/** POST grant_type=authorization_code → mat_ token */
export async function exchangeAuthorizationCode(
  env: Env,
  input: { code: string; redirectUri: string; codeVerifier: string }
): Promise<{ access_token: string; token_type: "Bearer"; expires_in: number } | null> {
  const secret = mcpSigningSecret(env);
  const store = kv(env);

  let pending: PendingCode | null = null;
  if (secret && isJwtMatBody(input.code)) {
    const decoded = await verifyOidcAuthCode(secret, input.code);
    if (decoded) {
      pending = {
        auth: decoded.auth,
        codeChallenge: decoded.codeChallenge,
        redirectUri: decoded.redirectUri,
      };
    }
  } else if (store) {
    const raw = await store.get(CODE_PREFIX + input.code);
    if (raw) {
      await store.delete(CODE_PREFIX + input.code);
      pending = JSON.parse(raw) as PendingCode;
    }
  }
  if (!pending) return null;
  if (pending.redirectUri !== input.redirectUri) return null;

  const challenge = await pkceChallengeS256(input.codeVerifier);
  if (challenge !== pending.codeChallenge) return null;

  return issueMcpAccessToken(env, pending.auth);
}

async function resolveOidcTeam(
  env: Env,
  issuer: string,
  sub: string,
  email?: string
): Promise<ResolvedAuth> {
  const sql = getDb(env);
  const existing = (await sql`
    SELECT o.team_id, t.plan AS team_plan, o.email
    FROM oidc_identities o
    JOIN teams t ON t.id = o.team_id
    WHERE o.issuer = ${issuer} AND o.sub = ${sub}
    LIMIT 1
  `) as { team_id: string; team_plan: string; email: string | null }[];

  if (existing[0]) {
    const row = existing[0];
    return {
      hint: `oidc:${sub.slice(0, 12)}`,
      plan: normalizePlan(row.team_plan),
      teamId: row.team_id,
      apiKeyId: null,
      label: email ?? row.email,
      scope: FULL_ACCESS_SCOPE,
    };
  }

  const teamId = nanoid(10);
  const identityId = nanoid(10);
  const teamName = email ? email.split("@")[0]!.slice(0, 48) : `oidc-${sub.slice(0, 8)}`;

  await sql`INSERT INTO teams (id, name, plan) VALUES (${teamId}, ${teamName}, 'free')`;
  await sql`
    INSERT INTO oidc_identities (id, team_id, issuer, sub, email)
    VALUES (${identityId}, ${teamId}, ${issuer}, ${sub}, ${email ?? null})
  `;

  return {
    hint: `oidc:${sub.slice(0, 12)}`,
    plan: "free" as PlanId,
    teamId,
    apiKeyId: null,
    label: email ?? null,
    scope: FULL_ACCESS_SCOPE,
  };
}

async function pkceChallengeS256(verifier: string): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64url(new Uint8Array(hash));
}

function base64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function verifyIdToken(
  idToken: string,
  cfg: OidcConfig,
  jwksUri: string
): Promise<Record<string, unknown>> {
  const parts = idToken.split(".");
  if (parts.length !== 3) throw new Error("invalid_id_token");

  const header = JSON.parse(decodeBase64Url(parts[0]!)) as { alg?: string; kid?: string };
  const payload = JSON.parse(decodeBase64Url(parts[1]!)) as Record<string, unknown>;

  if (header.alg !== "RS256" || !header.kid) throw new Error("unsupported_id_token_alg");

  const jwksRes = await fetch(jwksUri);
  if (!jwksRes.ok) throw new Error("jwks_fetch_failed");
  const jwks = (await jwksRes.json()) as { keys: (JsonWebKey & { kid?: string })[] };
  const jwk = jwks.keys.find((k) => k.kid === header.kid);
  if (!jwk) throw new Error("jwks_key_not_found");

  const key = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"]
  );

  const data = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
  const sig = decodeBase64UrlToBytes(parts[2]!);
  const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, sig, data);
  if (!ok) throw new Error("id_token_signature_invalid");

  const iss = String(payload.iss ?? "").replace(/\/$/, "");
  if (iss !== cfg.issuer) throw new Error("invalid_issuer");
  if (payload.aud !== cfg.clientId && !(Array.isArray(payload.aud) && payload.aud.includes(cfg.clientId))) {
    throw new Error("invalid_audience");
  }
  const exp = Number(payload.exp ?? 0);
  if (exp * 1000 < Date.now() - 60_000) throw new Error("id_token_expired");

  return payload;
}

function decodeBase64Url(part: string): string {
  const pad = part.length % 4 === 0 ? "" : "=".repeat(4 - (part.length % 4));
  const b64 = part.replace(/-/g, "+").replace(/_/g, "/") + pad;
  return atob(b64);
}

function decodeBase64UrlToBytes(part: string): Uint8Array<ArrayBuffer> {
  const s = decodeBase64Url(part);
  const buf = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) buf[i] = s.charCodeAt(i);
  return buf;
}
