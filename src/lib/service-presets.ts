/** expectFrom presets for popular services (agent / MCP / API) */

/** Suggested subjectContains when waiting for verification mail (MCP / verify). */
export const SERVICE_SUBJECT_HINTS: Record<string, string> = {
  github: "verify",
  gitlab: "Confirm",
  bitbucket: "verify",
  google: "verification",
  auth0: "verify",
  stripe: "verification",
  vercel: "verify",
  supabase: "confirm",
  clerk: "verification",
  discord: "verify",
  openai: "verify",
  figma: "Figma",
  notion: "Notion",
  linear: "Linear",
  slack: "confirm",
  shopify: "verify",
  atlassian: "verify",
  microsoft: "verify",
  apple: "verify",
  firebase: "verify",
  dribbble: "confirm",
  posthog: "verify",
  twilio: "verify",
  aws: "verify",
  resend: "verify",
};

export const SERVICE_EXPECT_FROM: Record<string, string[]> = {
  dribbble: ["dribbble.com", "m.dribbble.com"],
  github: ["github.com", "noreply@github.com"],
  gitlab: ["gitlab.com", "about.gitlab.com", "noreply@gitlab.com"],
  bitbucket: ["bitbucket.org", "messaging.atlassian.com"],
  google: ["google.com", "accounts.google.com"],
  auth0: ["auth0.com"],
  stripe: ["stripe.com"],
  vercel: ["vercel.com"],
  supabase: ["supabase.com", "supabase.io"],
  clerk: ["clerk.com", "clerk.dev"],
  discord: ["discord.com"],
  openai: ["openai.com"],
  resend: ["resend.com"],
  firebase: ["firebase.google.com", "google.com"],
  figma: ["figma.com", "mail.figma.com"],
  notion: ["notion.so", "makenotion.com"],
  linear: ["linear.app"],
  slack: ["slack.com"],
  shopify: ["shopify.com"],
  atlassian: ["atlassian.com", "jira.com"],
  aws: ["amazon.com", "aws.amazon.com"],
  microsoft: ["microsoft.com", "outlook.com"],
  apple: ["apple.com", "icloud.com"],
  twilio: ["twilio.com"],
  posthog: ["posthog.com"],
};

export function resolveSubjectHint(service?: string): string | undefined {
  const key = service?.trim().toLowerCase();
  return key ? SERVICE_SUBJECT_HINTS[key] : undefined;
}

export function formatSubjectHintsForDocs(max = 12): string {
  return Object.entries(SERVICE_SUBJECT_HINTS)
    .slice(0, max)
    .map(([s, h]) => `${s}="${h}"`)
    .join(", ");
}

export function resolveExpectFrom(
  service?: string,
  extra?: string | string[]
): string[] | undefined {
  const key = service?.trim().toLowerCase();
  const base = key ? SERVICE_EXPECT_FROM[key] : undefined;
  if (!base && !extra) return undefined;
  const extras = extra
    ? Array.isArray(extra)
      ? extra
      : [extra]
    : [];
  return [...new Set([...(base ?? []), ...extras])];
}
