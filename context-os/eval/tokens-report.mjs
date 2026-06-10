#!/usr/bin/env node
/** Token spend analysis: A vs B vs C from results.json */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { writeCsv } from "./lib/csv.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PRICE_IN = Number(process.env.EVAL_PRICE_INPUT_PER_1M ?? "0.15");
const PRICE_OUT = Number(process.env.EVAL_PRICE_OUTPUT_PER_1M ?? "0.60");
const LABELS = { A: "full repo", B: "Context OS", C: "Hermes graph" };

function parseArgs(argv) {
  let resultsDir = null;
  for (let i = 2; i < argv.length; i++) {
    if (!argv[i].startsWith("-")) resultsDir = argv[i];
  }
  if (!resultsDir) {
    const base = path.join(__dirname, "results");
    const dirs = fs
      .readdirSync(base)
      .filter((d) => d.startsWith("run-"))
      .map((d) => path.join(base, d))
      .filter((d) => fs.existsSync(path.join(d, "results.json")))
      .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
    resultsDir = dirs[0];
  }
  if (!resultsDir) {
    console.error("Usage: node tokens-report.mjs <results-dir>");
    process.exit(1);
  }
  return { resultsDir };
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function sum(rows, fn) {
  return rows.reduce((a, r) => a + fn(r), 0);
}

function mean(rows, fn) {
  if (rows.length === 0) return 0;
  return sum(rows, fn) / rows.length;
}

function costUsd(tokensIn, tokensOut) {
  return (tokensIn / 1e6) * PRICE_IN + (tokensOut / 1e6) * PRICE_OUT;
}

function condTotals(rows, cond) {
  const xs = rows.filter((r) => r.condition === cond);
  const tin = sum(xs, (r) => num(r.tokens_in));
  const tout = sum(xs, (r) => num(r.tokens_out));
  return {
    count: xs.length,
    tokens_in: tin,
    tokens_out: tout,
    tokens_all: tin + tout,
    cost_usd: costUsd(tin, tout),
    mean_in: mean(xs, (r) => num(r.tokens_in)),
    mean_out: mean(xs, (r) => num(r.tokens_out)),
  };
}

function main() {
  const { resultsDir } = parseArgs(process.argv);
  const rows = JSON.parse(
    fs.readFileSync(path.join(resultsDir, "results.json"), "utf8")
  ).filter((r) => !r.error);

  const conditions = [...new Set(rows.map((r) => r.condition))].sort();
  const byQ = new Map();
  for (const r of rows) {
    if (!byQ.has(r.question_id)) byQ.set(r.question_id, {});
    byQ.get(r.question_id)[r.condition] = r;
  }

  const perQuestion = [];
  for (const [id, pair] of byQ) {
    if (!pair.A || !pair.B) continue;
    const row = { question_id: id };
    for (const c of conditions) {
      if (!pair[c]) continue;
      const tin = num(pair[c].tokens_in);
      const tout = num(pair[c].tokens_out);
      row[`tokens_in_${c.toLowerCase()}`] = tin;
      row[`tokens_out_${c.toLowerCase()}`] = tout;
      row[`cost_usd_${c.toLowerCase()}`] = costUsd(tin, tout);
    }
    if (pair.A && pair.B) {
      row.ccr_in_b = row.tokens_in_b > 0 ? row.tokens_in_a / row.tokens_in_b : null;
    }
    if (pair.A && pair.C) {
      row.ccr_in_c = row.tokens_in_c > 0 ? row.tokens_in_a / row.tokens_in_c : null;
    }
    perQuestion.push(row);
  }

  const totals = {};
  for (const c of conditions) totals[c] = condTotals(rows, c);

  const summary = {
    results_dir: resultsDir,
    model: rows[0]?.model ?? "unknown",
    paired_questions: perQuestion.length,
    conditions,
    price_per_1m: { input_usd: PRICE_IN, output_usd: PRICE_OUT },
    per_condition: totals,
    savings_vs_a: {},
  };

  for (const c of conditions) {
    if (c === "A") continue;
    const aCost = totals.A?.cost_usd ?? 0;
    const cCost = totals[c]?.cost_usd ?? 0;
    summary.savings_vs_a[c] = {
      cost_saved_usd: aCost - cCost,
      cost_savings_pct: aCost > 0 ? ((aCost - cCost) / aCost) * 100 : 0,
      input_tokens_saved: (totals.A?.tokens_in ?? 0) - (totals[c]?.tokens_in ?? 0),
      input_savings_pct:
        totals.A?.tokens_in > 0
          ? ((totals.A.tokens_in - totals[c].tokens_in) / totals.A.tokens_in) * 100
          : 0,
      ccr_input_tokens:
        totals[c]?.tokens_in > 0 ? totals.A.tokens_in / totals[c].tokens_in : null,
    };
  }

  writeCsv(path.join(resultsDir, "tokens-paired.csv"), perQuestion);
  fs.writeFileSync(
    path.join(resultsDir, "tokens-summary.json"),
    JSON.stringify(summary, null, 2)
  );

  let md = `# Token Spend — A / B / C

- Run: \`${resultsDir}\`
- Model: **${summary.model}**
- Conditions: **${conditions.join(", ")}**

## Per answer (mean input tokens)

| Condition | Label | Mean input | Mean output | Est. cost (session) |
|-----------|-------|------------|-------------|---------------------|
`;

  for (const c of conditions) {
    const t = totals[c];
    md += `| ${c} | ${LABELS[c] ?? c} | ${Math.round(t.mean_in).toLocaleString()} | ${Math.round(t.mean_out)} | $${t.cost_usd.toFixed(4)} |\n`;
  }

  md += `\n## Savings vs A (full repo)\n\n`;
  for (const c of conditions) {
    if (c === "A") continue;
    const s = summary.savings_vs_a[c];
    md += `### ${c} (${LABELS[c]})\n`;
    md += `- Input tokens: **−${s.input_savings_pct.toFixed(1)}%** (CCR **${s.ccr_input_tokens?.toFixed(1) ?? "—"}×**)\n`;
    md += `- Answer cost: **−${s.cost_savings_pct.toFixed(1)}%** ($${s.cost_saved_usd.toFixed(4)} saved)\n\n`;
  }

  md += `Judge calls not included. See \`tokens-paired.csv\`.\n`;
  fs.writeFileSync(path.join(resultsDir, "TOKENS.md"), md);
  console.log(JSON.stringify(summary, null, 2));
  console.log(`Wrote ${resultsDir}/TOKENS.md`);
}

main();
