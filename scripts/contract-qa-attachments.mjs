#!/usr/bin/env node
/**
 * Contract: POST …/simulate with attachment → list + JSON meta (no Resend, no DATABASE_URL).
 */
import "./load-env.mjs";
import {
  contractApi,
  contractBase,
  contractHeaders,
  contractSimulate,
} from "./lib/contract-api.mjs";

const base = contractBase();
const headers = contractHeaders();
const ATTACH_NAME = "contract-invoice.pdf";

if (!headers) {
  console.error("contract-qa-attachments: set MAILAGENT_API_KEY");
  process.exit(1);
}

async function main() {
  console.log("contract-qa-attachments →", base);

  const created = await contractApi(base, headers, "/v1/inboxes", {
    method: "POST",
    body: JSON.stringify({
      label: `contract-att-${Date.now()}`,
      ttlMinutes: 15,
    }),
  });
  if (!created.ok) {
    console.error("create failed", created.status, created.json);
    process.exit(1);
  }

  const inboxId = created.json.id;
  const sim = await contractSimulate(base, headers, inboxId, {
    otp: "445566",
    from: "billing@example.com",
    subject: `Invoice ${ATTACH_NAME}`,
    attachmentFilename: ATTACH_NAME,
  });
  if (!sim.ok) {
    console.error("simulate failed", sim.status, sim.json);
    process.exit(1);
  }
  console.log("simulate OK", sim.json.messageId, sim.json.attachmentId);

  const wait = await contractApi(
    base,
    headers,
    `/v1/inboxes/${inboxId}/wait?timeout=30&subjectContains=Invoice`
  );
  if (!wait.ok) {
    console.error("wait failed", wait.status, wait.json);
    process.exit(1);
  }

  const list = await contractApi(
    base,
    headers,
    `/v1/inboxes/${inboxId}/messages/${sim.json.messageId}/attachments`
  );
  if (!list.ok) {
    console.error("list attachments failed", list.status, list.json);
    process.exit(1);
  }
  const attachments = list.json.attachments ?? [];
  if (!attachments.some((a) => a.filename === ATTACH_NAME)) {
    console.error("attachment not listed", attachments);
    process.exit(1);
  }

  const attId = attachments[0].id;
  const meta = await contractApi(
    base,
    headers,
    `/v1/inboxes/${inboxId}/messages/${sim.json.messageId}/attachments/${attId}`
  );
  if (!meta.ok) {
    console.error("get attachment meta failed", meta.status, meta.json);
    process.exit(1);
  }
  console.log("attachment meta OK", {
    filename: meta.json.filename,
    sizeBytes: meta.json.sizeBytes,
  });

  await contractApi(base, headers, `/v1/inboxes/${inboxId}`, { method: "DELETE" });
  console.log("contract-qa-attachments OK");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
