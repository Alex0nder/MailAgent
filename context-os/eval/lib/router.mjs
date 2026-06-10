/** Route questions to context cores via routing-map.json (keyword or semantic) */
import fs from "node:fs";
import path from "node:path";
import { contextOsRoot } from "./paths.mjs";
import { cosineSimilarity, embedTexts } from "./embeddings.mjs";

export function loadRoutingMap() {
  const p = path.join(contextOsRoot(), "router", "routing-map.json");
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

export function loadRouterEmbeddings() {
  const p = path.join(contextOsRoot(), "router", "embeddings.json");
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Avoid "production" matching pattern "product". */
export function patternMatches(question, pattern) {
  const q = question.toLowerCase();
  const p = pattern.toLowerCase();
  if (/^[a-z0-9_:.+-]+$/i.test(p)) {
    const re = new RegExp(`(?<![a-z0-9])${escapeRe(p)}(?![a-z0-9])`, "i");
    return re.test(q);
  }
  return q.includes(p);
}

function scoreRoutes(question, map) {
  const scored = [];
  for (const route of map.routes) {
    let hits = 0;
    let maxLen = 0;
    for (const pattern of route.patterns) {
      if (patternMatches(question, pattern)) {
        hits++;
        maxLen = Math.max(maxLen, pattern.length);
      }
    }
    if (hits > 0) scored.push({ route, hits, maxLen });
  }
  scored.sort((a, b) => b.hits - a.hits || b.maxLen - a.maxLen);
  return scored;
}

/**
 * @param {string} question
 * @param {import('./router.mjs').RoutingMap} [map]
 * @returns {string[]} core ids
 */
export function routeQuestion(question, map = loadRoutingMap()) {
  const scored = scoreRoutes(question, map);
  if (scored.length === 0) return ["technical-core"];

  const bestHits = scored[0].hits;
  const bestLen = scored[0].maxLen;
  const matched = new Set();

  for (const { route, hits, maxLen } of scored) {
    if (hits < bestHits) break;
    if (hits === bestHits && maxLen < bestLen) break;
    for (const core of route.cores) matched.add(core);
  }

  return [...matched];
}

/** Semantic route: top route(s) by embedding similarity (+ merge within 0.02 of best). */
export async function routeQuestionSemantic(question, index = loadRouterEmbeddings()) {
  if (!index?.routes?.length) {
    return routeQuestion(question);
  }
  const [qVec] = await embedTexts([question]);
  return routeQuestionFromVector(qVec, index);
}

function routeQuestionFromVector(qVec, index) {
  const scored = index.routes.map((r) => ({
    cores: r.cores,
    score: cosineSimilarity(qVec, r.embedding),
  }));
  scored.sort((a, b) => b.score - a.score);
  const best = scored[0]?.score ?? 0;
  const threshold = best - 0.02;
  const matched = new Set();
  for (const row of scored) {
    if (row.score < threshold) break;
    for (const core of row.cores) matched.add(core);
  }
  if (matched.size === 0) return ["technical-core"];
  return [...matched];
}

/**
 * @param {string[]} expected
 * @param {string[]} actual
 */
export function routingScores(expected, actual) {
  const exp = new Set(expected);
  const act = new Set(actual);
  let intersection = 0;
  for (const c of exp) {
    if (act.has(c)) intersection++;
  }
  const precision = act.size === 0 ? 0 : intersection / act.size;
  const recall = exp.size === 0 ? 1 : intersection / exp.size;
  const f1 =
    precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
  return { precision, recall, f1, intersection, expected: [...exp], actual: [...act] };
}
