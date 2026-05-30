import type { Env, EmailQueueMessage, MessageNotifyPayload } from "../env";
import type { InboxRow } from "../services/inbox";
import { processInboundEmail } from "../services/resend-mail";

export async function handleQueueBatch(
  batch: MessageBatch<EmailQueueMessage>,
  env: Env
): Promise<void> {
  for (const msg of batch.messages) {
    try {
      await processInboundEmail(env, msg.body, (inbox, payload) =>
        notifyInbox(env, inbox, payload)
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
  inbox: InboxRow,
  payload: MessageNotifyPayload
): Promise<void> {
  const id = env.INBOX_WAIT.idFromName(inbox.id);
  const stub = env.INBOX_WAIT.get(id);
  await stub.fetch("http://do/notify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}
