/** Ожидание первого письма (poll) — для /wait и /open */

import type { Env } from "../env";
import { listMessages, type MessageRow } from "./inbox";

export async function waitForFirstMessage(
  env: Env,
  inboxId: string,
  timeoutSec: number
): Promise<MessageRow | null> {
  const cap = Math.min(Math.max(timeoutSec, 5), 120);
  const deadline = Date.now() + cap * 1000;

  while (Date.now() < deadline) {
    const messages = await listMessages(env, inboxId);
    if (messages.length > 0) return messages[0];
    await sleep(500);
  }
  return null;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
