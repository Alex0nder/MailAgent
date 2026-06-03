#!/usr/bin/env node
/** Диагностика окружения: .dev.vars, DB, prod API, webhook */
import "./load-env.mjs";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { neon } from "@neondatabase/serverless";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const requiredDevVars = [
  "DATABASE_URL",
  "RESEND_API_KEY",
  "RESEND_WEBHOOK_SECRET",
  "API_KEY",
  "INBOX_DOMAIN",
];

function parseDevVars(path) {
  if (!existsSync(path)) return {};
  const out = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i === -1) continue;
    out[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
  return out;
}

const merged = { ...parseDevVars(join(root, ".dev.vars")), ...process.env };

let ok = true;
const notes = [];

console.log("MailAgent doctor\n");

if (!existsSync(join(root, ".dev.vars"))) {
  console.log("✗ .dev.vars missing — cp .dev.vars.example .dev.vars");
  ok = false;
} else {
  console.log("✓ .dev.vars");
  for (const key of requiredDevVars) {
    const v = merged[key];
    if (
      !v ||
      v.includes("xxx") ||
      v.includes("your-id") ||
      v.includes("YOUR_PASSWORD") ||
      v.includes("placeholder")
    ) {
      console.log(`  ✗ ${key}`);
      ok = false;
    } else {
      console.log(`  ✓ ${key}`);
    }
  }
}

if (!existsSync(join(root, "mcp/dist/index.js"))) {
  console.log("✗ MCP not built — npm run build:mcp");
  ok = false;
} else {
  console.log("✓ mcp/dist");
}

if (merged.DATABASE_URL && !merged.DATABASE_URL.includes("placeholder")) {
  try {
    const sql = neon(merged.DATABASE_URL);
    await sql`SELECT 1`;
    console.log("✓ DATABASE_URL connects");

    const migDir = join(root, "migrations");
    const files = readdirSync(migDir).filter((f) => f.endsWith(".sql")).sort();
    const latest = files[files.length - 1];
    const tableCheck = await sql`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_name = 'message_attachments'
      ) AS ok
    `;
    const hasAtt = tableCheck[0]?.ok;
    if (latest?.startsWith("010") && !hasAtt) {
      console.log("✗ schema behind — run: npm run db:migrate");
      ok = false;
    } else {
      console.log(`✓ migrations (latest file: ${latest})`);
    }
  } catch (e) {
    console.log("✗ DATABASE_URL:", e instanceof Error ? e.message : e);
    ok = false;
  }
} else {
  notes.push("Skip DB check (no DATABASE_URL)");
}

const apiUrl = (merged.MAILAGENT_API_URL ?? "https://api.webmailagent.com").replace(
  /\/$/,
  ""
);
const apiKey = merged.MAILAGENT_API_KEY ?? merged.API_KEY;

if (apiKey) {
  try {
    const health = await fetch(`${apiUrl}/health`);
    const healthJson = await health.json().catch(() => ({}));
    console.log(
      health.ok ? "✓" : "✗",
      `GET ${apiUrl}/health`,
      health.status,
      healthJson.webhook ?? ""
    );
    if (!health.ok) ok = false;

    const me = await fetch(`${apiUrl}/v1/me`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    const meJson = await me.json().catch(() => ({}));
    console.log(
      me.ok ? "✓" : "✗",
      "GET /v1/me",
      me.ok ? `activeInboxes=${meJson.usage?.activeInboxes ?? "?"}` : meJson.error
    );
    if (!me.ok) ok = false;
  } catch (e) {
    console.log("✗ API check failed:", e instanceof Error ? e.message : e);
    ok = false;
  }
} else {
  notes.push("Skip API check (set MAILAGENT_API_KEY or API_KEY)");
}

console.log("\nResend inbound webhook (prod/local):");
console.log(`  POST ${apiUrl}/webhooks/resend`);
console.log("  Resend Dashboard → Webhooks → email.received");

if (notes.length) {
  console.log("\nNotes:");
  for (const n of notes) console.log(`  • ${n}`);
}

console.log(
  ok
    ? "\nReady: npm run dev | npm run smoke:qa"
    : "\nFix issues above, then: npm run doctor"
);
process.exit(ok ? 0 : 1);
