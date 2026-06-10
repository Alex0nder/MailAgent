#!/usr/bin/env node
/** CI guard: examples/qa-pilot-starter installs and passes simulate test */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import "./load-env.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const starter = join(root, "examples/qa-pilot-starter");
const apiKey = process.env.MAILAGENT_API_KEY ?? process.env.API_KEY;

if (!apiKey) {
  console.error("test:qa-pilot-starter: set MAILAGENT_API_KEY");
  process.exit(1);
}

if (!existsSync(join(starter, "package.json"))) {
  console.error("missing", starter);
  process.exit(1);
}

function run(cmd, args, cwd) {
  const r = spawnSync(cmd, args, { cwd, stdio: "inherit", env: process.env });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

console.log("test:qa-pilot-starter →", starter, "\n");
run("npm", ["run", "build:qa"], root);
run("npm", ["install"], starter);
run("npm", ["install", join(root, "packages/mailagent-qa")], starter);
run("npx", ["playwright", "install", "chromium"], starter);
run("npm", ["test"], starter);
console.log("\ntest:qa-pilot-starter OK");
