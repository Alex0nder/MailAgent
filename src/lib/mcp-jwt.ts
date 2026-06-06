/** Stateless mat_ JWT — no KV put/get for OAuth access tokens */
import { SignJWT, jwtVerify } from "jose";
import type { ResolvedAuth } from "../services/api-key-store";
import { normalizePlan, type PlanId } from "./plans";

type McpJwtClaims = {
  sub: string;
  plan: PlanId;
  tid?: string | null;
  kid?: string | null;
  lbl?: string | null;
  slp?: string | null;
  sro?: boolean;
};

function secretKey(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

export function isJwtMatBody(body: string): boolean {
  return body.split(".").length === 3;
}

export async function signMcpAccessJwt(
  secret: string,
  auth: ResolvedAuth,
  expiresInSec: number
): Promise<string> {
  const claims: McpJwtClaims = {
    sub: auth.hint,
    plan: auth.plan,
    tid: auth.teamId,
    kid: auth.apiKeyId,
    lbl: auth.label,
    slp: auth.scope.labelPrefix,
    sro: auth.scope.readOnly,
  };

  return new SignJWT(claims as Record<string, unknown>)
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt()
    .setExpirationTime(`${expiresInSec}s`)
    .sign(secretKey(secret));
}

export async function verifyMcpAccessJwt(
  secret: string,
  jwt: string
): Promise<ResolvedAuth | null> {
  try {
    const { payload } = await jwtVerify(jwt, secretKey(secret), {
      algorithms: ["HS256"],
    });
    const c = payload as McpJwtClaims;
    if (!c.sub || typeof c.sub !== "string") return null;
    return {
      hint: c.sub,
      plan: normalizePlan(c.plan),
      teamId: c.tid ?? null,
      apiKeyId: c.kid ?? null,
      label: c.lbl ?? null,
      scope: {
        labelPrefix: c.slp ?? null,
        readOnly: Boolean(c.sro),
      },
    };
  } catch {
    return null;
  }
}
