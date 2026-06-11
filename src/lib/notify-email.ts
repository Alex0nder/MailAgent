/** Validate notifyEmail for developer relay (no inbox-domain loops) */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type NotifyMode = "verification" | "off";

export function parseNotifyMode(raw: unknown): NotifyMode {
  if (raw === "off") return "off";
  return "verification";
}

export function parseNotifyEmail(
  raw: unknown,
  options?: { blockedDomains?: string[] }
): string | null {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== "string" || !raw.trim()) return null;
  const email = raw.trim().toLowerCase();
  if (email.length > 254 || !EMAIL_RE.test(email)) return null;

  const domain = email.split("@")[1];
  const blocked = (options?.blockedDomains ?? [])
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);
  if (blocked.includes(domain)) return null;

  return email;
}

export function blockedNotifyDomains(
  envInboxDomain: string,
  customDomainName?: string | null
): string[] {
  const domains = [envInboxDomain.trim().toLowerCase()];
  if (customDomainName?.trim()) {
    domains.push(customDomainName.trim().toLowerCase());
  }
  return [...new Set(domains)];
}

export function shouldFireNotify(inbox: {
  notify_email: string | null;
  notify_mode: string | null;
}): boolean {
  return Boolean(
    inbox.notify_email?.trim() &&
      (inbox.notify_mode ?? "off") !== "off"
  );
}
