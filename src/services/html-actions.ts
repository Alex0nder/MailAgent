const CTA_TEXT =
  /verify|confirm|activate|complete|continue|sign\s*in|log\s*in|login|magic|reset|password|recover|accept|join|open/i;
const NOISE_TEXT =
  /unsubscribe|manage preferences|email preferences|privacy|terms|view in browser|help center|support|contact us/i;
const NOISE_HREF =
  /unsubscribe|list-manage|mailto:|privacy|preferences|terms|help|support|trk\.|click\./i;

export type HtmlActionCandidate = {
  text: string;
  href: string;
  kind: "button" | "link";
  score: number;
};

export type HtmlActions = {
  buttons: HtmlActionCandidate[];
  primaryButton: HtmlActionCandidate | null;
  visibleText: string;
  filteredLinks: string[];
};

export function extractHtmlActions(input: {
  html?: string | null;
  text?: string | null;
  links?: string[];
}): HtmlActions {
  const html = input.html ?? "";
  const text = input.text ?? "";
  const anchors = extractAnchors(html);
  const visibleText = sanitizeVisibleText(html || text);
  const linkCandidates = [
    ...anchors.map((a) => a.href),
    ...(input.links ?? []),
  ];
  const filteredLinks = unique(
    linkCandidates
      .map(cleanHref)
      .filter((href): href is string => Boolean(href && !isNoiseLink(href)))
  ).slice(0, 10);

  const buttons = anchors
    .map((anchor) => {
      const href = cleanHref(anchor.href);
      const label = cleanText(anchor.text);
      if (!href || !label || isNoiseLink(href) || isNoiseText(label)) return null;
      const kind = looksLikeButton(anchor.raw, label) ? "button" : "link";
      const score = actionScore(label, href, kind);
      if (score <= 0) return null;
      return { text: label, href, kind, score };
    })
    .filter((candidate): candidate is HtmlActionCandidate => Boolean(candidate))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  return {
    buttons,
    primaryButton: buttons[0] ?? null,
    visibleText,
    filteredLinks,
  };
}

function extractAnchors(html: string): Array<{ raw: string; href: string; text: string }> {
  const anchors: Array<{ raw: string; href: string; text: string }> = [];
  const pattern = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(html))) {
    const raw = match[0] ?? "";
    const attrs = match[1] ?? "";
    const href = readAttr(attrs, "href");
    if (!href) continue;
    anchors.push({ raw, href, text: stripTags(match[2] ?? "") });
  }
  return anchors;
}

function readAttr(attrs: string, name: string): string | null {
  const pattern = new RegExp(`${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i");
  const match = attrs.match(pattern);
  return match?.[2] ?? match?.[3] ?? match?.[4] ?? null;
}

function sanitizeVisibleText(source: string): string {
  const cleaned = stripTags(source)
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.length > 2000 ? `${cleaned.slice(0, 2000)}...` : cleaned;
}

function stripTags(source: string): string {
  return decodeEntities(
    source
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/<\/(p|div|td|tr|table|h[1-6]|li)>/gi, " ")
      .replace(/<[^>]+>/g, " ")
  );
}

function decodeEntities(source: string): string {
  return source
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#x27;/gi, "'");
}

function cleanText(source: string): string {
  return source.replace(/\s+/g, " ").trim().slice(0, 160);
}

function cleanHref(source: string | null | undefined): string | null {
  if (!source) return null;
  const href = decodeEntities(source).trim().replace(/[.,;]+$/, "");
  if (!/^https?:\/\//i.test(href)) return null;
  return href;
}

function looksLikeButton(raw: string, label: string): boolean {
  return (
    CTA_TEXT.test(label) ||
    /\b(btn|button|cta|primary|action)\b/i.test(raw) ||
    /role\s*=\s*["']button["']/i.test(raw)
  );
}

function isNoiseLink(href: string): boolean {
  return NOISE_HREF.test(href);
}

function isNoiseText(text: string): boolean {
  return NOISE_TEXT.test(text);
}

function actionScore(text: string, href: string, kind: "button" | "link"): number {
  let score = kind === "button" ? 2 : 1;
  if (CTA_TEXT.test(text)) score += 4;
  if (CTA_TEXT.test(href)) score += 3;
  if (/reset|password|recover/i.test(`${text} ${href}`)) score += 1;
  if (/verify|confirm|activate/i.test(`${text} ${href}`)) score += 1;
  return score;
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}
