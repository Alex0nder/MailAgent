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
  if (!hub.json.mcpTools.includes("mailagent_verify_signup")) {
    console.error("mailagent_verify_signup missing from hub");
    process.exit(1);
  }
  if (!hub.json.mcpTools.includes("mailagent_get_run_session")) {
    console.error("mailagent_get_run_session missing from hub");
    process.exit(1);
  }
  if (!hub.json.runs?.session?.patch) {
    console.error("runs.session discovery missing", hub.json.runs);
    process.exit(1);
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
  if (!d?.skill?.install || !d?.codex?.marketplace || !d?.npm?.length) {
    console.error("distribution discovery missing", d);
    process.exit(1);
  }
  console.log("agent hub OK", {
    tools: hub.json.mcpTools.length,
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
