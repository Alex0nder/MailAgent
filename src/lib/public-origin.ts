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

const WORKSPACE_UI_ORIGIN = "https://webmailagent.com";

/** OAuth returnTo from workspace UI — relative paths resolve to the static site origin. */
export function resolveWorkspaceReturnTo(returnTo: string, requestUrl: string): URL {
  try {
    return new URL(returnTo);
  } catch {
    const apiOrigin = publicOriginFromUrl(requestUrl);
    const base =
      apiOrigin.includes("127.0.0.1") || apiOrigin.includes("localhost")
        ? apiOrigin
        : WORKSPACE_UI_ORIGIN;
    return new URL(returnTo, base);
  }
}
