#!/usr/bin/env node
/** Build Codex plugin tarball for marketplace / manual publish */
import { readFileSync, mkdirSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const pluginRoot = path.join(root, "examples/codex/plugin");
const manifest = JSON.parse(
  readFileSync(path.join(pluginRoot, ".codex-plugin/plugin.json"), "utf8")
);
const mcpPkg = JSON.parse(
  readFileSync(path.join(root, "mcp/package.json"), "utf8")
);

const launcher = readFileSync(
  path.join(pluginRoot, "scripts/run-mailagent-mcp.sh"),
  "utf8"
);
const pin = `@mailagent/mcp@${mcpPkg.version}`;
if (!launcher.includes(pin)) {
  console.error(
    `package-codex: run-mailagent-mcp.sh must pin ${pin} (found mismatch with mcp/package.json)`
  );
  process.exit(1);
}

const verify = spawnSync("npm", ["run", "verify:skills"], {
  cwd: root,
  stdio: "inherit",
});
if (verify.status !== 0) process.exit(verify.status ?? 1);

const verifyCodex = spawnSync("npm", ["run", "verify:codex"], {
  cwd: root,
  stdio: "inherit",
});
if (verifyCodex.status !== 0) process.exit(verifyCodex.status ?? 1);

const outDir = path.join(root, "dist");
if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

const archive = path.join(outDir, `mailagent-codex-plugin-${manifest.version}.tar.gz`);
const tar = spawnSync(
  "tar",
  [
    "-czf",
    archive,
    "--exclude",
    ".env",
    "-C",
    path.join(root, "examples/codex"),
    "plugin",
  ],
  { stdio: "inherit" }
);
if (tar.status !== 0) process.exit(tar.status ?? 1);

console.log("package-codex OK", archive);
console.log("Submit via Codex marketplace or install locally from examples/codex/plugin");
