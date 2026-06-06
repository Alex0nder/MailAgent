/** Structured extraction: presets (rules) + optional Workers AI for custom schema */
import type { Env } from "../env";
import type { MessageRow } from "./inbox";
import {
  extractLinks,
  extractOtp,
  primaryLink,
} from "./extract";
import { formatMessageVerification } from "./message-verify";

export type ExtractPreset = "2fa" | "invoice" | "receipt";

export type StructuredExtractInput = {
  preset?: ExtractPreset;
  schema?: Record<string, unknown>;
};

export type StructuredExtractResult = {
  messageId: string;
  preset: ExtractPreset | null;
  extractor: "rules" | "ai" | "hybrid";
  data: Record<string, unknown>;
};

const PRESET_SCHEMAS: Record<ExtractPreset, Record<string, string>> = {
  "2fa": {
    otp: "string|null",
    links: "string[]",
    primaryLink: "string|null",
    from: "string",
    subject: "string",
    messageId: "string",
  },
  invoice: {
    invoiceNumber: "string|null",
    amount: "string|null",
    currency: "string|null",
    dueDate: "string|null",
    vendor: "string|null",
    from: "string",
    subject: "string",
  },
  receipt: {
    orderId: "string|null",
    total: "string|null",
    currency: "string|null",
    merchant: "string|null",
    purchaseDate: "string|null",
    from: "string",
    subject: "string",
  },
};

export function listExtractPresets(): {
  id: ExtractPreset;
  description: string;
  fields: string[];
}[] {
  return [
    {
      id: "2fa",
      description: "OTP codes and verification links (backward compatible)",
      fields: Object.keys(PRESET_SCHEMAS["2fa"]),
    },
    {
      id: "invoice",
      description: "Invoice number, amount, due date, vendor",
      fields: Object.keys(PRESET_SCHEMAS.invoice),
    },
    {
      id: "receipt",
      description: "Order id, total, merchant, purchase date",
      fields: Object.keys(PRESET_SCHEMAS.receipt),
    },
  ];
}

export async function extractStructuredFromMessage(
  env: Env,
  row: MessageRow,
  input: StructuredExtractInput
): Promise<
  | StructuredExtractResult
  | { error: "preset_or_schema_required" | "unknown_preset" | "ai_required_for_custom_schema" | "ai_extract_failed" }
> {
  const preset = input.preset;
  const customSchema = input.schema;

  if (!preset && !customSchema) {
    return { error: "preset_or_schema_required" };
  }

  if (preset && !(preset in PRESET_SCHEMAS)) {
    return { error: "unknown_preset" };
  }

  const text = messageBodyText(row);

  if (preset) {
    const rulesData = extractByPreset(preset, row, text);
    if (!env.AI || !customSchema) {
      return {
        messageId: row.id,
        preset,
        extractor: "rules",
        data: rulesData,
      };
    }
  }

  if (customSchema) {
    if (!env.AI) {
      return { error: "ai_required_for_custom_schema" };
    }
    const aiData = await aiExtract(env, text, customSchema);
    if (!aiData) return { error: "ai_extract_failed" };

    if (preset) {
      const rulesData = extractByPreset(preset, row, text);
      return {
        messageId: row.id,
        preset,
        extractor: "hybrid",
        data: { ...rulesData, ...aiData },
      };
    }

    return {
      messageId: row.id,
      preset: null,
      extractor: "ai",
      data: aiData,
    };
  }

  // preset only — already returned above; TypeScript guard
  const p = preset as ExtractPreset;
  return {
    messageId: row.id,
    preset: p,
    extractor: "rules",
    data: extractByPreset(p, row, text),
  };
}

