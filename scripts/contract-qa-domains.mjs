#!/usr/bin/env node
/**
 * Contract: custom domains API (Resend create + verify poll).
 * Creates a throwaway subdomain; inbox on unverified domain must fail.
 */
import "./load-env.mjs";
import {
  contractApi,
  contractBase,
  contractHeaders,
} from "./lib/contract-api.mjs";

const base = contractBase();
const headers = contractHeaders();
if (!headers) {
  console.error("contract-qa-domains: set MAILAGENT_API_KEY");
  process.exit(1);
}

async function main() {
  console.log("contract-qa-domains →", base);

  const domainName = `qa-${Date.now()}.contract-ci.test`;
  const created = await contractApi(base, headers, "/v1/domains", {
    method: "POST",
    body: JSON.stringify({ name: domainName }),
  });

  if (!created.ok) {
    console.error("create domain failed", created.status, created.json);
    process.exit(1);
  }

  const domainId = created.json.id;
  if (!domainId || !Array.isArray(created.json.dnsRecords)) {
    console.error("unexpected create domain payload", created.json);
    process.exit(1);
  }
  console.log("domain created", domainId, created.json.status);

  const inbox = await contractApi(base, headers, "/v1/inboxes", {
    method: "POST",
    body: JSON.stringify({
      label: `domain-contract-${Date.now()}`,
      username: "support",
      domainId,
      ttlMinutes: 15,
    }),
  });
  if (inbox.ok || inbox.json?.error !== "domain_not_verified") {
    console.error("expected domain_not_verified for inbox", inbox.status, inbox.json);
    process.exit(1);
  }
  console.log("inbox blocked until verified OK");

  const verify = await contractApi(
    base,
    headers,
    `/v1/domains/${domainId}/verify`,
    { method: "POST" }
  );
  if (!verify.ok) {
    console.error("verify failed", verify.status, verify.json);
    process.exit(1);
  }
  console.log("verify polled", verify.json.status);

  const list = await contractApi(base, headers, "/v1/domains");
  if (!list.ok) {
    console.error("list domains failed", list.status);
    process.exit(1);
  }
  const found = (list.json.domains ?? []).some((d) => d.id === domainId);
  if (!found) {
    console.error("domain missing from list");
    process.exit(1);
  }

  await contractApi(base, headers, `/v1/domains/${domainId}`, {
    method: "DELETE",
  });

  console.log("contract-qa-domains OK", { domainId, name: domainName });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
