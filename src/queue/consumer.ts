import type { Env, EmailQueueMessage, MessageNotifyPayload } from "../env";
import { processInboundEmail } from "../services/resend-mail";

export async function handleQueueBatch(
  batch: MessageBatch<EmailQueueMessage>,
  env: Env
): Promise<void> {
  for (const msg of batch.messages) {
    try {
      await processInboundEmail(env, msg.body, (inboxId, payload) =>
        notifyInbox(env, inboxId, payload)
      );
      msg.ack();
    } catch (err) {
      console.error("queue process failed", err);
      msg.retry();
    }
  }
}

async function notifyInbox(
  env: Env,
  inboxId: string,
  payload: MessageNotifyPayload
): Promise<void> {
  const id = env.INBOX_WAIT.idFromName(inboxId);
  const stub = env.INBOX_WAIT.get(id);
  await stub.fetch("http://do/notify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}
