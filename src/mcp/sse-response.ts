/** SSE framing для MCP Streamable HTTP */
import type { Env } from "../env";
import { drainSessionProgress } from "./session-progress";

export function jsonRpcAsSse(payload: unknown): string {
  return `event: message\ndata: ${JSON.stringify(payload)}\n\n`;
}

export function sseResponse(
  body: string | ReadableStream<Uint8Array>,
  extraHeaders?: Record<string, string>
): Response {
  return new Response(body, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      ...extraHeaders,
    },
  });
}

/** GET /mcp — keepalive + progress relay из KV очереди session */
export function mcpSseSessionStream(
  env: Env,
  sessionId: string,
  signal: AbortSignal
): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      controller.enqueue(enc.encode(": connected\n\n"));

      const progressTimer = setInterval(async () => {
        if (signal.aborted) return;
        try {
          const items = await drainSessionProgress(env, sessionId);
          for (const item of items) {
            controller.enqueue(enc.encode(jsonRpcAsSse(item)));
          }
        } catch {
          clearInterval(progressTimer);
        }
      }, 1000);

      const pingTimer = setInterval(() => {
        if (signal.aborted) return;
        try {
          controller.enqueue(enc.encode(": ping\n\n"));
        } catch {
          clearInterval(pingTimer);
        }
      }, 25_000);

      signal.addEventListener(
        "abort",
        () => {
          clearInterval(progressTimer);
          clearInterval(pingTimer);
          try {
            controller.close();
          } catch {
            /* already closed */
          }
        },
        { once: true }
      );
    },
  });
}

/** @deprecated use mcpSseSessionStream */
export function mcpSseKeepaliveStream(signal: AbortSignal): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      controller.enqueue(enc.encode(": connected\n\n"));
      const timer = setInterval(() => {
        if (signal.aborted) return;
        try {
          controller.enqueue(enc.encode(": ping\n\n"));
        } catch {
          clearInterval(timer);
        }
      }, 25_000);
      signal.addEventListener(
        "abort",
        () => {
          clearInterval(timer);
          try {
            controller.close();
          } catch {
            /* already closed */
          }
        },
        { once: true }
      );
    },
  });
}
