#!/usr/bin/env node
/** CI: npm publish only when local version is ahead of registry */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { execSync } from "node:child_process";

const pkgPath = process.argv[2];
if (!pkgPath) {
  console.error("usage: publish-if-new.mjs <package.json path>");
  process.exit(1);
}

const abs = join(process.cwd(), pkgPath);
const dir = dirname(abs);
const json = JSON.parse(readFileSync(abs, "utf8"));
let published = null;
try {
  published = execSync(`npm view ${json.name} version`, { encoding: "utf8" }).trim();
} catch {
  published = null;
}

if (published === json.version) {
  console.log(`skip ${json.name}@${json.version} — already on npm`);
  process.exit(0);
}

console.log(`publish ${json.name}@${json.version} (npm: ${published ?? "—"})`);
execSync("npm publish --access public --provenance", { stdio: "inherit", cwd: dir });
