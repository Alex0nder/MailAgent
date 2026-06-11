#!/usr/bin/env node
/**
 * Contract: notifyEmail on inbox → simulate → GET /notify-deliveries logged.
 * Requires MAILAGENT_API_KEY. Optional CONTRACT_NOTIFY_EMAIL (real inbox for ok=true).
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
const notifyEmail =
  process.env.CONTRACT_NOTIFY_EMAIL ?? "contract-notify@example.com";

if (!headers) {
  console.error("contract-qa-notify: set MAILAGENT_API_KEY");
  process.exit(1);
}

const label = `contract-notify-${Date.now()}`;
const expectedOtp = "564738";

async function main() {
  console.log("contract-qa-notify →", base, "notify:", notifyEmail);

  const probe = await contractApi(base, headers, "/v1/inboxes", {
    method: "POST",
    body: JSON.stringify({ label: `${label}-probe`, ttlMinutes: 5 }),
  });
  if (!probe.ok) {
    console.error("probe inbox failed", probe.status, probe.json);
    process.exit(1);
  }
  const inboxDomain = String(probe.json.address).split("@")[1];
  await contractApi(base, headers, `/v1/inboxes/${probe.json.id}`, {
    method: "DELETE",
  });

  const bad = await contractApi(base, headers, "/v1/inboxes", {
    method: "POST",
    body: JSON.stringify({
      label: `${label}-bad`,
      notifyEmail: `loop@${inboxDomain}`,
    }),
  });
  if (bad.ok || bad.json?.error !== "invalid_notify_email") {
    console.error("expected invalid_notify_email for inbox-domain loop", bad.status, bad.json);
    process.exit(1);
  }
  console.log("loop rejected:", bad.json.error);

  const created = await contractApi(base, headers, "/v1/inboxes", {
    method: "POST",
    body: JSON.stringify({
      label,
      ttlMinutes: 15,
      service: "auth0",
      notifyEmail,
    }),
  });
  if (!created.ok) {
    console.error("create failed", created.status, created.json);
    process.exit(1);
  }

  const inboxId = created.json.id;
  const since = new Date().toISOString();
  console.log("inbox:", inboxId, created.json.address, "notifyEmail:", created.json.notifyEmail);

  if (created.json.notifyEmail !== notifyEmail.toLowerCase()) {
    console.error("notifyEmail mismatch", created.json.notifyEmail);
    process.exit(1);
  }

  const sim = await contractSimulate(base, headers, inboxId, {
    otp: expectedOtp,
    from: "noreply@auth0.com",
    subject: "MailAgent notify relay test",
  });
  if (!sim.ok) {
    console.error("simulate failed", sim.status, sim.json);
    process.exit(1);
  }
  console.log("simulate", sim.json.notify ?? sim.json);

  const deadline = Date.now() + 30_000;
  let delivery = null;
  while (Date.now() < deadline) {
    const list = await contractApi(
      base,
      headers,
      `/v1/inboxes/${inboxId}/notify-deliveries?limit=10`
    );
    if (list.ok && Array.isArray(list.json.deliveries)) {
      delivery = list.json.deliveries.find((d) => d.createdAt >= since);
      if (delivery) break;
    }
    await new Promise((r) => setTimeout(r, 1500));
  }

  if (!delivery) {
    console.error("notify delivery not logged within 30s");
    process.exit(1);
  }
  console.log("notify delivery", {
    ok: delivery.ok,
    error: delivery.error,
    resendId: delivery.resendId,
  });

  const ext = await contractApi(base, headers, `/v1/inboxes/${inboxId}/extract`);
  if (!ext.ok || ext.json.otp !== expectedOtp) {
    console.error("extract failed", ext.status, ext.json);
    process.exit(1);
  }

  await contractApi(base, headers, `/v1/inboxes/${inboxId}`, { method: "DELETE" });
  console.log("contract-qa-notify OK");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
