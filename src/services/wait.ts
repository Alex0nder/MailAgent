/** Ожидание первого письма (poll) — для /wait и /open */

import type { Env } from "../env";
import { listMessages, type MessageRow } from "./inbox";

export async function waitForFirstMessage(
  env: Env,
  inboxId: string,
  timeoutSec: number,
  options?: { subjectContains?: string }
): Promise<MessageRow | null> {
  const cap = Math.min(Math.max(timeoutSec, 5), 120);
  const needle = options?.subjectContains?.trim().toLowerCase();
  const deadline = Date.now() + cap * 1000;

  while (Date.now() < deadline) {
    const messages = await listMessages(env, inboxId, {
      subjectContains: needle,
    });
    const match = messages[0];
    if (match) return match;
    await sleep(500);
  }
  return null;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
