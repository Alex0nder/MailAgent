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

const rpcInput = [
  {
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "mailagent-codex-smoke", version: "0.0.0" },
    },
  },
  { jsonrpc: "2.0", method: "notifications/initialized", params: {} },
  { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} },
]
  .map((line) => JSON.stringify(line))
  .join("\n");

const tools = spawnSync("bash", [script], {
  encoding: "utf8",
  input: `${rpcInput}\n`,
  env: {
    ...process.env,
    MAILAGENT_API_URL: process.env.MAILAGENT_API_URL ?? "https://api.webmailagent.com",
    MAILAGENT_API_KEY: process.env.MAILAGENT_API_KEY ?? "mailagent_codex_smoke_redacted",
  },
  timeout: 30000,
});
if (tools.status !== 0) {
  console.error("MCP tools/list failed", tools.stderr || tools.stdout);
  process.exit(1);
}

const toolLines = tools.stdout
  .split(/\r?\n/)
  .filter((line) => line.trim().startsWith("{"));
const listResponse = toolLines
  .map((line) => JSON.parse(line))
  .find((msg) => msg.id === 2);
const names = new Set(listResponse?.result?.tools?.map((tool) => tool.name));
for (const requiredTool of ["mailagent_verify_signup", "mailagent_create_inbox"]) {
  if (!names.has(requiredTool)) {
    console.error(`missing MCP tool: ${requiredTool}`);
    process.exit(1);
  }
}

console.log("OK — Codex launcher resolves MCP tools:", Array.from(names).join(", "));
