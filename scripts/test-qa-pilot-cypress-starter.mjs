#!/usr/bin/env node
/** CI guard: examples/qa-pilot-cypress-starter simulate test */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import "./load-env.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const starter = join(root, "examples/qa-pilot-cypress-starter");
const apiKey = process.env.MAILAGENT_API_KEY ?? process.env.API_KEY;

if (!apiKey) {
  console.error("test:qa-pilot-cypress-starter: set MAILAGENT_API_KEY");
  process.exit(1);
}

function run(cmd, args, cwd) {
  const env = {
    ...process.env,
    CYPRESS_BASE_URL: process.env.CYPRESS_BASE_URL ?? "https://example.com",
  };
  const r = spawnSync(cmd, args, { cwd, stdio: "inherit", env });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

console.log("test:qa-pilot-cypress-starter →", starter, "\n");
run("npm", ["install"], starter);
run("npx", ["cypress", "install"], starter);
run("npm", ["test"], starter);
console.log("\ntest:qa-pilot-cypress-starter OK");
