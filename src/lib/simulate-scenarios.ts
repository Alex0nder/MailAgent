/** QA simulate fixtures — one-shot presets for POST …/simulate and MCP. */

export type SimulateScenarioId =
  | "otp"
  | "magic_link"
  | "attachment"
  | "invite"
  | "invoice_fixture"
  | "login_2fa"
  | "password_reset";

export type SimulateScenarioFixture = {
  id: SimulateScenarioId;
  description: string;
  from: string;
  subject: string;
  otp: string;
  links: string[];
  textPreview: string;
  htmlPreview: string | null;
  attachmentFilename?: string;
  fireCallback?: boolean;
};

export const SIMULATE_SCENARIOS: Record<
  SimulateScenarioId,
  SimulateScenarioFixture
> = {
  otp: {
    id: "otp",
    description: "6-digit OTP verification email (default QA)",
    from: "noreply@github.com",
    subject: "Your GitHub verification code",
    otp: "482910",
    links: [],
    textPreview: "Your verification code is 482910",
    htmlPreview: null,
  },
  magic_link: {
    id: "magic_link",
    description: "Magic link signup — no OTP, primaryLink in body",
    from: "accounts@auth0.com",
    subject: "Verify your email address",
    otp: "",
    links: ["https://app.example.com/verify?token=ml_sim_9f3a2b"],
    textPreview:
      "Click to verify your account: https://app.example.com/verify?token=ml_sim_9f3a2b",
    htmlPreview:
      '<a href="https://app.example.com/verify?token=ml_sim_9f3a2b">Verify email</a>',
  },
  attachment: {
    id: "attachment",
    description: "OTP mail with PDF attachment (attachment pipeline)",
    from: "billing@stripe.com",
    subject: "Your verification code",
    otp: "119933",
    links: [],
    textPreview: "Your code is 119933. Invoice attached.",
    htmlPreview: null,
    attachmentFilename: "invoice.pdf",
  },
  invite: {
    id: "invite",
    description: "Team/workspace invite with accept link",
    from: "invite@slack.com",
    subject: "Alex invited you to Acme Workspace",
    otp: "",
    links: ["https://join.example.com/invite/team_sim_42"],
    textPreview:
      "Alex invited you to Acme Workspace. Accept: https://join.example.com/invite/team_sim_42",
    htmlPreview: null,
  },
  invoice_fixture: {
    id: "invoice_fixture",
    description: "Invoice body for extract preset tests",
    from: "billing@acme.com",
    subject: "Invoice #INV-8842 — $129.99 USD due March 15, 2026",
    otp: "",
    links: [],
    textPreview: "Please pay invoice INV-8842. Amount due $129.99 USD by March 15, 2026.",
    htmlPreview: null,
  },
  login_2fa: {
    id: "login_2fa",
    description: "Login / step-up 2FA code (not signup verify)",
    from: "noreply@github.com",
    subject: "Your GitHub sign-in verification code",
    otp: "773421",
    links: [],
    textPreview: "Your sign-in verification code is 773421",
    htmlPreview: null,
  },
  password_reset: {
    id: "password_reset",
    description: "Password reset link — magic_link style",
    from: "accounts@google.com",
    subject: "Reset your password",
    otp: "",
    links: ["https://accounts.example.com/reset?token=pr_sim_7c1d9e"],
    textPreview:
      "Reset your password: https://accounts.example.com/reset?token=pr_sim_7c1d9e",
    htmlPreview:
      '<a href="https://accounts.example.com/reset?token=pr_sim_7c1d9e">Reset password</a>',
  },
};

export function listSimulateScenarios(): SimulateScenarioFixture[] {
  return Object.values(SIMULATE_SCENARIOS);
}

export function resolveSimulateScenario(
  id: string | undefined
): SimulateScenarioFixture | null {
  const key = id?.trim() as SimulateScenarioId | undefined;
  return key && key in SIMULATE_SCENARIOS ? SIMULATE_SCENARIOS[key] : null;
}
