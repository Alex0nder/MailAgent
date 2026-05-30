/** Синхронно с src/lib/service-presets.ts */

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
};

export const SERVICE_NAMES = Object.keys(SERVICE_EXPECT_FROM) as [
  string,
  ...string[],
];

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
