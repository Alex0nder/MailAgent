/** POST в callback URL + запись в callback_deliveries */
import type { Env, MessageNotifyPayload } from "../env";
import { recordCallbackDelivery } from "./callback-log";

export async function fireInboxCallback(
  env: Env,
  input: {
    inboxId: string;
    messageId: string;
    callbackUrl: string;
    payload: MessageNotifyPayload & { address?: string; label?: string | null };
  }
): Promise<{ ok: boolean; statusCode: number | null }> {
  const started = Date.now();
  let statusCode: number | null = null;
  let ok = false;
  let errorText: string | null = null;

  try {
    const res = await fetch(input.callbackUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event: "message.received",
        ...input.payload,
      }),
    });
    statusCode = res.status;
    ok = res.ok;
    if (!ok) {
      errorText = `HTTP ${res.status}`;
      console.warn("callback failed", input.callbackUrl, res.status);
    }
  } catch (e) {
    errorText = e instanceof Error ? e.message : String(e);
    console.warn("callback error", input.callbackUrl, e);
  }

  const durationMs = Date.now() - started;
  await recordCallbackDelivery(env, {
    inboxId: input.inboxId,
    messageId: input.messageId,
    callbackUrl: input.callbackUrl,
    statusCode,
    ok,
    errorText,
    durationMs,
  });

  return { ok, statusCode };
}
