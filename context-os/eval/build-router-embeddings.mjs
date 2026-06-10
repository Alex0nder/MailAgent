#!/usr/bin/env node
/** Build semantic router embeddings from routing-map.json */
import "../../scripts/load-env.mjs";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { embedTexts } from "./lib/embeddings.mjs";
import { loadRoutingMap } from "./lib/router.mjs";
import { contextOsRoot } from "./lib/paths.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function routeText(route) {
  const patterns = route.patterns.join("; ");
  const cores = route.cores.join(", ");
  return `${patterns} → ${cores}`;
}

async function main() {
  const map = loadRoutingMap();
  const routes = map.routes.map((route, index) => ({
    index,
    patterns: route.patterns,
    cores: route.cores,
    text: routeText(route),
  }));

  console.log(`Embedding ${routes.length} routes…`);
  const vectors = await embedTexts(routes.map((r) => r.text));
  const model = process.env.EVAL_EMBED_MODEL ?? "text-embedding-3-small";

  const out = {
    version: "1.0.0",
    model,
    builtAt: new Date().toISOString(),
    routes: routes.map((r, i) => ({
      index: r.index,
      cores: r.cores,
      patterns: r.patterns,
      text: r.text,
      embedding: vectors[i],
    })),
  };

  const dest = path.join(contextOsRoot(), "router", "embeddings.json");
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, `${JSON.stringify(out)}\n`, "utf8");
  console.log(`Wrote ${dest} (${routes.length} routes, ${model})`);
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
