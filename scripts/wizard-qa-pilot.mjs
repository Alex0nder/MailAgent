#!/usr/bin/env node
/** QA pilot wizard — validate API key, doctor:qa, smoke:qa, print next steps */
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import "./load-env.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const apiUrl = (process.env.MAILAGENT_API_URL ?? "https://api.webmailagent.com").replace(
  /\/$/,
  ""
);
const apiKey = process.env.MAILAGENT_API_KEY ?? process.env.API_KEY;

console.log("MailAgent QA pilot wizard\n");
console.log(`API: ${apiUrl}\n`);

if (!apiKey) {
  console.error("✗ Set MAILAGENT_API_KEY in .env or environment");
  console.log("\nGet a key: https://webmailagent.com/dashboard.html");
  console.log("Guide: docs/QA-PILOT.md");
  process.exit(1);
}

console.log("✓ API key in env\n");

function run(label, cmd, args) {
  console.log(`── ${label} ──`);
  const r = spawnSync(cmd, args, { cwd: root, stdio: "inherit", env: process.env });
  if (r.status !== 0) {
    console.error(`\n✗ ${label} failed`);
    process.exit(r.status ?? 1);
  }
  console.log("");
}

run("doctor:qa", "npm", ["run", "doctor:qa"]);
run("smoke:qa", "npm", ["run", "smoke:qa"]);

console.log("QA pilot baseline OK\n");
console.log("Next steps:");
console.log("  1. Copy examples/github-actions/qa-email.yml → your test repo");
console.log("  2. npm install @mailagent/qa — see examples/playwright/");
console.log("  3. Label convention: ci-$GITHUB_RUN_ID");
console.log("  4. Full guide: docs/QA-PILOT.md · https://webmailagent.com/docs/qa.html");
console.log("\nSimulate-only CI (no staging mail): examples/github-actions/qa-simulate-only.yml");
