import type { MessageNotifyPayload } from "../env";

/** SSE-подписка: агент ждёт письмо без long-poll на serverless */
export class InboxWait implements DurableObject {
  private subscribers = new Set<WritableStreamDefaultWriter<string>>();

  constructor(
    private state: DurableObjectState,
    _env: unknown
  ) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/subscribe" && request.method === "GET") {
      return this.handleSubscribe();
    }
    if (url.pathname === "/notify" && request.method === "POST") {
      const payload = (await request.json()) as MessageNotifyPayload;
      await this.broadcast(payload);
      return new Response("ok");
    }
    return new Response("not found", { status: 404 });
  }

  private handleSubscribe(): Response {
    const { readable, writable } = new TransformStream<string>();
    const writer = writable.getWriter();
    this.subscribers.add(writer);

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start: async (controller) => {
        controller.enqueue(
          encoder.encode(`event: connected\ndata: {}\n\n`)
        );
        const reader = readable.getReader();
        try {
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            controller.enqueue(encoder.encode(value));
          }
        } finally {
          this.subscribers.delete(writer);
          writer.releaseLock();
        }
      },
      cancel: () => {
        this.subscribers.delete(writer);
        void writer.abort();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  }

  private async broadcast(payload: MessageNotifyPayload): Promise<void> {
    const chunk = `event: message\ndata: ${JSON.stringify(payload)}\n\n`;
    const dead: WritableStreamDefaultWriter<string>[] = [];

    for (const writer of this.subscribers) {
      try {
        await writer.write(chunk);
      } catch {
        dead.push(writer);
      }
    }
    for (const w of dead) this.subscribers.delete(w);
  }
}
