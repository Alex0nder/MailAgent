/** Валидация callback URL для QA (только HTTPS, без localhost) */

export function parseCallbackUrl(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  const url = raw.trim();
  if (url.length > 2048) return null;
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return null;
    const host = u.hostname.toLowerCase();
    if (
      host === "localhost" ||
      host.endsWith(".local") ||
      host.startsWith("127.") ||
      host.startsWith("10.") ||
      host.startsWith("192.168.")
    ) {
      return null;
    }
    return u.toString();
  } catch {
    return null;
  }
}
