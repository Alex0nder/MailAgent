#!/usr/bin/env node
/** Contract: agent hub discovery — /v1/agent, /v1/me, /mcp/auth */
import "./load-env.mjs";
import {
  contractApi,
  contractBase,
  contractHeaders,
} from "./lib/contract-api.mjs";

const base = contractBase();
const headers = contractHeaders();
if (!headers) {
  console.error("contract-qa-agent: set MAILAGENT_API_KEY");
  process.exit(1);
}

async function main() {
  console.log("contract-qa-agent →", base);

  const hub = await contractApi(base, headers, "/v1/agent");
  if (!hub.ok || !Array.isArray(hub.json?.mcpTools) || hub.json.mcpTools.length < 10) {
    console.error("GET /v1/agent failed", hub.status, hub.json);
    process.exit(1);
  }
  if (!hub.json.auth?.oidc || !hub.json.auth?.me) {
    console.error("agent auth discovery missing", hub.json.auth);
    process.exit(1);
  }
  if (!hub.json.tests?.prodGate || !hub.json.autotests) {
    console.error("agent autotests discovery missing", hub.json.tests, hub.json.autotests);
    process.exit(1);
  }
  if (
    !hub.json.tests?.qaPilot ||
    !hub.json.tests?.qaWizard ||
    !hub.json.tests?.qaPilotStarter ||
    !hub.json.tests?.qaPilotCypressStarter
  ) {
    console.error("qa pilot discovery missing", hub.json.tests);
    process.exit(1);
  }
  if (!hub.json.mcpTools.includes("mailagent_verify_signup")) {
    console.error("mailagent_verify_signup missing from hub");
    process.exit(1);
  }
  if (!hub.json.mcpTools.includes("mailagent_suggest_preset")) {
    console.error("mailagent_suggest_preset missing from hub");
    process.exit(1);
  }
  if (!hub.json.mcpTools.includes("mailagent_plan_next")) {
    console.error("mailagent_plan_next missing from hub");
    process.exit(1);
  }
  if (!hub.json.mcpTools.includes("mailagent_issue_access")) {
    console.error("mailagent_issue_access missing from hub");
    process.exit(1);
  }
  for (const tool of [
    "mailagent_start_run",
    "mailagent_next_run",
    "mailagent_report_run",
    "mailagent_workspace_summarize",
    "mailagent_workspace_draft_reply",
    "mailagent_workspace_suggest_reminders",
    "mailagent_workspace_log_action",
    "mailagent_workspace_list_actions",
  ]) {
    if (!hub.json.mcpTools.includes(tool)) {
      console.error(`${tool} missing from hub`);
      process.exit(1);
    }
  }
  if (!hub.json.recommended?.presetAdvisor?.path) {
    console.error("preset advisor discovery missing", hub.json.recommended);
    process.exit(1);
  }
  if (!hub.json.recommended?.autopilot?.path) {
    console.error("autopilot discovery missing", hub.json.recommended);
    process.exit(1);
  }
  if (!hub.json.recommended?.accessBroker?.path) {
    console.error("agent access broker discovery missing", hub.json.recommended);
    process.exit(1);
  }
  if (!hub.json.mcpTools.includes("mailagent_get_run_session")) {
    console.error("mailagent_get_run_session missing from hub");
    process.exit(1);
  }
  const requireRunTimeline = process.env.MAILAGENT_REQUIRE_RUN_TIMELINE === "1";
  if (requireRunTimeline && !hub.json.mcpTools.includes("mailagent_get_run_timeline")) {
    console.error("mailagent_get_run_timeline missing from hub");
    process.exit(1);
  }
  if (!hub.json.runs?.session?.patch) {
    console.error("runs.session discovery missing", hub.json.runs);
    process.exit(1);
  }
  if (!hub.json.runs?.start || !hub.json.runs?.next || !hub.json.runs?.report) {
    console.error("runs workflow discovery missing", hub.json.runs);
    process.exit(1);
  }
  if (requireRunTimeline && !hub.json.runs?.timeline) {
    console.error("runs.timeline discovery missing", hub.json.runs);
    process.exit(1);
  }
  if (process.env.MAILAGENT_REQUIRE_CLEANUP_POLICIES === "1") {
    if (
      !hub.json.recommended?.verify?.cleanupPolicy ||
      !hub.json.mcpTools.includes("mailagent_cleanup_inboxes")
    ) {
      console.error("cleanup policy discovery missing", {
        verify: hub.json.recommended?.verify,
        mcpTools: hub.json.mcpTools,
      });
      process.exit(1);
    }
  }
  const requireAgentFlows = process.env.MAILAGENT_REQUIRE_AGENT_FLOWS === "1";
  if (requireAgentFlows) {
    const flowTemplateIds = hub.json.flowTemplates?.ids ?? [];
    for (const id of ["signup", "login_2fa", "password_reset", "invite_accept", "magic_link_login"]) {
      if (!flowTemplateIds.includes(id)) {
        console.error(`flow template missing from hub: ${id}`, hub.json.flowTemplates);
        process.exit(1);
      }
    }
  }
  if (!hub.json.security || !hub.json.privacy || !hub.json.terms) {
    console.error("trust URLs missing", {
      security: hub.json.security,
      privacy: hub.json.privacy,
      terms: hub.json.terms,
    });
    process.exit(1);
  }
  const d = hub.json.distribution;
  if (!d?.skill?.install || !d?.codex?.marketplace) {
    console.error("distribution discovery missing", d);
    process.exit(1);
  }
  const pkgs = hub.json.packages;
  if (!pkgs?.qa?.version || !pkgs?.mcp?.install) {
    console.error("packages discovery missing", pkgs);
    process.exit(1);
  }
  const services = hub.json.services;
  if (!Array.isArray(services) || services.length < 20) {
    console.error("agent services discovery missing or too short", services?.length);
    process.exit(1);
  }
  for (const name of ["gitlab", "bitbucket", "github"]) {
    if (!services.includes(name)) {
      console.error(`service preset missing from hub: ${name}`);
      process.exit(1);
    }
  }
  const status = await fetch(`${base}/v1/status`);
  const statusJson = await status.json();
  if (!status.ok || statusJson.status !== "ok" || !statusJson.db) {
    console.error("GET /v1/status failed", status.status, statusJson);
    process.exit(1);
  }
  console.log("public status OK", statusJson.version);

  const scenarios = await contractApi(base, headers, "/v1/inboxes/simulate/scenarios");
  if (!scenarios.ok || !scenarios.json?.scenarios?.length) {
    console.error("simulate scenarios missing", scenarios.status, scenarios.json);
    process.exit(1);
  }
  const scenarioIds = scenarios.json.scenarios.map((s) => s.id);
  for (const id of [
    "otp",
    "magic_link",
    "attachment",
    "login_2fa",
    "password_reset",
  ]) {
    if (!scenarioIds.includes(id)) {
      console.error(`simulate scenario missing: ${id}`);
      process.exit(1);
    }
  }
  console.log("simulate scenarios OK", scenarioIds.length);

  if (requireAgentFlows) {
    const flows = await contractApi(base, headers, "/v1/agent/flows");
    if (!flows.ok || !Array.isArray(flows.json?.flows) || flows.json.flows.length < 5) {
      console.error("agent flow templates missing", flows.status, flows.json);
      process.exit(1);
    }
    const resetFlow = await contractApi(base, headers, "/v1/agent/flows/password_reset");
    if (
      !resetFlow.ok ||
      resetFlow.json?.serviceFlow !== "password_reset" ||
      !resetFlow.json?.recovery?.length
    ) {
      console.error("password_reset flow template invalid", resetFlow.status, resetFlow.json);
      process.exit(1);
    }
    console.log("agent flow templates OK", flows.json.flows.length);
  }

  const advice = await fetch(`${base}/v1/agent/preset-advice`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: "Auth0 <no-reply@auth0.com>",
      subject: "Verify your email",
    }),
  });
  const adviceJson = await advice.json();
  if (
    !advice.ok ||
    adviceJson.service !== "auth0" ||
    !adviceJson.knownPreset ||
    !adviceJson.snippets?.verifySignup?.service
  ) {
    console.error("preset advisor failed", advice.status, adviceJson);
    process.exit(1);
  }
  console.log("preset advisor OK", {
    service: adviceJson.service,
    subjectContains: adviceJson.subjectContains,
  });

  const autopilot = await fetch(`${base}/v1/agent/autopilot`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: "Auth0 <no-reply@auth0.com>",
      subject: "Verify your email",
      runId: "contract-autopilot",
    }),
  });
  const autopilotJson = await autopilot.json();
  if (
    !autopilot.ok ||
    autopilotJson.nextTool !== "mailagent_create_inbox" ||
    autopilotJson.mode !== "create_inbox" ||
    autopilotJson.payloads?.verifySignup?.inboxId !== "<created inbox id>"
  ) {
    console.error("autopilot planner failed", autopilot.status, autopilotJson);
    process.exit(1);
  }
  console.log("autopilot planner OK", {
    nextTool: autopilotJson.nextTool,
    service: autopilotJson.presetAdvice?.service,
  });

  const workspaceAutopilot = await fetch(`${base}/v1/agent/autopilot`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({
      openReminders: [
        { id: "wr_contract_done", title: "Already drafted", status: "open" },
        { id: "wr_contract_next", title: "Next untouched follow-up", status: "open" },
      ],
      workspaceActions: [
        {
          reminderId: "wr_contract_done",
          actionType: "draft_prepared",
          title: "Draft prepared",
          status: "done",
        },
      ],
    }),
  });
  const workspaceAutopilotJson = await workspaceAutopilot.json();
  if (
    !workspaceAutopilot.ok ||
    workspaceAutopilotJson.mode !== "workspace_followup" ||
    workspaceAutopilotJson.workspace?.reminder?.id !== "wr_contract_next"
  ) {
    console.error(
      "workspace action deduplication failed",
      workspaceAutopilot.status,
      workspaceAutopilotJson
    );
    process.exit(1);
  }

  const workspaceWaiting = await fetch(`${base}/v1/agent/autopilot`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({
      openReminders: [{ id: "wr_contract_done", title: "Already drafted", status: "open" }],
      workspaceActions: [
        {
          reminderId: "wr_contract_done",
          actionType: "draft_prepared",
          title: "Draft prepared",
          status: "done",
        },
      ],
    }),
  });
  const workspaceWaitingJson = await workspaceWaiting.json();
  if (
    !workspaceWaiting.ok ||
    workspaceWaitingJson.mode !== "workspace_waiting" ||
    workspaceWaitingJson.nextTool !== "mailagent_workspace_list_actions"
  ) {
    console.error("workspace duplicate suppression failed", workspaceWaiting.status, workspaceWaitingJson);
    process.exit(1);
  }
  console.log("workspace action-aware planner OK");

  console.log("agent hub OK", {
    tools: hub.json.mcpTools.length,
    services: services.length,
    oidc: hub.json.auth.oidc,
  });

  const me = await contractApi(base, headers, "/v1/me");
  if (!me.ok || me.json?.capabilities?.outbound?.enabled == null) {
    console.error("/v1/me capabilities failed", me.status, me.json);
    process.exit(1);
  }

  const mcpAuth = await contractApi(base, headers, "/mcp/auth");
  if (!mcpAuth.ok || mcpAuth.json?.type !== "oauth2") {
    console.error("GET /mcp/auth failed", mcpAuth.status, mcpAuth.json);
    process.exit(1);
  }
  console.log("mcp auth OK", { oidc: mcpAuth.json.oidc });

  const apiKey = process.env.MAILAGENT_API_KEY ?? process.env.API_KEY;
  const tokenRes = await fetch(`${base}/v1/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_secret: apiKey,
    }),
  });
  const tokenJson = await tokenRes.json();
  const accessToken = tokenJson.access_token;
  if (!tokenRes.ok || !accessToken?.startsWith("mat_")) {
    console.error("POST /v1/oauth/token failed", tokenRes.status, tokenJson);
    process.exit(1);
  }
  if (!accessToken.slice(4).includes(".")) {
    console.error("expected JWT body in mat_ token");
    process.exit(1);
  }

  const mcpList = await fetch(`${base}/mcp`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
  });
  const mcpJson = await mcpList.json();
  if (!mcpList.ok || !mcpJson.result?.tools?.length) {
    console.error("MCP tools/list with mat_ JWT failed", mcpList.status, mcpJson);
    process.exit(1);
  }
  console.log("oauth mat_ JWT OK", { tools: mcpJson.result.tools.length });

  console.log("contract-qa-agent OK");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
