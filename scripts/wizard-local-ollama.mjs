#!/usr/bin/env node
/** Preflight + start Docker Compose stack: Ollama + MailAgent local API. */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const composeFile = path.join(root, "examples/docker-compose.ollama.yml");
const devVars = path.join(root, ".dev.vars");

function run(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, { stdio: "inherit", cwd: root, ...opts });
  if (res.status !== 0) process.exit(res.status ?? 1);
}

function hasCmd(name) {
  return spawnSync("sh", ["-c", `command -v ${name}`], { stdio: "ignore" }).status === 0;
}

console.log("MailAgent local stack (Ollama + wrangler dev)\n");

if (!hasCmd("docker")) {
  console.error("docker not found — install Docker Desktop: https://docs.docker.com/get-docker/");
  process.exit(1);
}

const compose = spawnSync("docker", ["compose", "version"], { stdio: "ignore" });
if (compose.status !== 0) {
  console.error("docker compose plugin not found");
  process.exit(1);
}

if (!fs.existsSync(devVars)) {
  console.error("Missing .dev.vars — copy from .dev.vars.example and fill DATABASE_URL, RESEND_*, API_KEY, INBOX_DOMAIN");
  console.error("  cp .dev.vars.example .dev.vars");
  process.exit(1);
}

const model = process.env.OLLAMA_MODEL || "llama3.2";
console.log(`Model: ${model}`);
console.log(`Compose: ${composeFile}\n`);
console.log("Starting… API → http://127.0.0.1:8787  Ollama → http://127.0.0.1:11434\n");
console.log("Probe (after healthy):");
console.log('  curl -s -X POST -H "Authorization: Bearer $API_KEY" http://127.0.0.1:8787/v1/workspace/models/probe | jq\n');

run("docker", ["compose", "-f", composeFile, "up", "--build", ...process.argv.slice(2)], {
  env: { ...process.env, OLLAMA_MODEL: model },
});
