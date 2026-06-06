#!/usr/bin/env node
/** Запуск всех contract-qa против prod (только MAILAGENT_API_KEY) */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

const scripts = [
  "contract-qa.mjs",
  "contract-qa-agent.mjs",
  "contract-qa-callback.mjs",
  "contract-qa-attachments.mjs",
  "contract-qa-threads.mjs",
  "contract-qa-domains.mjs",
  "contract-qa-search.mjs",
  "contract-qa-extract.mjs",
  "contract-qa-console.mjs",
  "contract-qa-audit.mjs",
  "contract-qa-console-inbox.mjs",
  "contract-qa-team-keys.mjs",
];

for (const name of scripts) {
  console.log("\n---", name, "---");
  const r = spawnSync("node", [path.join(root, "scripts", name)], {
    stdio: "inherit",
    env: process.env,
  });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

console.log("\ntest:contract:all OK");
