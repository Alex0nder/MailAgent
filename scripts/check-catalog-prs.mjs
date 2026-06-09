#!/usr/bin/env node
/** Report awesome-codex-plugins #195 and awesome-agent-skills #659 status (monitoring, exit 0) */
import { spawnSync } from "node:child_process";

const PRS = [
  {
    repo: "hashgraph-online/awesome-codex-plugins",
    number: 195,
    label: "Codex catalog",
  },
  {
    repo: "VoltAgent/awesome-agent-skills",
    number: 659,
    label: "Agent skills",
  },
];

function viewPr(repo, number) {
  const r = spawnSync(
    "gh",
    [
      "pr",
      "view",
      String(number),
      "--repo",
      repo,
      "--json",
      "state,mergeable,url,updatedAt,title",
    ],
    { encoding: "utf8" }
  );
  if (r.status !== 0) return { error: r.stderr?.trim() || "gh failed" };
  try {
    return JSON.parse(r.stdout);
  } catch {
    return { error: "invalid json" };
  }
}

console.log("Catalog PR status\n");

let allMerged = true;
for (const pr of PRS) {
  const data = viewPr(pr.repo, pr.number);
  if (data.error) {
    console.log(`✗ ${pr.label} #${pr.number}: ${data.error}`);
    allMerged = false;
    continue;
  }
  const merged = data.state === "MERGED";
  if (!merged) allMerged = false;
  const icon = merged ? "✓" : "○";
  console.log(`${icon} ${pr.label} #${pr.number} — ${data.state} (${data.mergeable ?? "?"})`);
  console.log(`  ${data.url}`);
  if (data.updatedAt) console.log(`  updated: ${data.updatedAt}`);
}

if (allMerged) {
  console.log("\nAll catalog PRs merged.");
} else {
  console.log("\nInstall paths work without merge — see docs/DISTRIBUTION-STATUS.md");
}

process.exit(0);
