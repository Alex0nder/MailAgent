#!/usr/bin/env node
/** Verify canonical Agent Skill + synced copies match */
import { readFileSync, accessSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const canonical = join(root, "skills/mailagent/SKILL.md");

try {
  accessSync(canonical);
} catch {
  console.error("missing: skills/mailagent/SKILL.md");
  process.exit(1);
}

const text = readFileSync(canonical, "utf8");
if (!text.startsWith("---\n")) {
  console.error("skills/mailagent/SKILL.md: missing YAML frontmatter");
  process.exit(1);
}
const end = text.indexOf("\n---\n", 4);
if (end === -1) {
  console.error("skills/mailagent/SKILL.md: unclosed frontmatter");
  process.exit(1);
}
const fm = text.slice(4, end);
for (const key of ["name: mailagent", "description:", "homepage:", "repository:"]) {
  if (!fm.includes(key)) {
    console.error("skills/mailagent/SKILL.md: frontmatter missing", key);
    process.exit(1);
  }
}

const sync = spawnSync(process.execPath, [join(root, "scripts/sync-agent-skill.mjs")], {
  stdio: "inherit",
});
if (sync.status !== 0) process.exit(sync.status ?? 1);

console.log("verify:skills OK");
