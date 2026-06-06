#!/usr/bin/env node
/**
 * Contract test without real SMTP: API create → POST …/simulate → wait/extract.
 * Requires only: MAILAGENT_API_URL, MAILAGENT_API_KEY (DATABASE_URL not required).
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
if (!headers) {
  console.error("contract-qa: set MAILAGENT_API_KEY");
  process.exit(1);
}

const label = `contract-${Date.now()}`;
const expectedOtp = "739182";

async function main() {
  console.log("contract-qa →", base, "label:", label);

  const health = await contractApi(base, headers, "/health");
  if (!health.ok) {
    console.error("health failed", health.status, health.json);
    process.exit(1);
  }

  const created = await contractApi(base, headers, "/v1/inboxes", {
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

  const sim = await contractSimulate(base, headers, inboxId, {
    otp: expectedOtp,
    from: "noreply@auth0.com",
    subject: "MailAgent simulated OTP",
  });
  if (!sim.ok) {
    console.error("simulate failed", sim.status, sim.json);
    process.exit(1);
  }
  console.log("simulate OK", sim.json.messageId);

  const wait = await contractApi(
    base,
    headers,
    `/v1/inboxes/${inboxId}/wait?timeout=30&subjectContains=simulated`
  );
  if (!wait.ok) {
    console.error("wait failed", wait.status, wait.json);
    process.exit(1);
  }

  const ext = await contractApi(base, headers, `/v1/inboxes/${inboxId}/extract`);
  if (!ext.ok) {
    console.error("extract failed", ext.status, ext.json);
    process.exit(1);
  }

  if (ext.json.otp !== expectedOtp) {
    console.error("otp mismatch", { expected: expectedOtp, got: ext.json.otp });
    process.exit(1);
  }

  const otp2 = "112233";
  for (const [subj, otpVal] of [
    ["contract-first", "000001"],
    ["contract-second", otp2],
  ]) {
    const sim2 = await contractSimulate(base, headers, inboxId, {
      otp: otpVal,
      from: "noreply@auth0.com",
      subject: subj,
    });
    if (!sim2.ok) {
      console.error("simulate messageIndex seed failed", sim2.status, sim2.json);
      process.exit(1);
    }
  }

  const waitIdx = await contractApi(
    base,
    headers,
    `/v1/inboxes/${inboxId}/wait?timeout=30&messageIndex=1&subjectContains=contract`
  );
  if (!waitIdx.ok) {
    console.error("wait messageIndex=1 failed", waitIdx.status, waitIdx.json);
    process.exit(1);
  }
  const waitOtp = waitIdx.json.message?.otp ?? waitIdx.json.otp;
  const waitSubject = waitIdx.json.message?.subject ?? waitIdx.json.subject;
  if (waitOtp !== "000001") {
    console.error("messageIndex otp mismatch", {
      expected: "000001",
      got: waitOtp,
      waitIdx: waitIdx.json,
    });
    process.exit(1);
  }
  console.log("messageIndex OK", { subject: waitSubject, otp: waitOtp });

  const del = await contractApi(base, headers, `/v1/inboxes/${inboxId}`, {
    method: "DELETE",
  });
  if (!del.ok) {
    console.warn("delete inbox failed", del.status);
  }

  console.log("contract-qa OK", {
    inboxId,
    otp: ext.json.otp,
    primaryLink: ext.json.primaryLink,
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
