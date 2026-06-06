/** Read context from globalSetup (.mailagent-context.json). */
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export type MailAgentPwContext = {
  inboxId: string;
  address: string;
  messageId: string;
  attachmentFilename?: string;
  createdAt: string;
};

export function loadMailAgentContext(): MailAgentPwContext | null {
  const envPath = process.env.MAILAGENT_PW_CONTEXT;
  const defaultPath = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    ".mailagent-context.json"
  );
  const file = envPath ?? defaultPath;
  if (!existsSync(file)) return null;
  return JSON.parse(readFileSync(file, "utf8")) as MailAgentPwContext;
}
