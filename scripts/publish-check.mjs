#!/usr/bin/env node
/** Pre-publish: build packages + compare local vs npm registry versions */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";

const pyprojectPath = join("packages/mailagent-agent-py/pyproject.toml");

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

const pyproject = readFileSync(pyprojectPath, "utf8");
const pyVersion = pyproject.match(/^version\s*=\s*"([^"]+)"/m)?.[1];
let pypiLatest = null;
if (pyVersion) {
  try {
    const res = await fetch("https://pypi.org/pypi/mailagent-agent/json");
    if (res.ok) {
      const data = await res.json();
      pypiLatest = data.info?.version ?? null;
    }
  } catch {
    pypiLatest = null;
  }
  const pyFlag =
    pypiLatest && pypiLatest !== pyVersion
      ? "↑ publish"
      : pypiLatest
        ? "ok"
        : "new";
  if (pyFlag !== "ok") needsPublish = true;
  console.log(`\n  mailagent-agent@${pyVersion}  (pypi: ${pypiLatest ?? "—"})  ${pyFlag}`);
}

console.log(`
Publish (requires npm login or NPM_TOKEN in CI):

  npm run publish:all

Python (PyPI token):

  PYPI_API_TOKEN=pypi-… npm run publish:agent-py

Or tag push / workflow_dispatch:

  git tag v0.27.0 && git push origin v0.27.0

GitHub secrets: NPM_TOKEN (optional) · PYPI_API_TOKEN → publish-packages.yml
`);

if (needsPublish) {
  console.log("Note: at least one package is ahead of registry — run publish when ready.\n");
}
