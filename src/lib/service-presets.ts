/** expectFrom presets for popular services (agent / MCP / API) */

export type ServiceFlow = "signup" | "login" | "password_reset";

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

/** Login / step-up 2FA — use flow=login on verify when subjectContains omitted. */
export const SERVICE_LOGIN_SUBJECT_HINTS: Record<string, string> = {
  github: "sign in",
  gitlab: "sign in",
  bitbucket: "sign in",
  google: "sign-in",
  auth0: "code",
  stripe: "verification code",
  vercel: "sign in",
  supabase: "code",
  clerk: "code",
  discord: "verify",
  openai: "code",
  figma: "sign in",
  notion: "sign in",
  linear: "sign in",
  slack: "login",
  shopify: "log in",
  atlassian: "sign in",
  microsoft: "security code",
  apple: "Apple ID",
  firebase: "sign-in",
  dribbble: "sign in",
  posthog: "code",
  twilio: "code",
  aws: "verification",
  resend: "code",
};

/** Password reset — use flow=password_reset on verify. */
export const SERVICE_PASSWORD_RESET_SUBJECT_HINTS: Record<string, string> = {
  github: "reset",
  gitlab: "reset",
  bitbucket: "reset",
  google: "reset",
  auth0: "reset",
  stripe: "reset",
  vercel: "reset",
  supabase: "reset",
  clerk: "reset",
  discord: "reset",
  openai: "reset",
  figma: "reset",
  notion: "reset",
  linear: "reset",
  slack: "reset",
  shopify: "reset",
  atlassian: "reset",
  microsoft: "reset",
  apple: "reset",
  firebase: "reset",
  dribbble: "reset",
  posthog: "reset",
  twilio: "reset",
  aws: "reset",
  resend: "reset",
};

/** Default inbox TTL (minutes) when create/verify omits ttlMinutes. */
export const SERVICE_TTL_MINUTES: Partial<Record<string, number>> = {
  github: 60,
  gitlab: 60,
  bitbucket: 60,
  google: 60,
  auth0: 45,
  stripe: 45,
  vercel: 60,
  supabase: 60,
  clerk: 45,
  discord: 60,
  openai: 60,
  microsoft: 60,
  apple: 60,
  shopify: 90,
  atlassian: 60,
  slack: 60,
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

function parseServiceFlow(flow?: string): ServiceFlow {
  const f = flow?.trim().toLowerCase();
  if (f === "login") return "login";
  if (f === "password_reset") return "password_reset";
  return "signup";
}

export function resolveSubjectHint(
  service?: string,
  flow?: ServiceFlow | string
): string | undefined {
  const key = service?.trim().toLowerCase();
  if (!key) return undefined;
  const parsed = typeof flow === "string" ? parseServiceFlow(flow) : flow ?? "signup";
  switch (parsed) {
    case "login":
      return SERVICE_LOGIN_SUBJECT_HINTS[key] ?? SERVICE_SUBJECT_HINTS[key];
    case "password_reset":
      return (
        SERVICE_PASSWORD_RESET_SUBJECT_HINTS[key] ??
        SERVICE_SUBJECT_HINTS[key] ??
        "reset"
      );
    default:
      return SERVICE_SUBJECT_HINTS[key];
  }
}

export function formatSubjectHintsForDocs(max = 12): string {
  return Object.entries(SERVICE_SUBJECT_HINTS)
    .slice(0, max)
    .map(([s, h]) => `${s}="${h}"`)
    .join(", ");
}

export function resolveTtlMinutes(
  service?: string,
  explicit?: number
): number | undefined {
  if (explicit != null && Number.isFinite(explicit) && explicit > 0) {
    return Math.floor(explicit);
  }
  const key = service?.trim().toLowerCase();
  return key ? SERVICE_TTL_MINUTES[key] : undefined;
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
