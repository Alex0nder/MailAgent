#!/usr/bin/env node
/** Pre-publish: build packages + compare local vs npm registry versions */
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

const packages = [
  { name: "@mailagent/mcp", path: "mcp/package.json", build: "npm run build:mcp" },
  { name: "@mailagent/qa", path: "packages/mailagent-qa/package.json", build: "npm run build:qa" },
  {
    name: "@mailagent/agent",
    path: "packages/mailagent-agent/package.json",
    build: "npm run build:agent",
  },
];

function npmLatest(name) {
  try {
    return execSync(`npm view ${name} version`, { encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

console.log("MailAgent npm packages:\n");

let needsPublish = false;
for (const pkg of packages) {
  const json = JSON.parse(readFileSync(pkg.path, "utf8"));
  const published = npmLatest(json.name);
  const flag =
    published && published !== json.version
      ? "↑ publish"
      : published
        ? "ok"
        : "new";
  if (flag !== "ok") needsPublish = true;
  console.log(
    `  ${json.name}@${json.version}  (npm: ${published ?? "—"})  ${flag}`
  );
}

console.log("\nBuilding…\n");
for (const pkg of packages) {
  execSync(pkg.build, { stdio: "inherit" });
}

console.log(`
Publish (requires npm login or NPM_TOKEN in CI):

  npm run publish:all

Or tag push / workflow_dispatch:

  git tag v0.27.0 && git push origin v0.27.0

GitHub secret: NPM_TOKEN → .github/workflows/publish-packages.yml
`);

if (needsPublish) {
  console.log("Note: at least one package is ahead of npm — run publish when ready.\n");
}
