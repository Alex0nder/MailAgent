/** Route questions to context cores via routing-map.json */
import fs from "node:fs";
import path from "node:path";
import { contextOsRoot } from "./paths.mjs";

export function loadRoutingMap() {
  const p = path.join(contextOsRoot(), "router", "routing-map.json");
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

/**
 * @param {string} question
 * @param {import('./router.mjs').RoutingMap} [map]
 * @returns {string[]} core ids
 */
export function routeQuestion(question, map = loadRoutingMap()) {
  const q = question.toLowerCase();
  const matched = new Set();

  for (const route of map.routes) {
    for (const pattern of route.patterns) {
      if (q.includes(pattern.toLowerCase())) {
        for (const core of route.cores) {
          matched.add(core);
        }
      }
    }
  }

  if (matched.size === 0) {
    return ["technical-core"];
  }

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
