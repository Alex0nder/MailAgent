#!/usr/bin/env node
/** Build Hermes-style code graph index: files, concepts, import edges */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { repoRoot, contextOsRoot } from "./lib/paths.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(contextOsRoot(), "graph", "graph-index.json");

function walkTs(dir, files = []) {
  if (!fs.existsSync(dir)) return files;
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) walkTs(full, files);
    else if (name.endsWith(".ts")) files.push(full);
  }
  return files;
}

function rel(root, abs) {
  return path.relative(root, abs).replace(/\\/g, "/");
}

function parseImports(content) {
  const targets = [];
  const re = /from\s+["']([^"']+)["']/g;
  let m;
  while ((m = re.exec(content))) {
    targets.push(m[1]);
  }
  return targets;
}

function resolveImport(fromFile, spec, root) {
  if (!spec.startsWith(".") && !spec.startsWith("@/")) return null;
  const base = path.dirname(fromFile);
  let candidate = path.resolve(base, spec);
  const tryExt = [".ts", "/index.ts"];
  for (const ext of tryExt) {
    const p = candidate.endsWith(".ts") ? candidate : candidate + ext;
    if (fs.existsSync(p)) return rel(root, p);
  }
  return null;
}

function tokenize(text) {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 2);
}

function main() {
  const root = repoRoot();
  const manifest = JSON.parse(
    fs.readFileSync(path.join(contextOsRoot(), "manifest.json"), "utf8")
  );

  /** @type {Map<string, object>} */
  const nodes = new Map();
  /** @type {object[]} */
  const edges = [];

  function addNode(id, node) {
    if (!nodes.has(id)) nodes.set(id, node);
    else Object.assign(nodes.get(id), node);
  }

  // Concept nodes from Context OS manifest (graph "community" summaries)
  for (const c of manifest.cores ?? []) {
    addNode(`concept:${c.id}`, {
      id: `concept:${c.id}`,
      type: "concept",
      label: c.id,
      topics: c.topics ?? [],
      keywords: tokenize(`${c.id} ${(c.topics ?? []).join(" ")}`),
      source: `context-os/${c.file}`,
    });
  }
  for (const s of manifest.subcores ?? []) {
    addNode(`concept:${s.id}`, {
      id: `concept:${s.id}`,
      type: "concept",
      label: s.id,
      parent: s.parent,
      keywords: tokenize(`${s.id} ${s.parent}`),
      source: `context-os/${s.file}`,
    });
  }

  // File nodes from src + key docs
  const tsFiles = walkTs(path.join(root, "src"));
  const docRoots = ["README.md", "AGENTS.md", "SETUP.md"];
  for (const d of docRoots) {
    const abs = path.join(root, d);
    if (fs.existsSync(abs)) tsFiles.push(abs);
  }
  for (const d of ["docs/QA.md", "docs/CI.md", "docs/BILLING.md"]) {
    const abs = path.join(root, d);
    if (fs.existsSync(abs)) tsFiles.push(abs);
  }

  for (const abs of tsFiles) {
    const r = rel(root, abs);
    const content = fs.readFileSync(abs, "utf8");
    const basename = path.basename(r, path.extname(r));
    const keywords = tokenize(`${r} ${basename} ${content.slice(0, 2000)}`);
    addNode(`file:${r}`, {
      id: `file:${r}`,
      type: "file",
      label: r,
      path: r,
      keywords,
      chars: content.length,
    });

    for (const spec of parseImports(content)) {
      const target = resolveImport(abs, spec, root);
      if (target) {
        edges.push({ from: `file:${r}`, to: `file:${target}`, kind: "imports" });
      }
    }
  }

  // Link concepts to files via keyword overlap + manual anchors
  const anchors = {
    otp: ["src/services/extract.ts", "src/queue/consumer.ts", "src/routes/inboxes.ts"],
    email: ["src/routes/webhooks.ts", "src/queue/consumer.ts", "src/services/resend-mail.ts"],
    inbox: ["src/routes/inboxes.ts", "src/services/inbox.ts", "src/durable-objects/inbox-wait.ts"],
    api: ["src/openapi/spec.ts", "src/routes/inboxes.ts", "src/routes/agent.ts"],
    worker: ["src/index.ts", "src/queue/consumer.ts", "src/env.ts"],
    database: ["src/db/client.ts", "migrations/001_init.sql"],
    deployment: ["wrangler.jsonc", "SETUP.md", ".github/workflows/deploy-worker.yml"],
    security: ["src/lib/auth.ts", "src/lib/sender-allowlist.ts", "src/lib/scope-guard.ts"],
    business: ["README.md", "AGENTS.md"],
    product: ["README.md", "src/mcp/manifest.ts", "src/routes/agent.ts"],
    technical: ["src/index.ts", "wrangler.jsonc"],
    operational: ["docs/CI.md", "docs/AUTOTESTS.md", "AGENTS.md"],
  };

  for (const [concept, paths] of Object.entries(anchors)) {
    const cid = `concept:${concept}`;
    if (!nodes.has(cid)) continue;
    for (const p of paths) {
      const fid = `file:${p}`;
      if (nodes.has(fid)) {
        edges.push({ from: cid, to: fid, kind: "documents" });
      }
    }
  }

  // Route → handler file edges from src/routes
  const routesDir = path.join(root, "src/routes");
  if (fs.existsSync(routesDir)) {
    for (const name of fs.readdirSync(routesDir)) {
      if (!name.endsWith(".ts")) continue;
      const r = `src/routes/${name}`;
      addNode(`module:routes/${name.replace(".ts", "")}`, {
        id: `module:routes/${name.replace(".ts", "")}`,
        type: "module",
        label: name.replace(".ts", ""),
        keywords: tokenize(name),
        path: r,
      });
      edges.push({
        from: `module:routes/${name.replace(".ts", "")}`,
        to: `file:${r}`,
        kind: "implements",
      });
    }
  }

  const index = {
    version: "1.0.0",
    style: "hermes-graph",
    description:
      "Pre-indexed code graph for Condition C: entity relationships + source retrieval (GraphRAG-style, not full repo)",
    built_at: new Date().toISOString(),
    stats: {
      nodes: nodes.size,
      edges: edges.length,
    },
    nodes: [...nodes.values()],
    edges,
  };

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(index, null, 2));
  console.log(`Wrote ${OUT} (${index.stats.nodes} nodes, ${index.stats.edges} edges)`);
}

main();
