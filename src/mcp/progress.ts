/** Progress notifications для MCP wait tools */
export type McpProgressParams = {
  progressToken: string;
  progress: number;
  total: number;
  message: string;
  status: "waiting" | "received";
  data?: Record<string, unknown>;
};

export type McpToolContext = {
  onProgress?: (params: McpProgressParams) => void;
};

const WAIT_TOOLS = new Set([
  "mailagent_verify_signup",
  "mailagent_wait_and_extract",
  "mailagent_wait_for_message",
]);

export function isWaitTool(name: string): boolean {
  return WAIT_TOOLS.has(name);
}

export function progressNotification(params: McpProgressParams) {
  return {
    jsonrpc: "2.0" as const,
    method: "notifications/progress",
    params,
  };
}
