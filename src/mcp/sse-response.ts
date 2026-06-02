/** SSE framing для MCP Streamable HTTP */

export function jsonRpcAsSse(payload: unknown): string {
  return `event: message\ndata: ${JSON.stringify(payload)}\n\n`;
}

export function sseResponse(
  body: string,
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

/** GET /mcp — keepalive для клиентов с открытым SSE каналом */
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
