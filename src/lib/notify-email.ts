/** Validate notifyEmail for developer relay (no inbox-domain loops, no DEA) */

import { isDisposableDomain } from "./disposable-domains";
import { parseEmailSyntax } from "./email-syntax";

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
  const parsed = parseEmailSyntax(raw);
  if (!parsed) return null;

  const blocked = (options?.blockedDomains ?? [])
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);
  if (blocked.includes(parsed.domain)) return null;
  if (isDisposableDomain(parsed.domain)) return null;

  return parsed.email;
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
