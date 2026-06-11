/** Known disposable email domains (local DEA check without Reacher) */

const DISPOSABLE_DOMAINS = new Set([
  "mailinator.com",
  "guerrillamail.com",
  "guerrillamail.net",
  "guerrillamail.org",
  "grr.la",
  "sharklasers.com",
  "yopmail.com",
  "tempmail.com",
  "temp-mail.org",
  "10minutemail.com",
  "trashmail.com",
  "getnada.com",
  "maildrop.cc",
  "dispostable.com",
  "throwaway.email",
  "tempail.com",
  "fakeinbox.com",
  "mailnesia.com",
  "mintemail.com",
  "emailondeck.com",
]);

export function isDisposableDomain(domain: string): boolean {
  const normalized = domain.trim().toLowerCase();
  if (DISPOSABLE_DOMAINS.has(normalized)) return true;
  const parts = normalized.split(".");
  if (parts.length >= 2) {
    const parent = parts.slice(-2).join(".");
    if (DISPOSABLE_DOMAINS.has(parent)) return true;
  }
  return false;
}
