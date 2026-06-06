#!/usr/bin/env node
/** Check readiness for local run and deploy */
import "./load-env.mjs";
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

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

const merged = { ...process.env };

console.log("MailAgent setup check\n");

let ok = true;

if (!existsSync(join(root, ".dev.vars"))) {
  console.log("✗ .dev.vars — copy: cp .dev.vars.example .dev.vars");
  ok = false;
} else {
  console.log("✓ .dev.vars exists");
  for (const key of requiredDevVars) {
    const v = merged[key];
    if (
      !v ||
      v.includes("xxx") ||
      v.includes("your-id") ||
      v.includes("YOUR_PASSWORD") ||
      v.includes("placeholder")
    ) {
      console.log(`  ✗ ${key} — not set`);
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
  console.log("✓ mcp/dist/index.js");
}

if (!merged.MAILAGENT_API_KEY && merged.API_KEY) {
  console.log("ℹ For MCP add to .env: MAILAGENT_API_KEY=<same as API_KEY>");
}

if (!merged.OUTBOUND_FROM?.trim()) {
  console.log("ℹ OUTBOUND_FROM not set — inbound-only OK; see /docs/outbound.html for send/reply");
}

console.log(ok ? "\nReady for: npm run dev && npm run verify" : "\nFill in .dev.vars and retry: node scripts/setup-check.mjs");
process.exit(ok ? 0 : 1);
