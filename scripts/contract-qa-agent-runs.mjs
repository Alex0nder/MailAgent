#!/usr/bin/env node
/** Contract: agent run state machine — start/report/next */
import "./load-env.mjs";
import {
  contractApi,
  contractBase,
  contractHeaders,
} from "./lib/contract-api.mjs";

const base = contractBase();
const headers = contractHeaders();
if (!headers) {
  console.error("contract-qa-agent-runs: set MAILAGENT_API_KEY");
  process.exit(1);
}

const runId = `contract-run-${Date.now()}`;

async function main() {
  console.log("contract-qa-agent-runs →", base, "runId:", runId);

  const hub = await contractApi(base, headers, "/v1/agent");
  for (const tool of [
    "mailagent_start_run",
    "mailagent_next_run",
    "mailagent_report_run",
  ]) {
    if (!hub.json?.mcpTools?.includes(tool)) {
      console.error(`hub missing ${tool}`, hub.json?.mcpTools);
      process.exit(1);
    }
  }
  if (!hub.json?.runs?.start || !hub.json?.runs?.next || !hub.json?.runs?.report) {
    console.error("hub missing run workflow discovery", hub.json?.runs);
    process.exit(1);
  }

  const started = await contractApi(base, headers, "/v1/agent/runs/start", {
    method: "POST",
    body: JSON.stringify({
      runId,
      appUrl: "https://example.test/signup",
      service: "auth0",
      subject: "Verify your email",
      keepOnFailure: true,
      allowSimulate: true,
    }),
  });
  if (
    started.status !== 201 ||
    started.json?.runId !== runId ||
    started.json?.plan?.nextTool !== "mailagent_create_inbox" ||
    started.json?.session?.steps?.[0]?.name !== "run.started"
  ) {
    console.error("run start failed", started.status, started.json);
    process.exit(1);
  }
  console.log("run start OK", started.json.plan.nextTool);

  const reported = await contractApi(
    base,
    headers,
    `/v1/agent/runs/${encodeURIComponent(runId)}/report`,
    {
      method: "POST",
      body: JSON.stringify({
        status: "form_submitted",
        inboxId: "inb_contract_placeholder",
        service: "auth0",
        subjectContains: "verify",
        result: { addressUsed: "contract@example.test" },
      }),
    }
  );
  if (
    !reported.ok ||
    reported.json?.session?.state?.status !== "form_submitted" ||
    reported.json?.session?.state?.inboxId !== "inb_contract_placeholder" ||
    reported.json?.plan?.nextTool !== "mailagent_verify_signup"
  ) {
    console.error("run report failed", reported.status, reported.json);
    process.exit(1);
  }
  if (!reported.json.session.steps?.some((s) => s.name === "run.report")) {
    console.error("run report missing step", reported.json.session.steps);
    process.exit(1);
  }
  console.log("run report OK", reported.json.plan.nextTool);

  const next = await contractApi(
    base,
    headers,
    `/v1/agent/runs/${encodeURIComponent(runId)}/next`,
    { method: "POST", body: JSON.stringify({}) }
  );
  if (
    !next.ok ||
    next.json?.runId !== runId ||
    next.json?.session?.state?.service !== "auth0" ||
    next.json?.plan?.nextTool !== "mailagent_verify_signup"
  ) {
    console.error("run next failed", next.status, next.json);
    process.exit(1);
  }
  console.log("run next OK", next.json.plan.nextTool);

  const session = await contractApi(
    base,
    headers,
    `/v1/agent/runs/${encodeURIComponent(runId)}/session`
  );
  if (!session.ok || session.json?.state?.appUrl !== "https://example.test/signup") {
    console.error("run session readback failed", session.status, session.json);
    process.exit(1);
  }

  console.log("contract-qa-agent-runs OK");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