function messageBodyText(row: MessageRow): string {
  return [row.subject, row.from_addr, row.text_preview ?? "", row.html_preview ?? ""]
    .join("\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractByPreset(
  preset: ExtractPreset,
  row: MessageRow,
  text: string
): Record<string, unknown> {
  switch (preset) {
    case "2fa":
      return extract2fa(row);
    case "invoice":
      return extractInvoice(row, text);
    case "receipt":
      return extractReceipt(row, text);
  }
}

function extract2fa(row: MessageRow): Record<string, unknown> {
  const v = formatMessageVerification(row);
  return {
    otp: v.otp,
    links: v.links,
    primaryLink: v.primaryLink,
    from: v.from,
    subject: v.subject,
    messageId: v.messageId,
    ...(v.hasRaw ? { hasRaw: true, rawUrl: v.rawUrl } : {}),
  };
}

function extractInvoice(row: MessageRow, text: string): Record<string, unknown> {
  const invoiceNumber =
    matchFirst(text, [
      /invoice\s*#?\s*:?\s*([A-Z0-9][A-Z0-9-]{2,})/i,
      /inv[-\s#.:]*([0-9]{4,})/i,
    ]) ?? null;

  const amountMatch =
    text.match(/\$\s*([\d,]+\.\d{2})/) ??
    text.match(/(?:amount|total)[:\s]*\$?\s*([\d,]+\.\d{2})/i);
  const amount = amountMatch?.[1]?.replace(/,/g, "") ?? null;

  const currency =
    (text.match(/\b(USD|EUR|GBP|RUB)\b/i)?.[1]?.toUpperCase() as string) ??
    (amount ? "USD" : null);

  const dueDate =
    matchFirst(text, [
      /due\s+(?:on|by|date)?[:\s]*([A-Za-z]+\s+\d{1,2},?\s+\d{4})/i,
      /due\s+(?:on|by|date)?[:\s]*(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})/i,
      /payment due[:\s]*([A-Za-z]+\s+\d{1,2})/i,
    ]) ?? null;

  const vendor = row.from_addr.replace(/^.*<([^>]+)>.*$/, "$1").split("@")[0] || row.from_addr;

  return {
    invoiceNumber,
    amount,
    currency,
    dueDate,
    vendor,
    from: row.from_addr,
    subject: row.subject,
  };
}

function extractReceipt(row: MessageRow, text: string): Record<string, unknown> {
  const orderId =
    matchFirst(text, [
      /order\s*#?\s*:?\s*([A-Z0-9][A-Z0-9-]{2,})/i,
      /receipt\s*#?\s*:?\s*([A-Z0-9][A-Z0-9-]{2,})/i,
      /confirmation\s*#?\s*:?\s*([A-Z0-9][A-Z0-9-]{2,})/i,
    ]) ?? null;

  const totalMatch =
    text.match(/total[:\s]*\$?\s*([\d,]+\.\d{2})/i) ??
    text.match(/\$\s*([\d,]+\.\d{2})/);
  const total = totalMatch?.[1]?.replace(/,/g, "") ?? null;

  const currency =
    (text.match(/\b(USD|EUR|GBP|RUB)\b/i)?.[1]?.toUpperCase() as string) ??
    (total ? "USD" : null);

  const purchaseDate =
    matchFirst(text, [
      /(?:purchased|ordered|date)[:\s]*([A-Za-z]+\s+\d{1,2},?\s+\d{4})/i,
      /(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})/,
    ]) ?? null;

  const merchant =
    row.from_addr.match(/^([^<]+)\s*</)?.[1]?.trim() ||
    row.from_addr.split("@")[1]?.split(">")[0] ||
    row.from_addr;

  return {
    orderId,
    total,
    currency,
    merchant,
    purchaseDate,
    from: row.from_addr,
    subject: row.subject,
  };
}

function matchFirst(text: string, patterns: RegExp[]): string | null {
  for (const p of patterns) {
    const m = text.match(p);
    if (m?.[1]) return m[1].trim();
  }
  return null;
}

type AiTextResponse = { response?: string };

async function aiExtract(
  env: Env,
  text: string,
  schema: Record<string, unknown>
): Promise<Record<string, unknown> | null> {
  if (!env.AI) return null;
  const model =
    env.EXTRACT_MODEL?.trim() || "@cf/meta/llama-3.1-8b-instruct";
  const fieldNames = Object.keys(schema.properties as object ?? schema);
  const prompt = `Extract structured data from the email below. Return ONLY a JSON object with these keys: ${fieldNames.join(", ")}. Use null for missing values. No markdown fences.

Email:
${text.slice(0, 10000)}`;

  try {
    const result = (await env.AI.run(model, {
      messages: [{ role: "user", content: prompt }],
      max_tokens: 800,
    })) as AiTextResponse;

    const raw = result.response?.trim();
    if (!raw) return null;

    const jsonText = raw
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();

    const parsed = JSON.parse(jsonText) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch (err) {
    console.error("ai structured extract failed", err);
    return null;
  }
}

/** Re-export for tests — rule-based 2fa from raw text */
export function extract2faFromText(row: MessageRow, combined: string) {
  const otp = extractOtp(combined);
  const links = extractLinks(combined);
  return {
    otp,
    links,
    primaryLink: primaryLink(links),
    from: row.from_addr,
    subject: row.subject,
    messageId: row.id,
  };
}
