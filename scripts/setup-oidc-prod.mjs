#!/usr/bin/env node
/** Push OIDC_* from .dev.vars to Cloudflare Worker secrets (after Auth0 app setup) */
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const devVars = join(root, ".dev.vars");

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
const required = ["OIDC_ISSUER", "OIDC_CLIENT_ID", "OIDC_CLIENT_SECRET"];
const missing = required.filter((k) => !vars[k]?.trim());

if (missing.length) {
  console.error("Missing in .dev.vars:", missing.join(", "));
  console.error("\n1. Auth0 → Application → Regular Web App");
  console.error("2. Callback: https://api.webmailagent.com/v1/oauth/callback");
  console.error("3. Add to .dev.vars:");
  console.error("   OIDC_ISSUER=https://YOUR-TENANT.us.auth0.com");
  console.error("   OIDC_CLIENT_ID=...");
  console.error("   OIDC_CLIENT_SECRET=...");
  console.error("\nGuide: docs/MCP-OAUTH-IDP.md");
  process.exit(1);
}

for (const key of [...required, "OIDC_AUDIENCE"]) {
  const val = vars[key]?.trim();
  if (!val) continue;
  console.log(`→ wrangler secret put ${key}`);
  execSync(`npx wrangler secret put ${key}`, {
    cwd: root,
    input: val,
    stdio: ["pipe", "inherit", "inherit"],
  });
}

console.log("\nDone. Verify:");
console.log("  curl -sS https://api.webmailagent.com/v1/agent -H \"Authorization: Bearer $MAILAGENT_API_KEY\" | jq .auth.oidc");
