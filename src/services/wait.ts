/** Ожидание первого письма (poll) — для /wait, /open, MCP progress */
import type { Env } from "../env";
import { listMessages, type MessageRow } from "./inbox";

export type WaitProgressEvent = {
  inboxId: string;
  elapsedSec: number;
  timeoutSec: number;
  progress: number;
  status: "waiting" | "received";
  message: string;
  messageCount?: number;
};

export async function waitForFirstMessage(
  env: Env,
  inboxId: string,
  timeoutSec: number,
  options?: {
    subjectContains?: string;
    onProgress?: (event: WaitProgressEvent) => void;
  }
): Promise<MessageRow | null> {
  const cap = Math.min(Math.max(timeoutSec, 5), 120);
  const needle = options?.subjectContains?.trim().toLowerCase();
  const deadline = Date.now() + cap * 1000;
  const started = Date.now();
  let lastEmitSec = -1;

  const emit = (status: WaitProgressEvent["status"], messageCount?: number) => {
    if (!options?.onProgress) return;
    const elapsedSec = Math.floor((Date.now() - started) / 1000);
    if (status === "waiting" && elapsedSec === lastEmitSec) return;
    lastEmitSec = elapsedSec;
    options.onProgress({
      inboxId,
      elapsedSec,
      timeoutSec: cap,
      progress: Math.min(100, Math.round((elapsedSec / cap) * 100)),
      status,
      message:
        status === "received"
          ? "Verification email received"
          : `Waiting for email (${elapsedSec}/${cap}s)…`,
      messageCount,
    });
  };

  emit("waiting", 0);

  while (Date.now() < deadline) {
    const messages = await listMessages(env, inboxId, {
      subjectContains: needle,
    });
    const match = messages[0];
    if (match) {
      emit("received", messages.length);
      return match;
    }
    emit("waiting", messages.length);
    await sleep(500);
  }
  return null;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
