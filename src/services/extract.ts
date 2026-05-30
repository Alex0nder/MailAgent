/** Извлечение OTP и ссылок при ingest (не в hot path webhook) */

const OTP_PATTERNS = [
  /\b(\d{6})\b/,
  /\b(\d{4})\b/,
  /code[:\s]+(\d{4,8})/i,
  /verification[:\s]+(\d{4,8})/i,
];

const LINK_PATTERN = /https?:\/\/[^\s<>"')\]]+/gi;

export function extractOtp(text: string): string | null {
  for (const pattern of OTP_PATTERNS) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1];
  }
  return null;
}

export function extractLinks(text: string, max = 5): string[] {
  const found = text.match(LINK_PATTERN) ?? [];
  const unique = [...new Set(found.map((u) => u.replace(/[.,;]+$/, "")))];
  return unique.slice(0, max);
}

export function buildPreviewText(text: string | null | undefined, max = 2000): string | null {
  if (!text) return null;
  const trimmed = text.trim();
  if (!trimmed) return null;
  return trimmed.length > max ? `${trimmed.slice(0, max)}…` : trimmed;
}
