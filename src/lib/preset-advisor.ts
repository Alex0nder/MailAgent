import {
  SERVICE_EXPECT_FROM,
  resolveExpectFrom,
  resolveSubjectHint,
  resolveTtlMinutes,
  type ServiceFlow,
} from "./service-presets";

export type PresetAdvisorFlow =
  | ServiceFlow
  | "invite_accept"
  | "magic_link_login";

export type PresetAdvisorConfidence = "high" | "medium" | "low";

export interface PresetAdviceInput {
  service?: string;
  from?: string;
  subject?: string;
  text?: string;
  html?: string;
  flow?: PresetAdvisorFlow | string;
}

export interface PresetAdvice {
  service: string;
  knownPreset: boolean;
  confidence: PresetAdvisorConfidence;
  reason: string;
  flow: ServiceFlow;
  flowTemplate: "signup" | "login_2fa" | "password_reset" | "invite_accept" | "magic_link_login";
  expectFrom: string[];
  subjectContains: string;
  timeoutSeconds: number;
  ttlMinutes?: number;
  extraction: {
    expectedPrimaryAction: Array<"otp" | "magic_link" | "link">;
    structuredPreset?: "2fa" | "magic_link" | "invite";
  };
  snippets: {
    createInbox: Record<string, unknown>;
    verifySignup: Record<string, unknown>;
    mcp: string;
    playwright: string;
  };
  warnings: string[];
}

type Candidate = {
  service: string;
  score: number;
  reasons: string[];
};

const KNOWN_SERVICES = Object.keys(SERVICE_EXPECT_FROM);

function normalize(raw?: string): string {
  return raw?.trim().toLowerCase() ?? "";
}

function visibleText(input: PresetAdviceInput): string {
  return [input.subject, input.text, input.html]
    .filter(Boolean)
    .join("\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractEmail(raw: string): string | undefined {
  const angle = raw.match(/<([^>]+)>/)?.[1];
  const source = angle ?? raw;
  return source.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i)?.[0]?.toLowerCase();
}

function extractDomain(raw?: string): string | undefined {
  const source = normalize(raw);
  if (!source) return undefined;
  const email = extractEmail(source);
  if (email?.includes("@")) return email.split("@")[1];
  const host = source.match(/[a-z0-9.-]+\.[a-z]{2,}/i)?.[0]?.toLowerCase();
  return host;
}

function senderMatchesRule(from: string, domain: string | undefined, rule: string): boolean {
  const normalizedRule = normalize(rule);
  if (!normalizedRule) return false;
  const email = extractEmail(from);
  if (normalizedRule.includes("@")) {
    return email === normalizedRule || from.includes(normalizedRule);
  }
  return (
    domain === normalizedRule ||
    Boolean(domain?.endsWith(`.${normalizedRule}`)) ||
    from.includes(normalizedRule)
  );
}

