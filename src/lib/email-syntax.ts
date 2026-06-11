/** RFC-ish email syntax parse for check-email API */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type ParsedEmailSyntax = {
  email: string;
  username: string;
  domain: string;
  isValidSyntax: boolean;
};

export function parseEmailSyntax(raw: unknown): ParsedEmailSyntax | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  const email = raw.trim().toLowerCase();
  if (email.length > 254 || !EMAIL_RE.test(email)) return null;
  const at = email.lastIndexOf("@");
  const username = email.slice(0, at);
  const domain = email.slice(at + 1);
  if (!username || !domain || domain.length < 3) return null;
  return { email, username, domain, isValidSyntax: true };
}
