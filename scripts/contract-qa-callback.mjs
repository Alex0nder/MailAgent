#!/usr/bin/env node
/**
 * Contract: inbox + callbackUrl → POST …/simulate (fireCallback) → poll /callbacks.
 * Нужны только: MAILAGENT_API_KEY (+ optional CONTRACT_CALLBACK_URL).
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
const callbackUrl =
  process.env.CONTRACT_CALLBACK_URL ?? "https://httpbin.org/post";

if (!headers) {
  console.error("contract-qa-callback: set MAILAGENT_API_KEY");
  process.exit(1);
}

const label = `contract-cb-${Date.now()}`;
const expectedOtp = "918273";

async function main() {
  console.log("contract-qa-callback →", base, "callback:", callbackUrl);

  const created = await contractApi(base, headers, "/v1/inboxes", {
    method: "POST",
    body: JSON.stringify({
      label,
      ttlMinutes: 15,
      service: "auth0",
      callbackUrl,
    }),
  });
  if (!created.ok) {
    console.error("create failed", created.status, created.json);
    process.exit(1);
  }

  const inboxId = created.json.id;
  const since = new Date().toISOString();
  console.log("inbox:", inboxId, created.json.address);

  const sim = await contractSimulate(base, headers, inboxId, {
    otp: expectedOtp,
    from: "noreply@auth0.com",
    subject: "MailAgent simulated OTP",
    fireCallback: true,
  });
  if (!sim.ok) {
    console.error("simulate failed", sim.status, sim.json);
    process.exit(1);
  }
  console.log("simulate+callback", sim.json.callback ?? sim.json);

  const deadline = Date.now() + 30_000;
  let delivery = null;
  while (Date.now() < deadline) {
    const cb = await contractApi(
      base,
      headers,
      `/v1/inboxes/${inboxId}/callbacks?limit=10`
    );
    if (cb.ok && Array.isArray(cb.json.deliveries)) {
      delivery = cb.json.deliveries.find((d) => d.createdAt >= since);
      if (delivery) break;
    }
    await new Promise((r) => setTimeout(r, 1500));
  }

  if (!delivery) {
    console.error("callback delivery not logged within 30s");
    process.exit(1);
  }
  console.log("callback delivery", {
    ok: delivery.ok,
    statusCode: delivery.statusCode,
    error: delivery.error,
  });
  if (!delivery.ok) process.exit(1);

  const ext = await contractApi(base, headers, `/v1/inboxes/${inboxId}/extract`);
  if (!ext.ok || ext.json.otp !== expectedOtp) {
    console.error("extract failed", ext.status, ext.json);
    process.exit(1);
  }

  await contractApi(base, headers, `/v1/inboxes/${inboxId}`, { method: "DELETE" });
  console.log("contract-qa-callback OK");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
