/** Bindings Cloudflare Worker + секреты */
export interface Env {
  ASSETS: Fetcher;
  DATABASE_URL: string;
  RESEND_API_KEY: string;
  RESEND_WEBHOOK_SECRET: string;
  API_KEY: string;
  /** Опционально: ключи пилотов через запятую (hosted) */
  API_KEYS?: string;
  INBOX_DOMAIN: string;
  DEFAULT_TTL_MINUTES: string;
  MAIL_QUEUE: Queue<EmailQueueMessage>;
  INBOX_WAIT: DurableObjectNamespace;
  /** Опционально: rate limit per API key (hosted) */
  RATE_LIMIT?: KVNamespace;
  RATE_LIMIT_PER_MINUTE?: string;
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
