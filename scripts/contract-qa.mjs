#!/usr/bin/env node
/**
 * Contract test без реального SMTP: API create → DB simulate → API wait/extract.
 * Нужны: MAILAGENT_API_URL, MAILAGENT_API_KEY, DATABASE_URL (Neon, как у worker).
 */
import "./load-env.mjs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const base = (process.env.MAILAGENT_API_URL ?? "https://api.webmailagent.com").replace(/\/$/, "");
const apiKey = process.env.MAILAGENT_API_KEY ?? process.env.API_KEY;
const dbUrl = process.env.DATABASE_URL;

if (!apiKey) {
  console.error("contract-qa: set MAILAGENT_API_KEY");
  process.exit(1);
}
if (!dbUrl) {
  console.error("contract-qa: set DATABASE_URL (Neon) for simulate-inbound");
  process.exit(1);
}

const headers = {
  Authorization: `Bearer ${apiKey}`,
  "Content-Type": "application/json",
};

const label = `contract-${Date.now()}`;
const expectedOtp = "739182";

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
  console.log("contract-qa →", base, "label:", label);

  const health = await api("/health");
  if (!health.ok) {
    console.error("health failed", health.status, health.json);
    process.exit(1);
  }

  const created = await api("/v1/inboxes", {
    method: "POST",
    body: JSON.stringify({ label, ttlMinutes: 15, service: "auth0" }),
  });
  if (!created.ok) {
    console.error("create inbox failed", created.status, created.json);
    process.exit(1);
  }

  const inboxId = created.json.id;
  const address = created.json.address;
  console.log("inbox:", inboxId, address);

  const simScript = path.join(path.dirname(fileURLToPath(import.meta.url)), "simulate-inbound.mjs");
  const sim = spawnSync(
    process.execPath,
    [simScript, inboxId, expectedOtp, "noreply@auth0.com"],
    { env: process.env, stdio: "inherit" }
  );
  if (sim.status !== 0) process.exit(sim.status ?? 1);

  const wait = await api(
    `/v1/inboxes/${inboxId}/wait?timeout=30&subjectContains=simulated`
  );
  if (!wait.ok) {
    console.error("wait failed", wait.status, wait.json);
    process.exit(1);
  }

  const ext = await api(`/v1/inboxes/${inboxId}/extract`);
  if (!ext.ok) {
    console.error("extract failed", ext.status, ext.json);
    process.exit(1);
  }

  if (ext.json.otp !== expectedOtp) {
    console.error("otp mismatch", { expected: expectedOtp, got: ext.json.otp });
    process.exit(1);
  }

  // messageIndex: второе письмо, wait должен вернуть его
  const otp2 = "112233";
  for (const [subj, otpVal] of [
    ["contract-first", "000001"],
    ["contract-second", otp2],
  ]) {
    const sim2 = spawnSync(
      process.execPath,
      [
        simScript,
        inboxId,
        otpVal,
        "noreply@auth0.com",
        `--subject=${subj}`,
      ],
      { env: process.env, stdio: "inherit" }
    );
    if (sim2.status !== 0) process.exit(sim2.status ?? 1);
  }

  // messageIndex среди отфильтрованных: 0=contract-second (новее), 1=contract-first
  const waitIdx = await api(
    `/v1/inboxes/${inboxId}/wait?timeout=30&messageIndex=1&subjectContains=contract`
  );
  if (!waitIdx.ok) {
    console.error("wait messageIndex=1 failed", waitIdx.status, waitIdx.json);
    process.exit(1);
  }
  const waitOtp = waitIdx.json.message?.otp ?? waitIdx.json.otp;
  const waitSubject = waitIdx.json.message?.subject ?? waitIdx.json.subject;
  if (waitOtp !== "000001") {
    console.error("messageIndex otp mismatch", { expected: "000001", got: waitOtp, waitIdx: waitIdx.json });
    process.exit(1);
  }
  console.log("messageIndex OK", { subject: waitSubject, otp: waitOtp });

  const del = await api(`/v1/inboxes/${inboxId}`, { method: "DELETE" });
  if (!del.ok) {
    console.warn("delete inbox failed", del.status);
  }

  console.log("contract-qa OK", { inboxId, otp: ext.json.otp, primaryLink: ext.json.primaryLink });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
