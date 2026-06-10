#!/usr/bin/env node
/** Print copy-paste pilot invite (no secrets) — docs/PILOT-INVITE.md */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const slug = process.argv[2] ?? "acme-pilot";
const teamLabel = slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const template = readFileSync(join(root, "docs/PILOT-INVITE.md"), "utf8");
const block = template.split("## Email / Slack template")[1]?.split("## After")[0] ?? "";

console.log(`Pilot invite — ${slug} (${teamLabel})\n`);
console.log("─".repeat(60));
console.log(block.replace(/ACME/g, teamLabel).replace(/acme-pilot/g, slug).trim());
console.log("─".repeat(60));
console.log(`
Next: issue scoped key (local only — public repo, never log keys in CI):

  # add DATABASE_URL to .env (Neon / GitHub secret copy)
  npm run issue:pilot-key -- ${slug}

Send the ma_… key separately. Guide: docs/PILOT-ONBOARD.md
`);
