/** Извлечение OTP и ссылок при ingest (не в hot path webhook) */
import parseOtpMessage from "parse-otp-message";

const OTP_PATTERNS = [
  /code[:\s]+(\d{4,8})/i,
  /verification[:\s]+(\d{4,8})/i,
  /one[- ]?time(?: password)?[:\s]+(\d{4,8})/i,
  /\b(\d{6})\b/,
  /\b(\d{4})\b/,
];

const LINK_PATTERN = /https?:\/\/[^\s<>"')\]]+/gi;

/** Шум в письмах — не отдавать агенту как magic link */
const LINK_NOISE =
  /unsubscribe|list-manage|mailto:|privacy|preferences|trk\.|click\./i;

/** Вероятные verify / magic links — выше в списке */
const LINK_VERIFY =
  /verify|confirm|activation|magic|token|oauth|sign[-_]?in|signup|password[-_]?reset|auth/i;

export function extractOtp(text: string): string | null {
  for (const pattern of OTP_PATTERNS) {
    const match = text.match(pattern);
    const code = match?.[1];
    if (!code) continue;
    if (code.length === 4 && code.startsWith("20")) continue;
    return code;
  }
  const parsed = parseOtpMessage(text);
  if (parsed?.code && /^\d{4,8}$/.test(parsed.code)) return parsed.code;
  return null;
}

export function extractLinks(text: string, max = 5): string[] {
  const found = text.match(LINK_PATTERN) ?? [];
  const unique = [...new Set(found.map((u) => u.replace(/[.,;]+$/, "")))];
  const filtered = unique.filter((u) => !LINK_NOISE.test(u));
  const ranked = filtered.sort((a, b) => linkScore(b) - linkScore(a));
  return ranked.slice(0, max);
}

function linkScore(url: string): number {
  return LINK_VERIFY.test(url) ? 2 : 0;
}

/** Лучшая ссылка для verify (уже отсортирована в extractLinks) */
export function primaryLink(links: string[]): string | null {
  return links[0] ?? null;
}

export function buildPreviewText(text: string | null | undefined, max = 2000): string | null {
  if (!text) return null;
  const trimmed = text.trim();
  if (!trimmed) return null;
  return trimmed.length > max ? `${trimmed.slice(0, max)}…` : trimmed;
}
