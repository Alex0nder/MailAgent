/** Condition C: Hermes-style graph retrieval → subgraph + source snippets */
import fs from "node:fs";
import path from "node:path";
import { repoRoot, contextOsRoot } from "./paths.mjs";
import { routeQuestion } from "./router.mjs";
import { estimateTokens } from "./context-loader.mjs";

const DEFAULT_INDEX = path.join(contextOsRoot(), "graph", "graph-index.json");

function tokenize(text) {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length > 2)
  );
}

function scoreNode(node, qTokens) {
  const kws = new Set(node.keywords ?? []);
  for (const t of node.topics ?? []) kws.add(t.toLowerCase());
  if (node.label) tokenize(node.label).forEach((t) => kws.add(t));
  let score = 0;
  for (const t of qTokens) {
    if (kws.has(t)) score += 2;
    for (const k of kws) {
      if (k.includes(t) || t.includes(k)) score += 1;
    }
  }
  return score;
}

function neighbors(index, nodeId, kindFilter) {
  const out = [];
  for (const e of index.edges) {
    if (e.from === nodeId && (!kindFilter || e.kind === kindFilter)) out.push(e.to);
    if (e.to === nodeId && (!kindFilter || e.kind === kindFilter)) out.push(e.from);
  }
  return out;
}

function nodeById(index) {
  const m = new Map();
  for (const n of index.nodes) m.set(n.id, n);
  return m;
}

function readSnippet(root, relPath, maxChars) {
  const abs = path.join(root, relPath);
  if (!fs.existsSync(abs)) return null;
  const content = fs.readFileSync(abs, "utf8");
  if (content.length <= maxChars) return content;
  return `${content.slice(0, maxChars)}\n\n…[truncated ${relPath}]`;
}

/**
 * @param {string} question
 * @param {{ indexPath?: string, maxTotalChars?: number, maxFileChars?: number, maxFiles?: number, hops?: number }} [opts]
 */
export function loadGraphContext(question, opts = {}) {
  const indexPath = opts.indexPath ?? DEFAULT_INDEX;
  if (!fs.existsSync(indexPath)) {
    throw new Error(
      `Graph index missing at ${indexPath}. Run: node context-os/eval/build-graph-index.mjs`
    );
  }

  const index = JSON.parse(fs.readFileSync(indexPath, "utf8"));
  const root = repoRoot();
  const qTokens = tokenize(question);
  const byId = nodeById(index);
  const hops = opts.hops ?? 2;
  const maxTotal = opts.maxTotalChars ?? 80_000;
  const maxFile = opts.maxFileChars ?? 6_000;
  const maxFiles = opts.maxFiles ?? 18;

  // Seed from keyword scores + router concepts (graph entity search)
  const scores = new Map();
  for (const n of index.nodes) {
    const s = scoreNode(n, qTokens);
    if (s > 0) scores.set(n.id, s);
  }
  for (const coreId of routeQuestion(question)) {
    const bare = coreId.replace("-core", "").replace("audit/", "");
    const cid = `concept:${bare}`;
    if (byId.has(cid)) scores.set(cid, (scores.get(cid) ?? 0) + 5);
  }

  const seeds = [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([id]) => id);

  if (seeds.length === 0) {
    seeds.push("concept:technical", "file:README.md");
  }

  // BFS expand subgraph
  const visited = new Set(seeds);
  const frontier = [...seeds];
  for (let h = 0; h < hops; h++) {
    const next = [];
    for (const id of frontier) {
      for (const nb of neighbors(index, id)) {
        if (!visited.has(nb)) {
          visited.add(nb);
          next.push(nb);
        }
      }
    }
    frontier.length = 0;
    frontier.push(...next);
  }

  const subgraphNodes = [...visited].map((id) => byId.get(id)).filter(Boolean);
  const subgraphEdges = index.edges.filter(
    (e) => visited.has(e.from) && visited.has(e.to)
  );

  // Collect files to load (ranked by seed proximity score)
  const filePaths = new Map();
  for (const n of subgraphNodes) {
    if (n.type === "file" && n.path) {
      filePaths.set(n.path, (filePaths.get(n.path) ?? 0) + (scores.get(n.id) ?? 1));
    }
    if (n.source?.startsWith("context-os/")) {
      filePaths.set(n.source, (filePaths.get(n.source) ?? 0) + 3);
    }
    if (n.path && n.type === "module") {
      filePaths.set(n.path, (filePaths.get(n.path) ?? 0) + 2);
    }
  }

  const rankedFiles = [...filePaths.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxFiles)
    .map(([p]) => p);

  const parts = [];
  parts.push("## Knowledge graph (retrieved subgraph)\n");
  parts.push(`Seeds: ${seeds.join(", ")}\n`);
  parts.push(`Nodes (${subgraphNodes.length}):\n`);
  for (const n of subgraphNodes.slice(0, 40)) {
    parts.push(`- [${n.type}] ${n.label ?? n.id}\n`);
  }
  parts.push(`\nEdges (${subgraphEdges.length}):\n`);
  for (const e of subgraphEdges.slice(0, 60)) {
    parts.push(`- ${e.from} --${e.kind}--> ${e.to}\n`);
  }

  parts.push("\n## Source snippets (graph-linked)\n");
  const filesLoaded = [];
  let total = parts.join("").length;

  for (const relPath of rankedFiles) {
    const snippet = readSnippet(root, relPath, maxFile);
    if (!snippet) continue;
    const chunk = `\n\n--- FILE: ${relPath} ---\n${snippet}`;
    if (total + chunk.length > maxTotal) {
      const room = maxTotal - total;
      if (room > 500) {
        parts.push(chunk.slice(0, room));
        filesLoaded.push(`${relPath} (partial)`);
      }
      break;
    }
    parts.push(chunk);
    filesLoaded.push(relPath);
    total += chunk.length;
  }

  const text = parts.join("");
  return {
    condition: "C",
    graphStyle: "hermes",
    seeds,
    subgraph_nodes: subgraphNodes.length,
    subgraph_edges: subgraphEdges.length,
    files: filesLoaded,
    text,
    chars: text.length,
    tokens_est: estimateTokens(text),
  };
}
