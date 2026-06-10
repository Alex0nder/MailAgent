#!/usr/bin/env node
/** A/B/C eval: A=full repo, B=Context OS cores, C=Hermes-style graph */
import "../../scripts/load-env.mjs";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { routeQuestion } from "./lib/router.mjs";
import { loadBaselineContext, loadCoreContext } from "./lib/context-loader.mjs";
import { loadGraphContext } from "./lib/graph-loader.mjs";
import { answerQuestion } from "./lib/llm.mjs";
import { judgeAnswer } from "./lib/judge.mjs";
import { writeCsv } from "./lib/csv.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const opts = {
    questions: path.join(__dirname, "questions.json"),
    baseline: path.join(__dirname, "baseline-manifest.json"),
    out: null,
    pilot: false,
    condition: "all",
    dryRun: false,
    skipJudge: false,
    ids: null,
    merge: null,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--questions" && argv[i + 1]) opts.questions = argv[++i];
    else if (a === "--baseline" && argv[i + 1]) opts.baseline = argv[++i];
    else if (a === "--out" && argv[i + 1]) opts.out = argv[++i];
    else if (a === "--pilot") opts.pilot = true;
    else if (a === "--condition" && argv[i + 1]) opts.condition = argv[++i];
    else if (a === "--ids" && argv[i + 1]) opts.ids = argv[++i].split(",");
    else if (a === "--dry-run") opts.dryRun = true;
    else if (a === "--skip-judge") opts.skipJudge = true;
    else if (a === "--merge" && argv[i + 1]) opts.merge = argv[++i];
    else if (a === "--help") {
      console.log(`Usage: node run-eval.mjs [options]
  --pilot           MA01-MA10 only
  --ids MA01,MA02   subset
  --condition a|b|c|both|all|abc
  --dry-run         context sizes only, no API
  --skip-judge      answers only
  --out DIR         results directory
  --merge DIR       merge into existing results.json (retry failed)
Env: OPENAI_API_KEY, EVAL_MODEL (default gpt-4o-mini), OPENAI_BASE_URL`);
      process.exit(0);
    }
  }
  return opts;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function runOne(question, condition, context, opts) {
  const row = {
    question_id: question.id,
    domain: question.domain,
    condition,
    question: question.question,
    context_chars: context.chars,
    tokens_in_context_est: context.tokens_est,
    context_files: context.files?.join(";") ?? "",
    cores_used: context.coreIds?.join(";") ?? "",
  };

  if (opts.dryRun) {
    row.answer = "(dry-run)";
    row.latency_ms = 0;
    row.tokens_in = 0;
    row.tokens_out = 0;
    return row;
  }

  const ans = await answerQuestion(question.question, context.text, condition);
  row.answer = ans.content;
  row.latency_ms = ans.latency_ms;
  row.tokens_in = ans.tokens_in;
  row.tokens_out = ans.tokens_out;
  row.model = ans.model;

  if (!opts.skipJudge && question.gold?.length) {
    await sleep(300);
    const j = await judgeAnswer({
      question: question.question,
      gold: question.gold,
      answer: ans.content,
    });
    row.accuracy = j.accuracy;
    row.hallucination = j.hallucination;
    row.completeness = j.completeness;
    row.reasoning = j.reasoning;
    row.judge_notes = j.notes ?? "";
  }

  return row;
}

async function main() {
  const opts = parseArgs(process.argv);
  const bank = JSON.parse(fs.readFileSync(opts.questions, "utf8"));
  let questions = bank.questions;

  if (opts.pilot && bank.pilot_ids) {
    const set = new Set(bank.pilot_ids);
    questions = questions.filter((q) => set.has(q.id));
  }
  if (opts.ids) {
    const set = new Set(opts.ids);
    questions = questions.filter((q) => set.has(q.id));
  }

  const outDir =
    opts.merge ?? opts.out ?? path.join(__dirname, "results", `run-${Date.now()}`);
  fs.mkdirSync(outDir, { recursive: true });

  /** @type {Record<string, object>} */
  const merged = {};
  const jsonPath = path.join(outDir, "results.json");
  if (opts.merge && fs.existsSync(jsonPath)) {
    for (const row of JSON.parse(fs.readFileSync(jsonPath, "utf8"))) {
      merged[`${row.question_id}:${row.condition}`] = row;
    }
  }

  const baselineCtx = loadBaselineContext(opts.baseline);
  fs.writeFileSync(
    path.join(outDir, "context-a-meta.json"),
    JSON.stringify(
      {
        files: baselineCtx.files.length,
        chars: baselineCtx.chars,
        tokens_est: baselineCtx.tokens_est,
      },
      null,
      2
    )
  );

  const rows = [];
  const condArg = opts.condition.toLowerCase();
  const conditions =
    condArg === "both"
      ? ["A", "B"]
      : condArg === "all" || condArg === "abc"
        ? ["A", "B", "C"]
        : [condArg.toUpperCase()];

  for (const q of questions) {
    const coreIds =
      q.expected_cores?.length > 0 ? q.expected_cores : routeQuestion(q.question);
    const coreCtx = loadCoreContext(coreIds);
    const graphCtx = loadGraphContext(q.question);

    for (const cond of conditions) {
      const ctx =
        cond === "A" ? baselineCtx : cond === "B" ? coreCtx : graphCtx;
      console.log(`[${q.id}] condition ${cond} …`);
      try {
        const row = await runOne(q, cond, ctx, opts);
        rows.push(row);
        merged[`${q.id}:${cond}`] = row;
        fs.writeFileSync(
          path.join(outDir, `${q.id}-${cond}.md`),
          `# ${q.id} (${cond})\n\n## Answer\n\n${row.answer ?? row.error}\n`
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[${q.id}] ${cond} failed: ${msg}`);
        rows.push({
          question_id: q.id,
          condition: cond,
          error: msg,
        });
      }
      if (!opts.dryRun) {
        const pause = cond === "A" ? 20_000 : cond === "C" ? 3_000 : 800;
        await sleep(pause);
      }
    }
  }

  const finalRows = opts.merge
    ? Object.values(merged).sort((a, b) => {
        const ai = `${a.question_id}:${a.condition}`;
        const bi = `${b.question_id}:${b.condition}`;
        return ai.localeCompare(bi);
      })
    : rows;

  writeCsv(path.join(outDir, "results.csv"), finalRows);
  fs.writeFileSync(path.join(outDir, "results.json"), JSON.stringify(finalRows, null, 2));

  const meta = {
    run_at: new Date().toISOString(),
    questions: questions.length,
    conditions,
    dry_run: opts.dryRun,
    skip_judge: opts.skipJudge,
    baseline_chars: baselineCtx.chars,
    model: process.env.EVAL_MODEL ?? "gpt-4o-mini",
  };
  fs.writeFileSync(path.join(outDir, "run-meta.json"), JSON.stringify(meta, null, 2));

  console.log(`Done. ${rows.length} rows → ${outDir}/results.csv`);
  console.log("Next: npm run eval:context-os:aggregate --", outDir);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
