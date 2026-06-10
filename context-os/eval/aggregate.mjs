#!/usr/bin/env node
/** Aggregate results.csv → summary.json + markdown report */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readCsv, writeCsv } from "./lib/csv.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  let resultsDir = null;
  for (let i = 2; i < argv.length; i++) {
    if (!argv[i].startsWith("-")) resultsDir = argv[i];
  }
  if (!resultsDir) {
    const base = path.join(__dirname, "results");
    if (!fs.existsSync(base)) {
      console.error("Usage: node aggregate.mjs <results-dir>");
      process.exit(1);
    }
    const dirs = fs
      .readdirSync(base)
      .map((d) => path.join(base, d))
      .filter((d) => fs.statSync(d).isDirectory())
      .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
    resultsDir = dirs[0];
  }
  return { resultsDir };
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function mean(vals) {
  const xs = vals.filter((v) => v !== null);
  if (xs.length === 0) return null;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function main() {
  const { resultsDir } = parseArgs(process.argv);
  const csvPath = path.join(resultsDir, "results.csv");
  if (!fs.existsSync(csvPath)) {
    console.error(`Missing ${csvPath}`);
    process.exit(1);
  }

  const rows = readCsv(csvPath);
  const byQ = new Map();

  for (const row of rows) {
    if (row.error) continue;
    const id = row.question_id;
    if (!byQ.has(id)) byQ.set(id, {});
    byQ.get(id)[row.condition] = row;
  }

  const paired = [];
  for (const [id, pair] of byQ) {
    if (!pair.A || !pair.B) continue;
    const a = pair.A;
    const b = pair.B;
    const ccr =
      num(b.tokens_in_context_est) > 0
        ? num(a.tokens_in_context_est) / num(b.tokens_in_context_est)
        : null;
    paired.push({
      question_id: id,
      accuracy_a: num(a.accuracy),
      accuracy_b: num(b.accuracy),
      accuracy_delta: (num(b.accuracy) ?? 0) - (num(a.accuracy) ?? 0),
      hallucination_a: a.hallucination,
      hallucination_b: b.hallucination,
      latency_a: num(a.latency_ms),
      latency_b: num(b.latency_ms),
      tokens_in_a: num(a.tokens_in),
      tokens_in_b: num(b.tokens_in),
      context_chars_a: num(a.context_chars),
      context_chars_b: num(b.context_chars),
      ccr_context_chars:
        num(b.context_chars) > 0 ? num(a.context_chars) / num(b.context_chars) : null,
      ccr_tokens_est: ccr,
    });
  }

  writeCsv(path.join(resultsDir, "paired.csv"), paired);

  const summary = {
    results_dir: resultsDir,
    paired_questions: paired.length,
    mean_accuracy_a: mean(paired.map((p) => p.accuracy_a)),
    mean_accuracy_b: mean(paired.map((p) => p.accuracy_b)),
    mean_accuracy_delta: mean(paired.map((p) => p.accuracy_delta)),
    mean_ccr_context_chars: mean(paired.map((p) => p.ccr_context_chars)),
    mean_ccr_tokens_est: mean(paired.map((p) => p.ccr_tokens_est)),
    mean_latency_a_ms: mean(paired.map((p) => p.latency_a)),
    mean_latency_b_ms: mean(paired.map((p) => p.latency_b)),
    hallucination_rate_a:
      paired.filter((p) => String(p.hallucination_a) === "true").length /
      Math.max(paired.length, 1),
    hallucination_rate_b:
      paired.filter((p) => String(p.hallucination_b) === "true").length /
      Math.max(paired.length, 1),
    hypothesis_supported:
      (mean(paired.map((p) => p.accuracy_b)) ?? 0) >
        (mean(paired.map((p) => p.accuracy_a)) ?? 0) ||
      ((mean(paired.map((p) => p.accuracy_b)) ?? 0) >=
        (mean(paired.map((p) => p.accuracy_a)) ?? 0) &&
        (mean(paired.map((p) => p.ccr_context_chars)) ?? 0) >= 5 &&
        (paired.filter((p) => String(p.hallucination_b) === "true").length /
          Math.max(paired.length, 1)) <
          (paired.filter((p) => String(p.hallucination_a) === "true").length /
            Math.max(paired.length, 1))),
  };

  fs.writeFileSync(
    path.join(resultsDir, "summary.json"),
    JSON.stringify(summary, null, 2)
  );

  const md = `# Context OS Eval Summary

- Results: \`${resultsDir}\`
- Paired questions: **${summary.paired_questions}**

| Metric | A (full baseline) | B (cores) | Δ |
|--------|-------------------|-----------|---|
| Mean accuracy (0–3) | ${fmt(summary.mean_accuracy_a)} | ${fmt(summary.mean_accuracy_b)} | ${fmt(summary.mean_accuracy_delta)} |
| Hallucination rate | ${pct(summary.hallucination_rate_a)} | ${pct(summary.hallucination_rate_b)} | — |
| Mean latency (ms) | ${fmt(summary.mean_latency_a_ms)} | ${fmt(summary.mean_latency_b_ms)} | — |
| Mean context chars | ${fmt(mean(paired.map((p) => p.context_chars_a)))} | ${fmt(mean(paired.map((p) => p.context_chars_b)))} | — |
| **CCR (chars A/B)** | — | — | **${fmt(summary.mean_ccr_context_chars)}×** |

**Hypothesis supported (heuristic):** ${summary.hypothesis_supported ? "YES" : "NO"}

See \`paired.csv\` and \`summary.json\`.
`;

  fs.writeFileSync(path.join(resultsDir, "SUMMARY.md"), md);
  console.log(JSON.stringify(summary, null, 2));
  console.log(`Wrote ${resultsDir}/SUMMARY.md`);
}

function fmt(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return typeof n === "number" ? n.toFixed(3) : String(n);
}

function pct(n) {
  if (n === null || n === undefined) return "—";
  return `${(n * 100).toFixed(1)}%`;
}

main();
