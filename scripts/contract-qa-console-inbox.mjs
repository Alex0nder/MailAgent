#!/usr/bin/env node
/** Contract: console inbox detail with messages after simulate */
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
  console.error("contract-qa-console-inbox: set MAILAGENT_API_KEY");
  process.exit(1);
}

async function main() {
  console.log("contract-qa-console-inbox →", base);

  const created = await contractApi(base, headers, "/v1/inboxes", {
    method: "POST",
    body: JSON.stringify({ label: `console-inbox-${Date.now()}`, ttlMinutes: 15 }),
  });
  if (!created.ok) {
    console.error("create inbox failed", created.status, created.json);
    process.exit(1);
  }

  const inboxId = created.json.id;
  const sim = await contractSimulate(base, headers, inboxId, {
    otp: "332211",
    subject: "Console inbox detail test",
  });
  if (!sim.ok) {
    console.error("simulate failed", sim.status);
    process.exit(1);
  }

  const detail = await contractApi(
    base,
    headers,
    `/v1/console/inboxes/${inboxId}`
  );
  if (!detail.ok) {
    console.error("console inbox detail failed", detail.status, detail.json);
    process.exit(1);
  }

  const d = detail.json;
  if (d.messageCount < 1 || !d.messages?.length) {
    console.error("expected messages in console inbox detail", d);
    process.exit(1);
  }
  if (d.messages[0].otp !== "332211") {
    console.error("OTP mismatch", d.messages[0]);
    process.exit(1);
  }
  if (!d.links?.debug || !d.links?.threads) {
    console.error("links missing", d.links);
    process.exit(1);
  }

  console.log("contract-qa-console-inbox OK", {
    inboxId,
    messageCount: d.messageCount,
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
