/** AES-GCM encrypt team secrets at rest (Resend keys, webhook secrets) */
import type { Env } from "../env";

const SALT = "mailagent-team-secrets-v1";
const IV_BYTES = 12;

function secretsMaster(env: Env): string {
  return (
    env.MCP_OAUTH_JWT_SECRET?.trim() ||
    env.API_KEY?.trim() ||
    "mailagent-dev-only"
  );
}

async function deriveAesKey(master: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(master),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: enc.encode(SALT),
      iterations: 100_000,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

function toBase64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function fromBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function encryptTeamSecret(
  env: Env,
  plaintext: string
): Promise<string> {
  const key = await deriveAesKey(secretsMaster(env));
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const enc = new TextEncoder();
  const cipher = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    enc.encode(plaintext)
  );
  const packed = new Uint8Array(iv.length + cipher.byteLength);
  packed.set(iv, 0);
  packed.set(new Uint8Array(cipher), iv.length);
  return toBase64(packed);
}

export async function decryptTeamSecret(
  env: Env,
  packedB64: string
): Promise<string | null> {
  try {
    const packed = fromBase64(packedB64);
    if (packed.length <= IV_BYTES) return null;
    const iv = packed.slice(0, IV_BYTES);
    const cipher = packed.slice(IV_BYTES);
    const key = await deriveAesKey(secretsMaster(env));
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      key,
      cipher
    );
    return new TextDecoder().decode(plain);
  } catch {
    return null;
  }
}
