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

  const audit = await contractApi(base, headers, "/v1/audit?limit=20");
  if (!audit.ok || !Array.isArray(audit.json?.events)) {
    console.error("audit list failed", audit.status, audit.json);
    process.exit(1);
  }

  const hit = audit.json.events.find(
    (e) => e.action === "inbox.created" && e.resourceId === inboxId
  );
  if (!hit) {
    console.error("inbox.created not in audit log", { inboxId, events: audit.json.events });
    process.exit(1);
  }

  const summary = await contractApi(base, headers, "/v1/console/summary");
  if (!summary.ok || !summary.json.recentAudit?.some((e) => e.resourceId === inboxId)) {
    console.error("console summary missing audit event", summary.json?.recentAudit);
    process.exit(1);
  }

  console.log("contract-qa-audit OK", { inboxId, auditId: hit.id });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
