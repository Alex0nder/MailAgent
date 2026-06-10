/** Load Condition A (baseline) or Condition B (cores) context */
import fs from "node:fs";
import path from "node:path";
import { coreIdToRelativePath, repoRoot, contextOsRoot } from "./paths.mjs";

function estimateTokens(text) {
  return Math.ceil(text.length / 4);
}

function readUtf8(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function walkDir(dir, extensions, files = []) {
  if (!fs.existsSync(dir)) return files;
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) {
      walkDir(full, extensions, files);
    } else if (extensions.some((ext) => name.endsWith(ext))) {
      files.push(full);
    }
  }
  return files;
}

/**
 * Condition B: routed cores only
 * @param {string[]} coreIds
 */
export function loadCoreContext(coreIds) {
  const root = repoRoot();
  const parts = [];
  const files = [];

  for (const id of coreIds) {
    const rel = coreIdToRelativePath(id);
    const abs = path.join(root, rel);
    if (!fs.existsSync(abs)) {
      parts.push(`<!-- missing core: ${id} at ${rel} -->\n`);
      continue;
    }
    const content = readUtf8(abs);
    parts.push(`\n\n--- FILE: ${rel} ---\n${content}`);
    files.push(rel);
  }

  const text = parts.join("");
  return {
    condition: "B",
    files,
    coreIds,
    text,
    chars: text.length,
    tokens_est: estimateTokens(text),
  };
}

/**
 * Condition A: baseline repo slice per baseline-manifest.json
 */
export function loadBaselineContext(manifestPath) {
  const root = repoRoot();
  const manifest = JSON.parse(readUtf8(manifestPath));
  const collected = [];

  for (const rel of manifest.includeRoots ?? []) {
    const abs = path.join(root, rel);
    if (fs.existsSync(abs)) {
      collected.push(abs);
    }
  }

  for (const { dir, extensions } of manifest.includeDirs ?? []) {
    const absDir = path.join(root, dir);
    walkDir(absDir, extensions, collected);
  }

  const exclude = manifest.excludePathContains ?? [];
  const filtered = collected.filter((abs) => {
    const rel = path.relative(root, abs);
    return !exclude.some((bit) => rel.includes(bit));
  });

  filtered.sort();

  const maxFile = manifest.maxFileChars ?? 14000;
  const maxTotal = manifest.maxTotalChars ?? 320000;
  const parts = [];
  const files = [];
  let total = 0;

  for (const abs of filtered) {
    if (total >= maxTotal) break;
    let content = readUtf8(abs);
    const rel = path.relative(root, abs);
    if (content.length > maxFile) {
      content = `${content.slice(0, maxFile)}\n\n…[truncated ${rel}]`;
    }
    const chunk = `\n\n--- FILE: ${rel} ---\n${content}`;
    if (total + chunk.length > maxTotal) {
      const room = maxTotal - total;
      parts.push(chunk.slice(0, room));
      files.push(`${rel} (partial)`);
      total = maxTotal;
      break;
    }
    parts.push(chunk);
    files.push(rel);
    total += chunk.length;
  }

  const text = parts.join("");
  return {
    condition: "A",
    files,
    text,
    chars: text.length,
    tokens_est: estimateTokens(text),
  };
}

export { estimateTokens };
