#!/usr/bin/env node
/** Sync Context OS manifest + marked core sections from repo source of truth */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  collectStats,
  formatMcpTools,
  formatServicePresets,
  gitHead,
  patchFile,
  relPath,
} from "./lib/context-os-sync.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const contextOs = join(root, "context-os");
const manifestPath = join(contextOs, "manifest.json");
const productCore = join(contextOs, "cores/product-core.md");

const stats = collectStats(root);
const head = gitHead(root);
const syncedAt = new Date().toISOString();

const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
manifest.productVersion = stats.productVersion;
manifest.mcpServerVersion = stats.mcpServerVersion;
manifest.sourceCommit = head.full;
manifest.sourceCommitShort = head.short;
manifest.syncedAt = syncedAt;
manifest.stats = {
  mcpTools: stats.mcpTools,
  dbMigrations: stats.dbMigrations,
  docsMd: stats.docsMd,
  srcTsFiles: stats.srcTsFiles,
  npmPackages: 3,
  githubWorkflows: stats.githubWorkflows,
  servicePresets: stats.servicePresets,
};
manifest.syncSources = [
  "src/mcp/manifest.ts",
  "src/lib/service-presets.ts",
  "package.json",
  "migrations/",
  ".github/workflows/",
];

writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.log("sync:context-os →", relPath(root, manifestPath));
console.log(`  commit ${head.short ?? "?"} · mcp ${stats.mcpServerVersion} · tools ${stats.mcpTools}`);

patchFile(productCore, [
  [
    "service-presets",
    `Presets (${stats.servicePresets}): ${formatServicePresets(stats.servicePresetNames)} — source: \`src/lib/service-presets.ts\`.`,
  ],
  [
    "mcp-tools",
    `${stats.mcpTools} tools (MCP server \`${stats.mcpServerVersion}\`):\n\n${formatMcpTools(stats.mcpToolNames)}`,
  ],
]);
console.log("sync:context-os →", relPath(root, productCore));

console.log("\nsync:context-os OK");
