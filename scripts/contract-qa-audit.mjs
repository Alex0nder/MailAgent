#!/usr/bin/env node
/** Contract: audit log records inbox.created after POST /v1/inboxes */
import "./load-env.mjs";
import {
  contractApi,
  contractBase,
  contractHeaders,
} from "./lib/contract-api.mjs";

const base = contractBase();
const headers = contractHeaders();
if (!headers) {
  console.error("contract-qa-audit: set MAILAGENT_API_KEY");
  process.exit(1);
}

async function main() {
  console.log("contract-qa-audit →", base);

  const label = `audit-${Date.now()}`;
  const created = await contractApi(base, headers, "/v1/inboxes", {
    method: "POST",
    body: JSON.stringify({ label, ttlMinutes: 15 }),
  });
  if (!created.ok) {
    console.error("create inbox failed", created.status, created.json);
    process.exit(1);
  }

  const inboxId = created.json.id;

  let hit = null;
  for (let i = 0; i < 8; i++) {
    const audit = await contractApi(base, headers, "/v1/audit?limit=20");
    if (!audit.ok || !Array.isArray(audit.json?.events)) {
      console.error("audit list failed", audit.status, audit.json);
      process.exit(1);
    }
    hit = audit.json.events.find(
      (e) => e.action === "inbox.created" && e.resourceId === inboxId
    );
    if (hit) break;
    await new Promise((r) => setTimeout(r, 400));
  }
  if (!hit) {
    console.error("inbox.created not in audit log", { inboxId });
    process.exit(1);
  }

  let inSummary = false;
  for (let i = 0; i < 5; i++) {
    const summary = await contractApi(base, headers, "/v1/console/summary");
    if (summary.ok && summary.json.recentAudit?.some((e) => e.resourceId === inboxId)) {
      inSummary = true;
      break;
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  if (!inSummary) {
    console.error("console summary missing audit event");
    process.exit(1);
  }

  const page1 = await contractApi(base, headers, "/v1/audit?limit=5");
  if (!page1.ok || typeof page1.json.hasMore !== "boolean") {
    console.error("audit pagination fields missing", page1.json);
    process.exit(1);
  }
  if (page1.json.events?.length === 5 && page1.json.nextBefore) {
    const page2 = await contractApi(
      base,
      headers,
      `/v1/audit?limit=5&before=${encodeURIComponent(page1.json.nextBefore)}`
    );
    if (!page2.ok || !Array.isArray(page2.json?.events)) {
      console.error("audit page2 failed", page2.status, page2.json);
      process.exit(1);
    }
    const overlap = page2.json.events.some((e) =>
      page1.json.events.some((a) => a.id === e.id)
    );
    if (overlap) {
      console.error("audit cursor returned duplicate events");
      process.exit(1);
    }
  }

  console.log("contract-qa-audit OK", { inboxId, auditId: hit.id });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
