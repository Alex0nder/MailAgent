#!/usr/bin/env node
/** Stage 0: router-only evaluation (keyword or semantic embeddings) */
import "../../scripts/load-env.mjs";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { routeQuestion, routeQuestionSemantic, routingScores } from "./lib/router.mjs";
import { writeCsv } from "./lib/csv.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const opts = {
    questions: path.join(__dirname, "questions.json"),
    out: null,
    pilot: false,
    semantic: false,
  };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--questions" && argv[i + 1]) opts.questions = argv[++i];
    else if (argv[i] === "--out" && argv[i + 1]) opts.out = argv[++i];
    else if (argv[i] === "--pilot") opts.pilot = true;
    else if (argv[i] === "--semantic") opts.semantic = true;
  }
  return opts;
}

async function main() {
  const opts = parseArgs(process.argv);
  const bank = JSON.parse(fs.readFileSync(opts.questions, "utf8"));
  let questions = bank.questions;
  if (opts.pilot && bank.pilot_ids) {
    const set = new Set(bank.pilot_ids);
    questions = questions.filter((q) => set.has(q.id));
  }

  const rows = [];
  let precSum = 0;
  let recSum = 0;
  let f1Sum = 0;

  for (const q of questions) {
    const routed = opts.semantic
      ? await routeQuestionSemantic(q.question)
      : routeQuestion(q.question);
    const expected = q.expected_cores ?? [];
    const scores = routingScores(expected, routed);
    precSum += scores.precision;
    recSum += scores.recall;
    f1Sum += scores.f1;

    rows.push({
      question_id: q.id,
      question: q.question,
      expected_cores: expected.join(";"),
      routed_cores: scores.actual.join(";"),
      precision: scores.precision.toFixed(3),
      recall: scores.recall.toFixed(3),
      f1: scores.f1.toFixed(3),
      match: scores.f1 >= 0.9 ? "pass" : scores.f1 >= 0.5 ? "partial" : "fail",
    });
  }

  const n = questions.length;
  const summary = {
    questions: n,
    mode: opts.semantic ? "semantic" : "keyword",
    mean_precision: (precSum / n).toFixed(3),
    mean_recall: (recSum / n).toFixed(3),
    mean_f1: (f1Sum / n).toFixed(3),
    target_f1: "0.900",
    verdict: f1Sum / n >= 0.9 ? "PASS" : f1Sum / n >= 0.8 ? "WARN" : "FAIL",
  };

  const outDir = opts.out ?? path.join(__dirname, "results", `route-${Date.now()}`);
  fs.mkdirSync(outDir, { recursive: true });
  writeCsv(path.join(outDir, "routing.csv"), rows);
  fs.writeFileSync(path.join(outDir, "routing-summary.json"), JSON.stringify(summary, null, 2));

  console.log(JSON.stringify(summary, null, 2));
  console.log(`Wrote ${outDir}/routing.csv`);
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
