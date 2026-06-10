/** Helpers for sync:context-os — extract repo facts and patch marked markdown sections */
import { execSync } from "node:child_process";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

export function gitHead(repoRoot) {
  try {
    const full = execSync("git rev-parse HEAD", { cwd: repoRoot, encoding: "utf8" }).trim();
    const short = execSync("git rev-parse --short HEAD", { cwd: repoRoot, encoding: "utf8" }).trim();
    return { full, short };
  } catch {
    return { full: null, short: null };
  }
}

export function countFiles(dir, predicate) {
  let n = 0;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) n += countFiles(p, predicate);
    else if (predicate(p, name)) n++;
  }
  return n;
}

export function extractMcpManifest(manifestPath) {
  const src = readFileSync(manifestPath, "utf8");
  const version = src.match(/version:\s*"([^"]+)"/)?.[1] ?? "unknown";
  const tools = [...src.matchAll(/name:\s*"(mailagent_[^"]+)"/g)].map((m) => m[1]);
  return { version, tools };
}

export function extractServicePresets(presetsPath) {
  const src = readFileSync(presetsPath, "utf8");
  const keys = [...src.matchAll(/^\s+([a-z0-9]+):\s*\[/gm)].map((m) => m[1]);
  return keys;
}

export function replaceSyncSection(content, id, body) {
  const start = `<!-- sync:${id}:start -->`;
  const end = `<!-- sync:${id}:end -->`;
  const block = `${start}\n${body.trim()}\n${end}`;
  const re = new RegExp(`${escapeRe(start)}[\\s\\S]*?${escapeRe(end)}`, "m");
  if (re.test(content)) {
    return content.replace(re, block);
  }
  return `${content.trim()}\n\n${block}\n`;
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function patchFile(filePath, patches) {
  let content = readFileSync(filePath, "utf8");
  for (const [id, body] of patches) {
    content = replaceSyncSection(content, id, body);
  }
  writeFileSync(filePath, content, "utf8");
}

export function collectStats(repoRoot) {
  const migrations = countFiles(join(repoRoot, "migrations"), (p) => p.endsWith(".sql"));
  const docsMd = countFiles(join(repoRoot, "docs"), (p) => p.endsWith(".md"));
  const srcTs = countFiles(join(repoRoot, "src"), (p) => p.endsWith(".ts"));
  const workflows = readdirSync(join(repoRoot, ".github/workflows")).filter((f) =>
    f.endsWith(".yml")
  ).length;
  const pkg = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8"));
  const presets = extractServicePresets(join(repoRoot, "src/lib/service-presets.ts"));
  const mcp = extractMcpManifest(join(repoRoot, "src/mcp/manifest.ts"));

  return {
    mcpTools: mcp.tools.length,
    mcpServerVersion: mcp.version,
    productVersion: pkg.version,
    dbMigrations: migrations,
    docsMd,
    srcTsFiles: srcTs,
    githubWorkflows: workflows,
    servicePresets: presets.length,
    servicePresetNames: presets,
    mcpToolNames: mcp.tools,
  };
}

export function formatServicePresets(names) {
  return names.map((n) => `\`${n}\``).join(", ");
}

export function formatMcpTools(tools) {
  return tools.map((t) => `- \`${t}\``).join("\n");
}

export function relPath(repoRoot, absPath) {
  return relative(repoRoot, absPath).replace(/\\/g, "/");
}
