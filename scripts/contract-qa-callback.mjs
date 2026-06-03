#!/usr/bin/env node
/**
 * Contract: inbox + callbackUrl → simulate → fire callback → poll /callbacks + verification.
 */
import "./load-env.mjs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const base = (process.env.MAILAGENT_API_URL ?? "https://api.webmailagent.com").replace(/\/$/, "");
const apiKey = process.env.MAILAGENT_API_KEY ?? process.env.API_KEY;
const dbUrl = process.env.DATABASE_URL;
const callbackUrl =
  process.env.CONTRACT_CALLBACK_URL ?? "https://httpbin.org/post";

if (!apiKey) {
  console.error("contract-qa-callback: set MAILAGENT_API_KEY");
  process.exit(1);
}
if (!dbUrl) {
  console.error("contract-qa-callback: set DATABASE_URL");
  process.exit(1);
}

const headers = {
  Authorization: `Bearer ${apiKey}`,
  "Content-Type": "application/json",
};

const label = `contract-cb-${Date.now()}`;
const expectedOtp = "918273";

async function api(path, init = {}) {
  const res = await fetch(`${base}${path}`, { ...init, headers: { ...headers, ...init.headers } });
  const text = await res.text();
  let json = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = { raw: text };
    }
  }
  return { ok: res.ok, status: res.status, json };
}

async function main() {
  console.log("contract-qa-callback →", base, "callback:", callbackUrl);

  const created = await api("/v1/inboxes", {
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

  const simScript = path.join(path.dirname(fileURLToPath(import.meta.url)), "simulate-inbound.mjs");
  const sim = spawnSync(
    process.execPath,
    [simScript, inboxId, expectedOtp, "noreply@auth0.com", "--fire-callback"],
    { env: process.env, stdio: "inherit" }
  );
  if (sim.status !== 0) process.exit(sim.status ?? 1);

  const deadline = Date.now() + 30_000;
  let delivery = null;
  while (Date.now() < deadline) {
    const cb = await api(`/v1/inboxes/${inboxId}/callbacks?limit=10`);
    if (cb.ok && Array.isArray(cb.json.deliveries)) {
      delivery = cb.json.deliveries.find(
        (d) =>
          d.ok &&
          d.messageId &&
          new Date(d.createdAt).getTime() >= new Date(since).getTime() - 5000
      );
      if (delivery) break;
    }
    await new Promise((r) => setTimeout(r, 1500));
  }

  if (!delivery) {
    console.error("no ok callback delivery in log");
    process.exit(1);
  }

  const ext = await api(`/v1/inboxes/${inboxId}/extract`);
  if (!ext.ok || ext.json.otp !== expectedOtp) {
    console.error("extract mismatch", ext.json);
    process.exit(1);
  }

  if (delivery.statusCode !== 200) {
    console.error("unexpected callback status", delivery);
    process.exit(1);
  }

  await api(`/v1/inboxes/${inboxId}`, { method: "DELETE" }).catch(() => {});

  console.log("contract-qa-callback OK", {
    inboxId,
    deliveryId: delivery.id,
    otp: ext.json.otp,
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
