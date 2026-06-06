/** Stateless OIDC authorize/code JWT — no KV puts for browser login flow */
import { SignJWT, jwtVerify } from "jose";
import type { ResolvedAuth } from "../services/api-key-store";
import { normalizePlan, type PlanId } from "./plans";

const FLOW_TTL_SEC = 600;

function secretKey(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

export type OidcPendingState = {
  clientRedirectUri: string;
  clientState: string;
  codeChallenge: string;
  codeChallengeMethod: string;
};

export type OidcAuthCodePayload = {
  auth: ResolvedAuth;
  codeChallenge: string;
  redirectUri: string;
};

function authClaims(auth: ResolvedAuth) {
  return {
    sub: auth.hint,
    plan: auth.plan,
    tid: auth.teamId,
    kid: auth.apiKeyId,
    lbl: auth.label,
    slp: auth.scope.labelPrefix,
    sro: auth.scope.readOnly,
  };
}

function claimsToAuth(c: Record<string, unknown>): ResolvedAuth | null {
  if (!c.sub || typeof c.sub !== "string") return null;
  return {
    hint: c.sub,
    plan: normalizePlan(c.plan as PlanId),
    teamId: (c.tid as string | null) ?? null,
    apiKeyId: (c.kid as string | null) ?? null,
    label: (c.lbl as string | null) ?? null,
    scope: {
      labelPrefix: (c.slp as string | null) ?? null,
      readOnly: Boolean(c.sro),
    },
  };
}

export async function signOidcPendingState(
  secret: string,
  pending: OidcPendingState
): Promise<string> {
  return new SignJWT({
    cru: pending.clientRedirectUri,
    cs: pending.clientState,
    cc: pending.codeChallenge,
    ccm: pending.codeChallengeMethod,
    typ: "oidc_state",
  } as Record<string, unknown>)
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt()
    .setExpirationTime(`${FLOW_TTL_SEC}s`)
    .sign(secretKey(secret));
}

export async function verifyOidcPendingState(
  secret: string,
  token: string
): Promise<OidcPendingState | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey(secret), { algorithms: ["HS256"] });
    if (payload.typ !== "oidc_state") return null;
    const cru = payload.cru;
    const cs = payload.cs;
    const cc = payload.cc;
    const ccm = payload.ccm;
    if (typeof cru !== "string" || typeof cs !== "string" || typeof cc !== "string") return null;
    return {
      clientRedirectUri: cru,
      clientState: cs,
      codeChallenge: cc,
      codeChallengeMethod: typeof ccm === "string" ? ccm : "S256",
    };
  } catch {
    return null;
  }
}

export async function signOidcAuthCode(
  secret: string,
  payload: OidcAuthCodePayload
): Promise<string> {
  const a = authClaims(payload.auth);
  return new SignJWT({
    ...a,
    cc: payload.codeChallenge,
    ru: payload.redirectUri,
    typ: "oidc_code",
  } as Record<string, unknown>)
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt()
    .setExpirationTime(`${FLOW_TTL_SEC}s`)
    .sign(secretKey(secret));
}

export async function verifyOidcAuthCode(
  secret: string,
  token: string
): Promise<OidcAuthCodePayload | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey(secret), { algorithms: ["HS256"] });
    if (payload.typ !== "oidc_code") return null;
    const auth = claimsToAuth(payload as Record<string, unknown>);
    const cc = payload.cc;
    const ru = payload.ru;
    if (!auth || typeof cc !== "string" || typeof ru !== "string") return null;
    return { auth, codeChallenge: cc, redirectUri: ru };
  } catch {
    return null;
  }
}
