#!/usr/bin/env node
/** Contract: keyword search via simulate (no SMTP, works without Workers AI) */
import "./load-env.mjs";
import {
  contractApi,
  contractBase,
  contractHeaders,
  contractSimulate,
} from "./lib/contract-api.mjs";

const base = contractBase();
const headers = contractHeaders();
if (!headers) {
  console.error("contract-qa-search: set MAILAGENT_API_KEY");
  process.exit(1);
}

async function main() {
  console.log("contract-qa-search →", base);

  const created = await contractApi(base, headers, "/v1/inboxes", {
    method: "POST",
    body: JSON.stringify({
      label: `search-${Date.now()}`,
      ttlMinutes: 15,
    }),
  });
  if (!created.ok) {
    console.error("create inbox failed", created.status, created.json);
    process.exit(1);
  }

  const inboxId = created.json.id;

  await contractSimulate(base, headers, inboxId, {
    otp: "440011",
    subject: "Invoice #8842 payment due tomorrow",
    from: "billing@vendor.com",
  });

  await contractSimulate(base, headers, inboxId, {
    otp: "550022",
    subject: "Welcome to MailAgent newsletter",
    from: "news@vendor.com",
  });

  const search = await contractApi(
    base,
    headers,
    `/v1/inboxes/${inboxId}/search?q=invoice&mode=keyword`
  );
  if (!search.ok) {
    console.error("search failed", search.status, search.json);
    process.exit(1);
  }

  const hits = search.json.results ?? [];
  if (!hits.length) {
    console.error("expected keyword hit for invoice", search.json);
    process.exit(1);
  }

  const top = hits[0];
  if (!String(top.subject).toLowerCase().includes("invoice")) {
    console.error("top result not invoice", top);
    process.exit(1);
  }

  const empty = await contractApi(
    base,
    headers,
    `/v1/inboxes/${inboxId}/search?q=`
  );
  if (empty.status !== 400) {
    console.error("expected 400 for empty q", empty.status);
    process.exit(1);
  }

  await contractApi(base, headers, `/v1/inboxes/${inboxId}`, { method: "DELETE" });

  console.log("contract-qa-search OK", {
    inboxId,
    topSubject: top.subject,
    matchType: top.matchType,
    semanticAvailable: search.json.semanticAvailable,
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
