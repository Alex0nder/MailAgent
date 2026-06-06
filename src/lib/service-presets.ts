/** expectFrom presets for popular services (agent / MCP / API) */

export const SERVICE_EXPECT_FROM: Record<string, string[]> = {
  dribbble: ["dribbble.com", "m.dribbble.com"],
  github: ["github.com", "noreply@github.com"],
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
