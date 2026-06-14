/** Verification format for REST, callback, agent */
import { primaryLink } from "./extract";
import { extractHtmlActions, type HtmlActionCandidate } from "./html-actions";
import type { MessageRow } from "./inbox";

export type VerificationConfidence = "high" | "medium" | "low";

export type VerificationAlternatives = {
  otp: string[];
  links: string[];
};

export type MessageVerification = {
  otp: string | null;
  links: string[];
  primaryLink: string | null;
  buttons: HtmlActionCandidate[];
  primaryButton: HtmlActionCandidate | null;
  visibleText: string;
  filteredLinks: string[];
  confidence: VerificationConfidence;
  matchedRule: string | null;
  reason: string;
  alternatives: VerificationAlternatives;
  from: string;
  subject: string;
  messageId: string;
  hasRaw?: boolean;
  rawUrl?: string;
};

export function formatMessageVerification(
  row: MessageRow,
  inboxId?: string
): MessageVerification {
  const links = parseLinks(row.links_json);
  const primary = primaryLink(links);
  const metadata = buildVerificationMetadata(row.otp, links, primary);
  const actions = extractHtmlActions({
    html: row.html_preview,
    text: row.text_preview,
    links,
  });
  return {
    otp: row.otp,
    links,
    primaryLink: primary,
    ...actions,
    ...metadata,
    from: row.from_addr,
    subject: row.subject,
    messageId: row.id,
    hasRaw: Boolean(row.raw_r2_key),
    ...(row.raw_r2_key && inboxId
      ? { rawUrl: `/v1/inboxes/${inboxId}/messages/${row.id}/raw` }
      : {}),
  };
}

export function buildVerificationMetadata(
  otp: string | null,
  links: string[],
  primary: string | null = primaryLink(links)
): {
  confidence: VerificationConfidence;
  matchedRule: string | null;
  reason: string;
  alternatives: VerificationAlternatives;
} {
  const alternativeLinks = primary ? links.filter((link) => link !== primary) : links;
  if (otp) {
    const confidence: VerificationConfidence = otp.length === 6 ? "high" : "medium";
    return {
      confidence,
      matchedRule: otp.length === 6 ? "otp_6_digit" : "otp_numeric",
      reason:
        confidence === "high"
          ? "A 6-digit numeric OTP was extracted from the email."
          : `A ${otp.length}-digit numeric OTP was extracted; verify the app expects this code length.`,
      alternatives: { otp: [], links: alternativeLinks },
    };
  }

  if (primary) {
    const looksLikeVerification =
      /verify|confirm|activation|magic|token|oauth|sign[-_]?in|signup|password[-_]?reset|auth/i.test(
        primary
      );
    return {
      confidence: looksLikeVerification ? "high" : "medium",
      matchedRule: looksLikeVerification ? "verification_link" : "first_non_noise_link",
      reason: looksLikeVerification
        ? "Primary link contains a verification or authentication keyword."
        : "No OTP was found; using the first non-noise link as the primary action.",
      alternatives: { otp: [], links: alternativeLinks },
    };
  }

  return {
    confidence: "low",
    matchedRule: null,
    reason: "No OTP or verification link was extracted from this message.",
    alternatives: { otp: [], links: [] },
  };
}

function parseLinks(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw as string[];
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as string[];
    } catch {
      return [];
    }
  }
  return [];
}
