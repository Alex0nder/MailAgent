#!/usr/bin/env node
/** Push STRIPE_* from .dev.vars to Cloudflare Worker secrets */
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync, spawnSync } from "node:child_process";
import "./load-env.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const devVars = join(root, ".dev.vars");

const STRIPE_KEYS = ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "STRIPE_PRICE_PRO"];

function parse(path) {
  const out = {};
  if (!existsSync(path)) return out;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i === -1) continue;
    out[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
  return out;
}

const vars = parse(devVars);
const missing = STRIPE_KEYS.filter((k) => !vars[k]?.trim());

if (missing.length) {
  console.error("Missing in .dev.vars:", missing.join(", "));
  console.error("\nRun: npm run wizard:stripe");
  console.error("Guide: docs/STRIPE-SETUP.md");
  process.exit(1);
}

for (const key of STRIPE_KEYS) {
  const val = vars[key].trim();
  console.log(`→ wrangler secret put ${key}`);
  execSync(`npx wrangler secret put ${key}`, {
    cwd: root,
    input: val,
    stdio: ["pipe", "inherit", "inherit"],
  });
}

console.log("\nDone. Verify:");
const apiKey = process.env.MAILAGENT_API_KEY ?? process.env.API_KEY;
if (apiKey) {
  const r = spawnSync("npm", ["run", "test:contract:qa:billing"], {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, MAILAGENT_API_KEY: apiKey },
  });
  if (r.status !== 0) process.exit(r.status ?? 1);
} else {
  console.log("  npm run doctor:billing");
  console.log("  npm run test:contract:qa:billing");
}
