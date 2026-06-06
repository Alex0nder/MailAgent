#!/usr/bin/env node
/** Contract: outbound send with verified OUTBOUND_FROM */
import "./load-env.mjs";
import {
  contractApi,
  contractBase,
  contractHeaders,
} from "./lib/contract-api.mjs";

const base = contractBase();
const headers = contractHeaders();
if (!headers) {
  console.error("contract-qa-outbound: set MAILAGENT_API_KEY");
  process.exit(1);
}

async function main() {
  console.log("contract-qa-outbound →", base);

  const me = await contractApi(base, headers, "/v1/me");
  if (!me.ok || !me.json?.capabilities?.outbound?.verifiedFrom) {
    console.error("outbound not ready", me.json?.capabilities?.outbound);
    process.exit(1);
  }

  const created = await contractApi(base, headers, "/v1/inboxes", {
    method: "POST",
    body: JSON.stringify({
      label: `contract-outbound-${Date.now()}`,
      ttlMinutes: 10,
    }),
  });
  if (!created.ok || !created.json?.id) {
    console.error("create inbox failed", created.status, created.json);
    process.exit(1);
  }
  const inboxId = created.json.id;
  const address = created.json.address;

  const sent = await contractApi(base, headers, `/v1/inboxes/${inboxId}/send`, {
    method: "POST",
    body: JSON.stringify({
      to: [address],
      subject: "contract-outbound ping",
      text: "MailAgent outbound smoke",
    }),
  });
  if (!sent.ok || !sent.json?.messageId) {
    console.error("send failed", sent.status, sent.json);
    process.exit(1);
  }

  const threads = await contractApi(base, headers, `/v1/inboxes/${inboxId}/threads`);
  if (!threads.ok || !Array.isArray(threads.json?.threads)) {
    console.error("threads failed", threads.status, threads.json);
    process.exit(1);
  }

  await contractApi(base, headers, `/v1/inboxes/${inboxId}`, { method: "DELETE" });

  console.log("contract-qa-outbound OK", {
    inboxId,
    messageId: sent.json.messageId,
    threadCount: threads.json.threads.length,
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
