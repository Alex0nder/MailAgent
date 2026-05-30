/** Bindings Cloudflare Worker + секреты */
export interface Env {
  ASSETS: Fetcher;
  DATABASE_URL: string;
  RESEND_API_KEY: string;
  RESEND_WEBHOOK_SECRET: string;
  API_KEY: string;
  INBOX_DOMAIN: string;
  DEFAULT_TTL_MINUTES: string;
  MAIL_QUEUE: Queue<EmailQueueMessage>;
  INBOX_WAIT: DurableObjectNamespace;
}

export interface EmailQueueMessage {
  provider: "resend";
  emailId: string;
  from: string;
  to: string[];
  subject: string;
  receivedAt: string;
}

export interface MessageNotifyPayload {
  id: string;
  inboxId: string;
  from: string;
  subject: string;
  otp: string | null;
  links: string[];
  primaryLink: string | null;
  receivedAt: string;
}
