#!/usr/bin/env node
/** Pre-publish: build all packages and print versions */
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

const packages = [
  { name: "@mailagent/mcp", path: "mcp/package.json", build: "npm run build:mcp" },
  { name: "@mailagent/qa", path: "packages/mailagent-qa/package.json", build: "npm run build:qa" },
  { name: "@mailagent/agent", path: "packages/mailagent-agent/package.json", build: "npm run build:agent" },
];

console.log("MailAgent npm packages:\n");

for (const pkg of packages) {
  const json = JSON.parse(readFileSync(pkg.path, "utf8"));
  console.log(`  ${json.name}@${json.version}`);
}

console.log("\nBuilding…\n");
for (const pkg of packages) {
  execSync(pkg.build, { stdio: "inherit" });
}

console.log(`
Publish (requires npm login):

  npm run publish:mcp
  npm run publish:qa
  npm run publish:agent

Or:

  npm run publish:all
`);