function containsServiceName(text: string, service: string): boolean {
  const escaped = service.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}\\b`, "i").test(text);
}

function serviceCandidates(input: PresetAdviceInput): Candidate[] {
  const requested = normalize(input.service);
  const from = normalize(input.from);
  const domain = extractDomain(input.from);
  const content = normalize(visibleText(input));
  const candidates = new Map<string, Candidate>();

  function add(service: string, score: number, reason: string) {
    const existing = candidates.get(service) ?? { service, score: 0, reasons: [] };
    existing.score += score;
    existing.reasons.push(reason);
    candidates.set(service, existing);
  }

  if (requested && SERVICE_EXPECT_FROM[requested]) {
    add(requested, 8, "explicit service preset");
  }

  for (const service of KNOWN_SERVICES) {
    const rules = SERVICE_EXPECT_FROM[service] ?? [];
    if (from && rules.some((rule) => senderMatchesRule(from, domain, rule))) {
      add(service, 6, "sender matches preset allowlist");
    }
    if (content && containsServiceName(content, service)) {
      add(service, 2, "sample text mentions service");
    }
  }

  return [...candidates.values()].sort((a, b) => b.score - a.score);
}

function parseFlow(input: PresetAdviceInput): {
  flow: ServiceFlow;
  flowTemplate: PresetAdvice["flowTemplate"];
} {
  const raw = normalize(input.flow);
  const text = normalize(visibleText(input));
  if (raw === "password_reset" || /\b(reset|password|recover|recovery)\b/.test(text)) {
    return { flow: "password_reset", flowTemplate: "password_reset" };
  }
  if (raw === "invite_accept" || /\b(invite|invited|join workspace|join team)\b/.test(text)) {
    return { flow: "signup", flowTemplate: "invite_accept" };
  }
  if (raw === "magic_link_login" || /\b(magic link|passwordless|sign in link)\b/.test(text)) {
    return { flow: "login", flowTemplate: "magic_link_login" };
  }
  if (
    raw === "login" ||
    /\b(sign[- ]?in|log[- ]?in|login|security code|two[- ]?factor|2fa)\b/.test(text)
  ) {
    return { flow: "login", flowTemplate: "login_2fa" };
  }
  return { flow: "signup", flowTemplate: "signup" };
}

function deriveSubjectHint(
  service: string | undefined,
  knownPreset: boolean,
  flow: ServiceFlow,
  flowTemplate: PresetAdvice["flowTemplate"],
  subject?: string
): string {
  const subjectText = normalize(subject);
  const presetHint = knownPreset ? resolveSubjectHint(service, flow) : undefined;
  if (flowTemplate === "invite_accept") return "invite";
  if (flowTemplate === "magic_link_login") {
    if (/\bsign[- ]?in\b/.test(subjectText)) return "sign in";
    if (/\blog[- ]?in\b/.test(subjectText)) return "login";
    return presetHint ?? "magic";
  }
  if (flow === "password_reset") return presetHint ?? "reset";
  if (flow === "login") {
    if (/\bsecurity code\b/.test(subjectText)) return "security code";
    if (/\bverification code\b/.test(subjectText)) return "verification code";
    if (/\bcode\b/.test(subjectText)) return "code";
    return presetHint ?? "sign in";
  }
  if (/\bconfirm\b/.test(subjectText)) return "confirm";
  if (/\bactivation\b/.test(subjectText)) return "activation";
  if (/\bverification\b/.test(subjectText)) return "verification";
  if (/\bverify\b/.test(subjectText)) return "verify";
  if (/\bcode\b/.test(subjectText)) return "code";
  return presetHint ?? "verify";
}

function extractionFor(
  flowTemplate: PresetAdvice["flowTemplate"],
  input: PresetAdviceInput
): PresetAdvice["extraction"] {
  const text = normalize(visibleText(input));
  if (flowTemplate === "invite_accept") {
    return { expectedPrimaryAction: ["magic_link", "link"], structuredPreset: "invite" };
  }
  if (flowTemplate === "magic_link_login") {
    return { expectedPrimaryAction: ["magic_link", "link"], structuredPreset: "magic_link" };
  }
  if (flowTemplate === "login_2fa") {
    return { expectedPrimaryAction: ["otp"], structuredPreset: "2fa" };
  }
  if (flowTemplate === "password_reset") {
    return { expectedPrimaryAction: ["magic_link", "link"], structuredPreset: "magic_link" };
  }
  if (/\b\d{6}\b/.test(text) || /\b(code|otp)\b/.test(text)) {
    return { expectedPrimaryAction: ["otp", "magic_link", "link"] };
  }
  return { expectedPrimaryAction: ["magic_link", "link", "otp"] };
}

function confidence(score: number, subject: string, knownPreset: boolean): PresetAdvisorConfidence {
  if (knownPreset && score >= 6 && subject) return "high";
  if (knownPreset || subject) return "medium";
  return "low";
}

function snippetText(
  createInbox: Record<string, unknown>,
  verifySignup: Record<string, unknown>,
  flowTemplate: PresetAdvice["flowTemplate"]
): { mcp: string; playwright: string } {
  const createJson = JSON.stringify(createInbox);
  const verifyJson = JSON.stringify(verifySignup);
  return {
    mcp:
      flowTemplate === "invite_accept"
        ? `mailagent_create_inbox ${createJson} -> wait for invite -> mailagent_extract_structured { "preset": "invite" }`
        : `mailagent_create_inbox ${createJson} -> mailagent_verify_signup ${verifyJson}`,
    playwright: [
      `const inbox = await mail.createInbox(${createJson});`,
      `await page.getByLabel(/email/i).fill(inbox.address);`,
      `await page.getByRole("button", { name: /sign up|continue|send/i }).click();`,
      `const result = await mail.verifySignup({ inboxId: inbox.id, ...${verifyJson} });`,
      `await usePrimaryAction(result.agent.primaryAction);`,
    ].join("\n"),
  };
}

export function suggestPreset(input: PresetAdviceInput = {}): PresetAdvice {
  const [best] = serviceCandidates(input);
  const requested = normalize(input.service);
  const explicitUnknown = requested && !SERVICE_EXPECT_FROM[requested];
  const knownPreset = Boolean(best?.service);
  const service = best?.service ?? (requested || "custom");
  const { flow, flowTemplate } = parseFlow(input);
  const subjectContains = deriveSubjectHint(
    best?.service,
    knownPreset,
    flow,
    flowTemplate,
    input.subject
  );
  const senderDomain = extractDomain(input.from);
  const expectFrom =
    resolveExpectFrom(best?.service) ??
    (senderDomain ? [senderDomain] : []);
  const timeoutSeconds = flow === "login" ? 90 : 120;
  const createInbox = knownPreset
    ? { service }
    : expectFrom.length
      ? { expectFrom }
      : {};
  const verifySignup = {
    ...(knownPreset ? { service } : expectFrom.length ? { expectFrom } : {}),
    flow,
    subjectContains,
    timeoutSeconds,
  };
  const snippetStrings = snippetText(createInbox, verifySignup, flowTemplate);
  const warnings: string[] = [];
  if (explicitUnknown) {
    warnings.push(`Unknown service preset "${requested}"; using sender-domain allowlist.`);
  }
  if (!input.from && !knownPreset) {
    warnings.push("Provide a From header to produce a tighter expectFrom allowlist.");
  }
  if (!input.subject) {
    warnings.push("Provide a sample subject to reduce timeout risk from subject filters.");
  }

  return {
    service,
    knownPreset,
    confidence: confidence(best?.score ?? 0, subjectContains, knownPreset),
    reason: best?.reasons.join("; ") ?? "No known preset matched; use custom expectFrom.",
    flow,
    flowTemplate,
    expectFrom,
    subjectContains,
    timeoutSeconds,
    ttlMinutes: resolveTtlMinutes(best?.service),
    extraction: extractionFor(flowTemplate, input),
    snippets: {
      createInbox,
      verifySignup,
      ...snippetStrings,
    },
    warnings,
  };
}
