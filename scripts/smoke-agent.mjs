#!/usr/bin/env node
/** Smoke remote MCP + agent API */
import "./load-env.mjs";

const base = (
  process.env.MAILAGENT_API_URL ?? "https://api.webmailagent.com"
).replace(/\/$/, "");
const apiKey = process.env.MAILAGENT_API_KEY ?? process.env.API_KEY;

if (!apiKey) {
  console.error("Set MAILAGENT_API_KEY");
  process.exit(1);
}

const headers = {
  Authorization: `Bearer ${apiKey}`,
  "Content-Type": "application/json",
};

async function main() {
  console.log("Smoke agent →", base);

  const agent = await fetch(`${base}/v1/agent`, { headers });
  const agentJson = await agent.json();
  console.log("GET /v1/agent", agent.status);
  if (!agent.ok) process.exit(1);

  const mcp = await fetch(`${base}/mcp`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/list",
    }),
  });
  const mcpJson = await mcp.json();
  const tools = mcpJson.result?.tools?.length ?? 0;
  console.log("POST /mcp tools/list", mcp.status, `tools=${tools}`);
  if (!mcp.ok || tools < 1) process.exit(1);

  const runs = await fetch(`${base}/v1/agent/runs`, { headers });
  console.log("GET /v1/agent/runs", runs.status);
  if (!runs.ok) process.exit(1);

  console.log("OK", { version: agentJson.version, mcpTools: tools });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
