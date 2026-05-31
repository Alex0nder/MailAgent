/** Remote MCP: JSON-RPC over HTTP (Bearer API key) */
import { Hono, type Context } from "hono";
import type { Env } from "../env";
import type { ApiVariables } from "../lib/api-context";
import { requireApiKey } from "../lib/auth";
import { rateLimit } from "../lib/rate-limit";
import { executeMcpTool } from "../mcp/handlers";
import { MCP_SERVER_INFO, MCP_TOOLS } from "../mcp/manifest";

type Ctx = Context<{ Bindings: Env; Variables: ApiVariables }>;

export const mcpHttpRoutes = new Hono<{ Bindings: Env; Variables: ApiVariables }>();

mcpHttpRoutes.use("*", requireApiKey);
mcpHttpRoutes.use("*", rateLimit);

mcpHttpRoutes.get("/", (c) => {
  return c.json({
    protocol: "mcp",
    transport: "http-jsonrpc",
    endpoint: "POST /mcp",
    auth: "Authorization: Bearer <API_KEY>",
    tools: MCP_TOOLS.length,
    docs: "https://webmailagent.com/docs/agents.html#remote-mcp",
  });
});

mcpHttpRoutes.post("/", (c) => handleJsonRpc(c));

async function handleJsonRpc(c: Ctx) {
  let body: JsonRpcRequest | JsonRpcRequest[];
  try {
    body = await c.req.json();
  } catch {
    return c.json(rpcError(null, -32700, "Parse error"), 400);
  }

  const auth = {
    apiKeyHint: c.get("apiKeyHint"),
    teamId: c.get("teamId"),
  };

  if (Array.isArray(body)) {
    const results = await Promise.all(
      body.map((req) => dispatchRpc(c.env, auth, req))
    );
    return c.json(results);
  }

  const result = await dispatchRpc(c.env, auth, body);
  if (result === null) {
    return new Response(null, { status: 204 });
  }
  return c.json(result);
}

type JsonRpcRequest = {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
};

type JsonRpcResponse = {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
};

async function dispatchRpc(
  env: Env,
  auth: { apiKeyHint: string; teamId: string | null },
  req: JsonRpcRequest
): Promise<JsonRpcResponse | null> {
  const id = req.id ?? null;
  if (req.method?.startsWith("notifications/")) {
    return null;
  }
  if (!req.method) {
    return rpcError(id, -32600, "Invalid Request");
  }

  try {
    switch (req.method) {
      case "initialize":
        return {
          jsonrpc: "2.0",
          id,
          result: {
            protocolVersion: "2024-11-05",
            capabilities: { tools: {} },
            serverInfo: MCP_SERVER_INFO,
          },
        };

      case "tools/list":
        return {
          jsonrpc: "2.0",
          id,
          result: { tools: MCP_TOOLS },
        };

      case "tools/call": {
        const params = req.params ?? {};
        const name = params.name as string;
        const toolArgs = (params.arguments ?? {}) as Record<string, unknown>;
        if (!name) {
          return rpcError(id, -32602, "Missing tool name");
        }
        const out = await executeMcpTool(env, auth, name, toolArgs);
        return { jsonrpc: "2.0", id, result: out };
      }

      case "ping":
        return { jsonrpc: "2.0", id, result: {} };

      default:
        return rpcError(id, -32601, `Method not found: ${req.method}`);
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return rpcError(id, -32603, message);
  }
}

function rpcError(
  id: string | number | null,
  code: number,
  message: string,
  data?: unknown
): JsonRpcResponse {
  return {
    jsonrpc: "2.0",
    id,
    error: { code, message, data },
  };
}
