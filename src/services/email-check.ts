/** Email check — self-contained (inspired by check-if-email-exists, no Reacher dependency) */
import type { Env } from "../env";
import { isDisposableDomain } from "../lib/disposable-domains";
import { parseEmailSyntax } from "../lib/email-syntax";
import { lookupMxRecords } from "../lib/mx-lookup";

export type Reachability = "safe" | "risky" | "invalid" | "unknown";

export type EmailCheckResult = {
  email: string;
  source: "local";
  isReachable: Reachability;
  syntax: {
    isValidSyntax: boolean;
    username: string;
    domain: string;
  };
  misc: {
    isDisposable: boolean;
    isRoleAccount: boolean;
    isB2c: boolean | null;
  };
  mx: {
    acceptsMail: boolean;
    records: string[];
  };
  smtp: {
    canConnectSmtp: boolean | null;
    isDeliverable: boolean | null;
    isDisabled: boolean | null;
    hasFullInbox: boolean | null;
    isCatchAll: boolean | null;
  };
  hint?: string;
};

const ROLE_LOCAL_PARTS = new Set([
  "admin",
  "info",
  "support",
  "sales",
  "contact",
  "help",
  "noreply",
  "no-reply",
  "postmaster",
  "webmaster",
  "abuse",
]);

function isRoleAccount(username: string): boolean {
  const local = username.split("+")[0]?.toLowerCase() ?? "";
  return ROLE_LOCAL_PARTS.has(local);
}

function inferReachability(input: {
  disposable: boolean;
  role: boolean;
  acceptsMail: boolean;
}): Reachability {
  if (input.disposable || !input.acceptsMail) return "invalid";
  if (input.role) return "risky";
  return "safe";
}

export async function checkEmailAddress(
  env: Env,
  input: { email: string }
): Promise<EmailCheckResult | { error: "invalid_email" }> {
  void env;
  const parsed = parseEmailSyntax(input.email);
  if (!parsed) return { error: "invalid_email" };

  const disposable = isDisposableDomain(parsed.domain);
  const role = isRoleAccount(parsed.username);
  const mx = await lookupMxRecords(parsed.domain);
  const isReachable = inferReachability({
    disposable,
    role,
    acceptsMail: mx.acceptsMail,
  });

  return {
    email: parsed.email,
    source: "local",
    isReachable,
    syntax: {
      isValidSyntax: true,
      username: parsed.username,
      domain: parsed.domain,
    },
    misc: {
      isDisposable: disposable,
      isRoleAccount: role,
      isB2c: null,
    },
    mx: {
      acceptsMail: mx.acceptsMail,
      records: mx.records,
    },
    smtp: {
      canConnectSmtp: null,
      isDeliverable: null,
      isDisabled: null,
      hasFullInbox: null,
      isCatchAll: null,
    },
    hint:
      "Mailbox-level SMTP verify is not available on Cloudflare Workers (no port 25). MailAgent checks syntax, disposable domains, role accounts, and MX records via DNS.",
  };
}
