#!/usr/bin/env node
/** CI: twine upload only when local pyproject version is ahead of PyPI */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pkgDir = join(root, "packages/mailagent-agent-py");
const pyproject = readFileSync(join(pkgDir, "pyproject.toml"), "utf8");
const versionMatch = pyproject.match(/^version\s*=\s*"([^"]+)"/m);
if (!versionMatch) {
  console.error("publish-if-new-pypi: version not found in pyproject.toml");
  process.exit(1);
}

const name = "mailagent-agent";
const version = versionMatch[1];

let published = null;
try {
  const res = await fetch(`https://pypi.org/pypi/${name}/json`);
  if (res.ok) {
    const data = await res.json();
    published = data.info?.version ?? null;
  }
} catch {
  published = null;
}

if (published === version) {
  console.log(`skip ${name}@${version} — already on PyPI`);
  process.exit(0);
}

if (!process.env.PYPI_API_TOKEN) {
  console.error(
    `publish-if-new-pypi: ${name}@${version} not on PyPI (latest: ${published ?? "—"}) — set PYPI_API_TOKEN`
  );
  process.exit(1);
}

console.log(`publish ${name}@${version} (pypi: ${published ?? "—"})`);
execSync("python3 -m pip install --quiet --upgrade build twine", { stdio: "inherit" });
execSync("python3 -m build", { stdio: "inherit", cwd: pkgDir });
execSync("python3 -m twine upload dist/*", {
  stdio: "inherit",
  cwd: pkgDir,
  env: {
    ...process.env,
    TWINE_USERNAME: "__token__",
    TWINE_PASSWORD: process.env.PYPI_API_TOKEN,
  },
});
