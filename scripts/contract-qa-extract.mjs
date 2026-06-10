#!/usr/bin/env node
/** Contract: structured extract presets (rules-based, no AI required) */
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
  console.error("contract-qa-extract: set MAILAGENT_API_KEY");
  process.exit(1);
}

async function main() {
  console.log("contract-qa-extract →", base);

  const created = await contractApi(base, headers, "/v1/inboxes", {
    method: "POST",
    body: JSON.stringify({ label: `extract-${Date.now()}`, ttlMinutes: 15 }),
  });
  if (!created.ok) {
    console.error("create inbox failed", created.status, created.json);
    process.exit(1);
  }

  const inboxId = created.json.id;

  const presets = await contractApi(
    base,
    headers,
    `/v1/inboxes/${inboxId}/extract/presets`
  );
  if (!presets.ok || !presets.json?.presets?.length) {
    console.error("presets failed", presets.status, presets.json);
    process.exit(1);
  }

  const sim2fa = await contractSimulate(base, headers, inboxId, {
    otp: "778899",
    subject: "Your verification code",
  });
  if (!sim2fa.ok) {
    console.error("simulate 2fa failed", sim2fa.status);
    process.exit(1);
  }

  const ext2fa = await contractApi(
    base,
    headers,
    `/v1/inboxes/${inboxId}/messages/${sim2fa.json.messageId}/extract`,
    {
      method: "POST",
      body: JSON.stringify({ preset: "2fa" }),
    }
  );
  if (!ext2fa.ok || ext2fa.json?.data?.otp !== "778899") {
    console.error("2fa extract failed", ext2fa.status, ext2fa.json);
    process.exit(1);
  }
  console.log("2fa preset OK");

  const simInv = await contractSimulate(base, headers, inboxId, {
    subject: "Invoice #INV-8842 — $129.99 USD due March 15, 2026",
    from: "billing@acme.com",
    otp: "000000",
  });
  if (!simInv.ok) {
    console.error("simulate invoice failed", simInv.status);
    process.exit(1);
  }

  const extInv = await contractApi(
    base,
    headers,
    `/v1/inboxes/${inboxId}/messages/${simInv.json.messageId}/extract`,
    {
      method: "POST",
      body: JSON.stringify({ preset: "invoice" }),
    }
  );
  if (!extInv.ok) {
    console.error("invoice extract failed", extInv.status, extInv.json);
    process.exit(1);
  }

  const invNum = extInv.json?.data?.invoiceNumber;
  if (!invNum || !String(invNum).toUpperCase().includes("INV-8842")) {
    console.error("invoice number mismatch", extInv.json?.data);
    process.exit(1);
  }
  console.log("invoice preset OK", {
    invoiceNumber: invNum,
    extractor: extInv.json.extractor,
  });

  const ids = (presets.json.presets ?? []).map((p) => p.id);
  for (const id of ["magic_link", "invite"]) {
    if (!ids.includes(id)) {
      console.error(`extract preset missing: ${id}`, ids);
      process.exit(1);
    }
  }

  const simMl = await contractSimulate(base, headers, inboxId, {
    scenario: "magic_link",
  });
  if (!simMl.ok) {
    console.error("simulate magic_link failed", simMl.status);
    process.exit(1);
  }
  const extMl = await contractApi(
    base,
    headers,
    `/v1/inboxes/${inboxId}/messages/${simMl.json.messageId}/extract`,
    { method: "POST", body: JSON.stringify({ preset: "magic_link" }) }
  );
  if (!extMl.ok || !extMl.json?.data?.primaryLink) {
    console.error("magic_link extract failed", extMl.status, extMl.json);
    process.exit(1);
  }
  console.log("magic_link preset OK");

  const simInv2 = await contractSimulate(base, headers, inboxId, {
    scenario: "invite",
  });
  const extInvite = await contractApi(
    base,
    headers,
    `/v1/inboxes/${inboxId}/messages/${simInv2.json.messageId}/extract`,
    { method: "POST", body: JSON.stringify({ preset: "invite" }) }
  );
  if (!extInvite.ok || !extInvite.json?.data?.inviteUrl) {
    console.error("invite extract failed", extInvite.status, extInvite.json);
    process.exit(1);
  }
  console.log("invite preset OK");

  await contractApi(base, headers, `/v1/inboxes/${inboxId}`, { method: "DELETE" });
  console.log("contract-qa-extract OK");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
