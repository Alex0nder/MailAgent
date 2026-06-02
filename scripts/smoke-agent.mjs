#!/usr/bin/env node
/** Smoke remote MCP (Streamable HTTP) + agent API */
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
  Accept: "application/json, text/event-stream",
};

async function main() {
  console.log("Smoke agent →", base);

  const agent = await fetch(`${base}/v1/agent`, { headers });
  const agentJson = await agent.json();
  console.log("GET /v1/agent", agent.status, agentJson.version ?? "");
  if (!agent.ok) process.exit(1);

  const meta = await fetch(`${base}/mcp`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  const metaJson = await meta.json();
  console.log("GET /mcp", meta.status, "transports=", metaJson.transports?.join(","));
  if (!meta.ok) process.exit(1);

  const init = await fetch(`${base}/mcp`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 0,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "smoke-agent", version: "1.0" },
      },
    }),
  });
  const initJson = await init.json();
  const sessionId = init.headers.get("Mcp-Session-Id");
  console.log(
    "POST /mcp initialize",
    init.status,
    "session=",
    sessionId ?? "(none)",
    initJson.result?.serverInfo?.name
  );
  if (!init.ok) process.exit(1);

  const mcpHeaders = {
    ...headers,
    ...(sessionId ? { "Mcp-Session-Id": sessionId } : {}),
  };

  const mcp = await fetch(`${base}/mcp`, {
    method: "POST",
    headers: mcpHeaders,
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

  if (sessionId) {
    const sse = await fetch(`${base}/mcp`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "text/event-stream",
        "Mcp-Session-Id": sessionId,
      },
    });
    console.log("GET /mcp SSE", sse.status, sse.headers.get("content-type"));
    if (!sse.ok) process.exit(1);
    await sse.body?.cancel();

    const del = await fetch(`${base}/mcp`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Mcp-Session-Id": sessionId,
      },
    });
    console.log("DELETE /mcp session", del.status);
  }

  const runs = await fetch(`${base}/v1/agent/runs?limit=1`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  console.log("GET /v1/agent/runs", runs.status);
  if (!runs.ok) process.exit(1);

  console.log("OK", { version: agentJson.version, mcpTools: tools, session: !!sessionId });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
