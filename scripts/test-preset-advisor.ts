import { suggestPreset } from "../src/lib/preset-advisor";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function assertIncludes(value: string | string[], expected: string, msg: string) {
  const haystack = Array.isArray(value) ? value.join(" ") : value;
  assert(haystack.toLowerCase().includes(expected.toLowerCase()), msg);
}

function main() {
  const auth0 = suggestPreset({
    from: "Auth0 <no-reply@auth0.com>",
    subject: "Verify your email",
    text: "Click the button to verify your account.",
  });
  assert(auth0.service === "auth0", "auth0 service detected");
  assert(auth0.knownPreset, "auth0 known preset");
  assert(auth0.confidence === "high", "auth0 confidence high");
  assert(auth0.flow === "signup", "auth0 signup flow");
  assertIncludes(auth0.subjectContains, "verify", "auth0 subject hint");
  assert(auth0.snippets.verifySignup.service === "auth0", "auth0 snippet service");

  const supabase = suggestPreset({
    from: "Supabase <noreply@mail.supabase.io>",
    subject: "Confirm your signup",
    html: "<a href='https://example.supabase.co/auth/v1/verify'>Confirm</a>",
  });
  assert(supabase.service === "supabase", "supabase service detected");
  assert(supabase.subjectContains === "confirm", "supabase confirm subject");
  assertIncludes(supabase.expectFrom, "supabase.io", "supabase expectFrom");

  const reset = suggestPreset({
    from: "support@auth0.com",
    subject: "Reset your password",
  });
  assert(reset.flow === "password_reset", "password reset flow");
  assert(reset.flowTemplate === "password_reset", "password reset template");
  assert(reset.extraction.structuredPreset === "magic_link", "reset magic link extract");

  const custom = suggestPreset({
    from: "Staging Auth <auth@mail.staging.acme.test>",
    subject: "Your verification code is 123456",
    text: "Use code 123456 to continue.",
  });
  assert(custom.service === "custom", "custom service fallback");
  assert(!custom.knownPreset, "custom unknown preset");
  assertIncludes(custom.expectFrom, "mail.staging.acme.test", "custom expectFrom domain");
  assert(custom.subjectContains === "verification", "custom subject hint");
  assert(custom.extraction.expectedPrimaryAction.includes("otp"), "custom OTP expected");

  const invite = suggestPreset({
    service: "notion",
    from: "Notion <notify@makenotion.com>",
    subject: "Alex invited you to Acme Workspace",
  });
  assert(invite.flowTemplate === "invite_accept", "invite template");
  assert(invite.subjectContains === "invite", "invite subject hint");
  assert(invite.extraction.structuredPreset === "invite", "invite structured preset");

  console.log("test-preset-advisor OK");
}

main();
