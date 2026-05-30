/** SHA-256 Bearer-токена */
async function sha256Hex(token: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(token)
  );
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Префикс для inbox / rate limit (16 hex) */
export async function apiKeyHintFromToken(token: string): Promise<string> {
  return (await sha256Hex(token)).slice(0, 16);
}

/** Полный хеш для таблицы api_keys */
export async function apiKeyHashFromToken(token: string): Promise<string> {
  return sha256Hex(token);
}

export function bearerToken(header: string | undefined): string | null {
  if (!header?.startsWith("Bearer ")) return null;
  const token = header.slice("Bearer ".length).trim();
  return token || null;
}
