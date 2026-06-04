#!/usr/bin/env node
/** Smoke: Codex MCP entrypoint resolvable (@mailagent/mcp on npm). */
import { spawnSync } from "node:child_process";

const pkg = "@mailagent/mcp@0.2.0";
console.log("smoke-codex → npm pack", pkg);

const view = spawnSync("npm", ["view", pkg, "version"], {
  encoding: "utf8",
  stdio: ["ignore", "pipe", "pipe"],
});
if (view.status !== 0) {
  console.error("npm view failed", view.stderr || view.stdout);
  process.exit(1);
}
console.log("npm version:", view.stdout.trim());

const script = new URL(
  "../examples/codex/plugin/scripts/run-mailagent-mcp.sh",
  import.meta.url
).pathname;
const bash = spawnSync("bash", ["-n", script], { encoding: "utf8" });
if (bash.status !== 0) {
  console.error("bash -n launcher failed", bash.stderr);
  process.exit(1);
}

console.log("OK — Codex launcher syntax valid (set MAILAGENT_API_KEY to run MCP)");
