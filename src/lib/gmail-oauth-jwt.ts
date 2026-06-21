/** Stateless JWT for Gmail OAuth connect flow (owner binding, no KV). */
import { SignJWT, jwtVerify } from "jose";

const FLOW_TTL_SEC = 600;

function secretKey(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

export type GmailOAuthPending = {
  ownerKey: string;
  teamId: string | null;
  apiKeyHint: string;
  returnTo?: string;
};

export async function signGmailOAuthPending(
  secret: string,
  pending: GmailOAuthPending
): Promise<string> {
  return new SignJWT({
    ok: pending.ownerKey,
    tid: pending.teamId,
    hint: pending.apiKeyHint,
    ret: pending.returnTo ?? null,
    typ: "gmail_oauth",
  } as Record<string, unknown>)
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt()
    .setExpirationTime(`${FLOW_TTL_SEC}s`)
    .sign(secretKey(secret));
}

export async function verifyGmailOAuthPending(
  secret: string,
  token: string
): Promise<GmailOAuthPending | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey(secret), { algorithms: ["HS256"] });
    if (payload.typ !== "gmail_oauth") return null;
    const ownerKey = payload.ok;
    const apiKeyHint = payload.hint;
    if (typeof ownerKey !== "string" || typeof apiKeyHint !== "string") return null;
    return {
      ownerKey,
      teamId: typeof payload.tid === "string" ? payload.tid : null,
      apiKeyHint,
      returnTo: typeof payload.ret === "string" ? payload.ret : undefined,
    };
  } catch {
    return null;
  }
}

export type CalendarOAuthPending = GmailOAuthPending;

export async function signCalendarOAuthPending(
  secret: string,
  pending: CalendarOAuthPending
): Promise<string> {
  return new SignJWT({
    ok: pending.ownerKey,
    tid: pending.teamId,
    hint: pending.apiKeyHint,
    ret: pending.returnTo ?? null,
    typ: "calendar_oauth",
  } as Record<string, unknown>)
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt()
    .setExpirationTime(`${FLOW_TTL_SEC}s`)
    .sign(secretKey(secret));
}

export async function verifyCalendarOAuthPending(
  secret: string,
  token: string
): Promise<CalendarOAuthPending | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey(secret), { algorithms: ["HS256"] });
    if (payload.typ !== "calendar_oauth") return null;
    const ownerKey = payload.ok;
    const apiKeyHint = payload.hint;
    if (typeof ownerKey !== "string" || typeof apiKeyHint !== "string") return null;
    return {
      ownerKey,
      teamId: typeof payload.tid === "string" ? payload.tid : null,
      apiKeyHint,
      returnTo: typeof payload.ret === "string" ? payload.ret : undefined,
    };
  } catch {
    return null;
  }
}
