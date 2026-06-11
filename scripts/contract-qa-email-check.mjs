#!/usr/bin/env node
/**
 * Contract: POST /v1/emails/check — self-contained syntax + disposable + MX.
 */
import "./load-env.mjs";
import { contractApi, contractBase, contractHeaders } from "./lib/contract-api.mjs";

const base = contractBase();
const headers = contractHeaders();

if (!headers) {
  console.error("contract-qa-email-check: set MAILAGENT_API_KEY");
  process.exit(1);
}

async function main() {
  console.log("contract-qa-email-check →", base);

  const bad = await contractApi(base, headers, "/v1/emails/check", {
    method: "POST",
    body: JSON.stringify({ email: "not-an-email" }),
  });
  if (bad.ok || bad.json?.error !== "invalid_email") {
    console.error("expected invalid_email", bad.status, bad.json);
    process.exit(1);
  }
  console.log("invalid syntax rejected");

  const dea = await contractApi(base, headers, "/v1/emails/check", {
    method: "POST",
    body: JSON.stringify({ email: "test@mailinator.com" }),
  });
  if (!dea.ok || !dea.json.misc?.isDisposable) {
    console.error("expected disposable", dea.status, dea.json);
    process.exit(1);
  }
  console.log("disposable detected", dea.json.isReachable);

  const mx = await contractApi(base, headers, "/v1/emails/check", {
    method: "POST",
    body: JSON.stringify({ email: "postmaster@gmail.com" }),
  });
  if (!mx.ok || mx.json.source !== "local") {
    console.error("expected local source", mx.status, mx.json);
    process.exit(1);
  }
  if (!mx.json.mx?.acceptsMail || !mx.json.mx.records?.length) {
    console.error("expected MX for gmail.com", mx.json.mx);
    process.exit(1);
  }
  console.log("MX lookup OK", mx.json.mx.records.slice(0, 2));

  console.log("contract-qa-email-check OK");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
