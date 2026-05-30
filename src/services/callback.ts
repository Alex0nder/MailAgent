/** POST в callback URL тестового фреймворка после письма */

import type { MessageNotifyPayload } from "../env";

export async function fireInboxCallback(
  callbackUrl: string,
  payload: MessageNotifyPayload & { address?: string; label?: string | null }
): Promise<void> {
  try {
    const res = await fetch(callbackUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event: "message.received",
        ...payload,
      }),
    });
    if (!res.ok) {
      console.warn("callback failed", callbackUrl, res.status);
    }
  } catch (e) {
    console.warn("callback error", callbackUrl, e);
  }
}
