#!/usr/bin/env node
/** Aggregate results.json → paired summary (A/B or A/B/C) */
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
  const xs = vals.filter((v) => v !== null && v !== undefined);
  if (xs.length === 0) return null;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function pct(n) {
  if (n === null || n === undefined) return "—";
  return `${(n * 100).toFixed(1)}%`;
}

function fmt(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return typeof n === "number" ? n.toFixed(3) : String(n);
}

function rowMetrics(row) {
  return {
    accuracy: num(row.accuracy),
    latency: num(row.latency_ms),
    tokens_in: num(row.tokens_in),
    context_chars: num(row.context_chars),
    tokens_est: num(row.tokens_in_context_est),
    hallucination: row.hallucination,
  };
}

function main() {
  const { resultsDir } = parseArgs(process.argv);
  const jsonPath = path.join(resultsDir, "results.json");
  const csvPath = path.join(resultsDir, "results.csv");
  let rows;
  if (fs.existsSync(jsonPath)) {
    rows = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
  } else if (fs.existsSync(csvPath)) {
    rows = readCsv(csvPath);
  } else {
    console.error(`Missing ${jsonPath} or ${csvPath}`);
    process.exit(1);
  }

  const byQ = new Map();
  for (const row of rows) {
    if (row.error) continue;
    const id = row.question_id;
    if (!byQ.has(id)) byQ.set(id, {});
    byQ.get(id)[row.condition] = row;
  }

  const conditionsPresent = new Set(rows.map((r) => r.condition).filter(Boolean));
  const hasC = conditionsPresent.has("C");
  const paired = [];

  for (const [id, pair] of byQ) {
    if (!pair.A || !pair.B) continue;
    const a = rowMetrics(pair.A);
    const b = rowMetrics(pair.B);
    const c = pair.C ? rowMetrics(pair.C) : null;

    const entry = {
      question_id: id,
      accuracy_a: a.accuracy,
      accuracy_b: b.accuracy,
      accuracy_delta_b_vs_a: (b.accuracy ?? 0) - (a.accuracy ?? 0),
      hallucination_a: pair.A.hallucination,
      hallucination_b: pair.B.hallucination,
      latency_a: a.latency,
      latency_b: b.latency,
      tokens_in_a: a.tokens_in,
      tokens_in_b: b.tokens_in,
      context_chars_a: a.context_chars,
      context_chars_b: b.context_chars,
      ccr_context_chars_b: b.context_chars > 0 ? a.context_chars / b.context_chars : null,
      ccr_tokens_est_b: b.tokens_est > 0 ? a.tokens_est / b.tokens_est : null,
    };

    if (c) {
      entry.accuracy_c = c.accuracy;
      entry.accuracy_delta_c_vs_a = (c.accuracy ?? 0) - (a.accuracy ?? 0);
      entry.accuracy_delta_c_vs_b = (c.accuracy ?? 0) - (b.accuracy ?? 0);
      entry.hallucination_c = pair.C.hallucination;
      entry.latency_c = c.latency;
      entry.tokens_in_c = c.tokens_in;
      entry.context_chars_c = c.context_chars;
      entry.ccr_context_chars_c =
        c.context_chars > 0 ? a.context_chars / c.context_chars : null;
      entry.ccr_tokens_est_c = c.tokens_est > 0 ? a.tokens_est / c.tokens_est : null;
    }

    paired.push(entry);
  }

  writeCsv(path.join(resultsDir, "paired.csv"), paired);

  const summary = {
    results_dir: resultsDir,
    paired_questions: paired.length,
    conditions: [...conditionsPresent].sort(),
    mean_accuracy_a: mean(paired.map((p) => p.accuracy_a)),
    mean_accuracy_b: mean(paired.map((p) => p.accuracy_b)),
    mean_accuracy_c: hasC ? mean(paired.map((p) => p.accuracy_c)) : null,
    mean_accuracy_delta_b_vs_a: mean(paired.map((p) => p.accuracy_delta_b_vs_a)),
    mean_accuracy_delta_c_vs_a: hasC
      ? mean(paired.map((p) => p.accuracy_delta_c_vs_a))
      : null,
    mean_ccr_context_chars_b: mean(paired.map((p) => p.ccr_context_chars_b)),
    mean_ccr_context_chars_c: hasC
      ? mean(paired.map((p) => p.ccr_context_chars_c))
      : null,
    mean_ccr_tokens_est_b: mean(paired.map((p) => p.ccr_tokens_est_b)),
    mean_ccr_tokens_est_c: hasC ? mean(paired.map((p) => p.ccr_tokens_est_c)) : null,
    mean_latency_a_ms: mean(paired.map((p) => p.latency_a)),
    mean_latency_b_ms: mean(paired.map((p) => p.latency_b)),
    mean_latency_c_ms: hasC ? mean(paired.map((p) => p.latency_c)) : null,
    mean_tokens_in_a: mean(paired.map((p) => p.tokens_in_a)),
    mean_tokens_in_b: mean(paired.map((p) => p.tokens_in_b)),
    mean_tokens_in_c: hasC ? mean(paired.map((p) => p.tokens_in_c)) : null,
    hallucination_rate_a:
      paired.filter((p) => String(p.hallucination_a) === "true").length /
      Math.max(paired.length, 1),
    hallucination_rate_b:
      paired.filter((p) => String(p.hallucination_b) === "true").length /
      Math.max(paired.length, 1),
    hallucination_rate_c: hasC
      ? paired.filter((p) => String(p.hallucination_c) === "true").length /
        Math.max(paired.length, 1)
      : null,
    hypothesis_supported:
      (mean(paired.map((p) => p.accuracy_b)) ?? 0) >
        (mean(paired.map((p) => p.accuracy_a)) ?? 0) ||
      ((mean(paired.map((p) => p.accuracy_b)) ?? 0) >=
        (mean(paired.map((p) => p.accuracy_a)) ?? 0) &&
        (mean(paired.map((p) => p.ccr_context_chars_b)) ?? 0) >= 5 &&
        (paired.filter((p) => String(p.hallucination_b) === "true").length /
          Math.max(paired.length, 1)) <
          (paired.filter((p) => String(p.hallucination_a) === "true").length /
            Math.max(paired.length, 1))),
  };

  if (hasC) {
    const accA = summary.mean_accuracy_a ?? 0;
    const accB = summary.mean_accuracy_b ?? 0;
    const accC = summary.mean_accuracy_c ?? 0;
    const tokA = summary.mean_tokens_in_a ?? 0;
    const tokB = summary.mean_tokens_in_b ?? 0;
    const tokC = summary.mean_tokens_in_c ?? 0;
    summary.abc_ranking = {
      accuracy_best:
        accB >= accA && accB >= accC
          ? "B"
          : accC >= accA && accC >= accB
            ? "C"
            : "A",
      tokens_lowest:
        tokB <= tokA && tokB <= tokC
          ? "B"
          : tokC <= tokA && tokC <= tokB
            ? "C"
            : "A",
      quality_per_token_b: tokB > 0 ? accB / tokB : 0,
      quality_per_token_c: tokC > 0 ? accC / tokC : 0,
      quality_per_token_a: tokA > 0 ? accA / tokA : 0,
    };
  }

  fs.writeFileSync(
    path.join(resultsDir, "summary.json"),
    JSON.stringify(summary, null, 2)
  );

  let md = `# Context OS Eval Summary

- Results: \`${resultsDir}\`
- Paired questions: **${summary.paired_questions}**
- Conditions: **${summary.conditions.join(", ")}**

`;

  if (hasC) {
    md += `## A / B / C comparison

| Metric | A (full repo) | B (Context OS) | C (Hermes graph) |
|--------|---------------|----------------|------------------|
| Mean accuracy (0–3) | ${fmt(summary.mean_accuracy_a)} | ${fmt(summary.mean_accuracy_b)} | ${fmt(summary.mean_accuracy_c)} |
| Hallucination rate | ${pct(summary.hallucination_rate_a)} | ${pct(summary.hallucination_rate_b)} | ${pct(summary.hallucination_rate_c)} |
| Mean latency (ms) | ${fmt(summary.mean_latency_a_ms)} | ${fmt(summary.mean_latency_b_ms)} | ${fmt(summary.mean_latency_c_ms)} |
| Mean input tokens | ${fmt(summary.mean_tokens_in_a)} | ${fmt(summary.mean_tokens_in_b)} | ${fmt(summary.mean_tokens_in_c)} |
| Mean context chars | ${fmt(mean(paired.map((p) => p.context_chars_a)))} | ${fmt(mean(paired.map((p) => p.context_chars_b)))} | ${fmt(mean(paired.map((p) => p.context_chars_c)))} |
| CCR vs A (chars) | 1× | ${fmt(summary.mean_ccr_context_chars_b)}× | ${fmt(summary.mean_ccr_context_chars_c)}× |

**Best accuracy:** ${summary.abc_ranking.accuracy_best} · **Lowest tokens:** ${summary.abc_ranking.tokens_lowest}

`;
  } else {
    md += `| Metric | A (full baseline) | B (cores) | Δ |
|--------|-------------------|-----------|---|
| Mean accuracy (0–3) | ${fmt(summary.mean_accuracy_a)} | ${fmt(summary.mean_accuracy_b)} | ${fmt(summary.mean_accuracy_delta_b_vs_a)} |
| Hallucination rate | ${pct(summary.hallucination_rate_a)} | ${pct(summary.hallucination_rate_b)} | — |
| Mean latency (ms) | ${fmt(summary.mean_latency_a_ms)} | ${fmt(summary.mean_latency_b_ms)} | — |
| Mean context chars | ${fmt(mean(paired.map((p) => p.context_chars_a)))} | ${fmt(mean(paired.map((p) => p.context_chars_b)))} | — |
| **CCR (chars A/B)** | — | — | **${fmt(summary.mean_ccr_context_chars_b)}×** |

`;
  }

  md += `**Hypothesis B vs A (heuristic):** ${summary.hypothesis_supported ? "YES" : "NO"}

See \`paired.csv\` and \`summary.json\`.
`;

  fs.writeFileSync(path.join(resultsDir, "SUMMARY.md"), md);
  console.log(JSON.stringify(summary, null, 2));
  console.log(`Wrote ${resultsDir}/SUMMARY.md`);
}

main();
