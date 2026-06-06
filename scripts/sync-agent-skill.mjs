#!/usr/bin/env node
/** Sync canonical skills/mailagent/SKILL.md → Cursor + Codex plugin copies */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const canonical = join(root, "skills/mailagent/SKILL.md");
const body = readFileSync(canonical, "utf8");

const targets = [
  {
    path: join(root, ".cursor/skills/mailagent-mcp/SKILL.md"),
    name: "mailagent-mcp",
  },
  {
    path: join(root, "examples/codex/plugin/skills/mailagent/SKILL.md"),
    name: "mailagent",
  },
];

function withName(content, name) {
  return content.replace(/^name:\s*.+$/m, `name: ${name}`);
}

for (const { path: dest, name } of targets) {
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, withName(body, name), "utf8");
  console.log("sync:skills →", dest.replace(root + "/", ""));
}

console.log("sync:skills OK");
