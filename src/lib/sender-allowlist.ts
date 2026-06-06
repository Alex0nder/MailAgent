/** Normalize and validate allowlist From for inbox */

/** Normalize expectFrom / allowedSenders to rule list (lowercase) */
export function normalizeAllowedSenders(
  input: string | string[] | undefined
): string[] {
  if (input === undefined) return [];
  const raw = Array.isArray(input) ? input : [input];
  const out: string[] = [];
  for (const item of raw) {
    const s = item.trim().toLowerCase();
    if (!s) continue;
    if (s.includes("@") && !s.startsWith("@")) {
      out.push(s);
      continue;
    }
    out.push(s.startsWith("@") ? s : `@${s}`);
  }
  return [...new Set(out)];
}

/** Empty allowlist = any sender; domain matches subdomains (m.dribbble.com → dribbble.com) */
export function isSenderAllowed(
  from: string,
  allowedSenders: string[] | null | undefined
): boolean {
  if (!allowedSenders?.length) return true;

  const addr = parseFromAddress(from);
  if (!addr) return false;

  const host = addr.split("@")[1];
  if (!host) return false;

  for (const rule of allowedSenders) {
    if (rule.includes("@") && !rule.startsWith("@")) {
      if (addr === rule) return true;
      continue;
    }
    const domain = (rule.startsWith("@") ? rule.slice(1) : rule).toLowerCase();
    if (hostMatchesDomain(host, domain)) return true;
  }
  return false;
}

function hostMatchesDomain(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`);
}

function parseFromAddress(from: string): string | null {
  const angle = from.match(/<([^>]+)>/);
  const email = (angle?.[1] ?? from).trim().toLowerCase();
  return email.includes("@") ? email : null;
}
