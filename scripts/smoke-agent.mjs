#!/usr/bin/env node
/** Smoke remote MCP (OAuth + Streamable HTTP) + agent API */
import "./load-env.mjs";

const base = (
  process.env.MAILAGENT_API_URL ?? "https://api.webmailagent.com"
).replace(/\/$/, "");
const apiKey = process.env.MAILAGENT_API_KEY ?? process.env.API_KEY;

if (!apiKey) {
  console.error("Set MAILAGENT_API_KEY");
  process.exit(1);
}

const jsonHeaders = {
  Authorization: `Bearer ${apiKey}`,
  "Content-Type": "application/json",
  Accept: "application/json, text/event-stream",
};

async function main() {
  console.log("Smoke agent →", base);

  const agent = await fetch(`${base}/v1/agent`, { headers: jsonHeaders });
  const agentJson = await agent.json();
  console.log("GET /v1/agent", agent.status, agentJson.version ?? "");
  if (!agent.ok) process.exit(1);

  const discovery = await fetch(`${base}/.well-known/oauth-protected-resource/mcp`);
  console.log("GET oauth-protected-resource/mcp", discovery.status);
  if (!discovery.ok) process.exit(1);

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
  console.log(
    "POST /v1/oauth/token",
    tokenRes.status,
    accessToken ? `mat_${accessToken.slice(4, 12)}…` : tokenJson.error
  );
  if (!tokenRes.ok || !accessToken) process.exit(1);

  const oauthHeaders = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
  };

  const init = await fetch(`${base}/mcp`, {
    method: "POST",
    headers: oauthHeaders,
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
    "POST /mcp initialize (OAuth token)",
    init.status,
    "session=",
    sessionId ?? "(none)"
  );
  if (!init.ok) process.exit(1);

  const mcpHeaders = {
    ...oauthHeaders,
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

  const unauth = await fetch(`${base}/mcp`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 9, method: "ping" }),
  });
  const www = unauth.headers.get("WWW-Authenticate");
  console.log("POST /mcp unauth", unauth.status, www ? "WWW-Authenticate=ok" : "");
  if (unauth.status !== 401) process.exit(1);

  const created = await fetch(`${base}/v1/inboxes`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      label: `smoke-progress-${Date.now()}`,
      ttlMinutes: 5,
    }),
  });
  const inbox = await created.json();
  if (!created.ok) {
    console.error("create inbox for progress smoke failed", inbox);
    process.exit(1);
  }

  const streamRes = await fetch(`${base}/mcp`, {
    method: "POST",
    headers: {
      ...oauthHeaders,
      ...(sessionId ? { "Mcp-Session-Id": sessionId } : {}),
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: {
        name: "mailagent_wait_for_message",
        arguments: { inboxId: inbox.id, timeoutSeconds: 4 },
      },
    }),
  });
  const streamText = await streamRes.text();
  const progressCount = (streamText.match(/notifications\/progress/g) ?? []).length;
  console.log(
    "POST /mcp wait stream",
    streamRes.status,
    streamRes.headers.get("content-type"),
    `progress=${progressCount}`
  );
  if (!streamRes.ok || progressCount < 1) process.exit(1);

  await fetch(`${base}/v1/inboxes/${inbox.id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${apiKey}` },
  });

  if (sessionId) {
    await fetch(`${base}/mcp`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Mcp-Session-Id": sessionId,
      },
    });
  }

  const runs = await fetch(`${base}/v1/agent/runs?limit=1`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  console.log("GET /v1/agent/runs", runs.status);
  if (!runs.ok) process.exit(1);

  console.log("OK", {
    version: agentJson.version,
    mcpTools: tools,
    oauth: true,
    session: !!sessionId,
    progress: progressCount,
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
