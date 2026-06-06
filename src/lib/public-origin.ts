/** Public API origin (prod / workers.dev / local) */
export function publicOriginFromUrl(url: string): string {
  const u = new URL(url);
  if (u.hostname === "127.0.0.1" || u.hostname === "localhost") {
    return u.origin;
  }
  if (u.hostname.includes("workers.dev")) {
    return u.origin;
  }
  return "https://api.webmailagent.com";
}
