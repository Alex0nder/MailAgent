#!/usr/bin/env node
/** Contract: agent run session memory — GET/PATCH /v1/agent/runs/:runId/session */
import "./load-env.mjs";
import {
  contractApi,
  contractBase,
  contractHeaders,
} from "./lib/contract-api.mjs";

const base = contractBase();
const headers = contractHeaders();
if (!headers) {
  console.error("contract-qa-session: set MAILAGENT_API_KEY");
  process.exit(1);
}
const requireRunTimeline = process.env.MAILAGENT_REQUIRE_RUN_TIMELINE === "1";

const runId = `contract-session-${Date.now()}`;

async function main() {
  console.log("contract-qa-session →", base, "runId:", runId);

  const missing = await contractApi(
    base,
    headers,
    `/v1/agent/runs/${encodeURIComponent(runId)}/session`
  );
  if (missing.status !== 404 || missing.json?.error !== "session_not_found") {
    console.error("expected 404 session_not_found", missing.status, missing.json);
    process.exit(1);
  }

  const patched = await contractApi(
    base,
    headers,
    `/v1/agent/runs/${encodeURIComponent(runId)}/session`,
    {
      method: "PATCH",
      body: JSON.stringify({
        merge: { phase: "signup", inboxId: "test-inbox-id" },
        step: { name: "inbox_created", data: { service: "github" } },
      }),
    }
  );
  if (!patched.ok || patched.json?.runId !== runId) {
    console.error("PATCH session failed", patched.status, patched.json);
    process.exit(1);
  }
  if (!Array.isArray(patched.json.steps) || patched.json.steps.length !== 1) {
    console.error("steps missing", patched.json);
    process.exit(1);
  }
  if (requireRunTimeline) {
    if (
      !Array.isArray(patched.json.timeline) ||
      patched.json.timeline[0]?.type !== "inbox_created"
    ) {
      console.error("timeline missing or not normalized", patched.json.timeline);
      process.exit(1);
    }
  }

  const got = await contractApi(
    base,
    headers,
    `/v1/agent/runs/${encodeURIComponent(runId)}/session`
  );
  if (!got.ok || got.json?.state?.phase !== "signup") {
    console.error("GET session failed", got.status, got.json);
    process.exit(1);
  }

  const verify = await contractApi(base, headers, "/v1/agent/verify", {
    method: "POST",
    body: JSON.stringify({
      runId,
      timeoutSeconds: 3,
      deleteAfter: false,
    }),
  });
  if (verify.status !== 408 || verify.json?.status !== "timeout") {
    console.error("verify timeout expected", verify.status, verify.json);
    process.exit(1);
  }
  if (!verify.json?.session?.steps?.some((s) => s.name === "verify.timeout")) {
    console.error("verify response missing session", verify.json?.session);
    process.exit(1);
  }

  const afterVerify = await contractApi(
    base,
    headers,
    `/v1/agent/runs/${encodeURIComponent(runId)}/session`
  );
  const verifyStep = afterVerify.json?.steps?.find((s) => s.name === "verify.timeout");
  if (!verifyStep || afterVerify.json?.state?.lastVerify?.status !== "timeout") {
    console.error("verify did not patch session", afterVerify.json);
    process.exit(1);
  }
  if (requireRunTimeline) {
    const timelineTypes = afterVerify.json?.timeline?.map((e) => e.type) ?? [];
    for (const type of ["wait_started", "extraction_failure"]) {
      if (!timelineTypes.includes(type)) {
        console.error(`timeline missing ${type}`, afterVerify.json?.timeline);
        process.exit(1);
      }
    }

    const timeline = await contractApi(
      base,
      headers,
      `/v1/agent/runs/${encodeURIComponent(runId)}/timeline`
    );
    if (
      !timeline.ok ||
      timeline.json?.runId !== runId ||
      !timeline.json?.timeline?.some((e) => e.type === "extraction_failure")
    ) {
      console.error("GET timeline failed", timeline.status, timeline.json);
      process.exit(1);
    }
  }

  const hub = await contractApi(base, headers, "/v1/agent");
  if (!hub.json?.runs?.session || (requireRunTimeline && !hub.json?.runs?.timeline)) {
    console.error("hub missing runs session/timeline", hub.json?.runs);
    process.exit(1);
  }

  console.log("contract-qa-session OK");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
