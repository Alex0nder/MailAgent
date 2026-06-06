#!/usr/bin/env node
/** Проверка структуры Codex plugin + smoke npm package. */
import { readFileSync, accessSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const pluginRoot = path.join(root, "examples/codex/plugin");

const required = [
  ".codex-plugin/plugin.json",
  ".mcp.json",
  "README.md",
  "scripts/run-mailagent-mcp.sh",
  "skills/mailagent/SKILL.md",
  ".env.example",
];

for (const rel of required) {
  const p = path.join(pluginRoot, rel);
  try {
    accessSync(p);
  } catch {
    console.error("missing:", rel);
    process.exit(1);
  }
}

JSON.parse(readFileSync(path.join(pluginRoot, ".codex-plugin/plugin.json"), "utf8"));
JSON.parse(readFileSync(path.join(pluginRoot, ".mcp.json"), "utf8"));

const bash = spawnSync("bash", ["-n", path.join(pluginRoot, "scripts/run-mailagent-mcp.sh")]);
if (bash.status !== 0) {
  console.error("launcher bash -n failed", bash.stderr?.toString());
  process.exit(1);
}

const buildMcp = spawnSync("npm", ["run", "build:mcp"], {
  cwd: root,
  stdio: "inherit",
});
if (buildMcp.status !== 0) process.exit(buildMcp.status ?? 1);

const smoke = spawnSync(process.execPath, [path.join(root, "scripts/smoke-codex.mjs")], {
  stdio: "inherit",
});
if (smoke.status !== 0) process.exit(smoke.status ?? 1);

console.log("verify-codex-plugin OK");
