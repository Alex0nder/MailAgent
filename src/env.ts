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
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  /** Price id (price_…) для Pro подписки */
  STRIPE_PRICE_PRO?: string;
  /** TTL OAuth access token для MCP (сек, default 3600) */
  MCP_OAUTH_TOKEN_TTL_SEC?: string;
  /** OIDC IdP (Auth0/Google): issuer URL, e.g. https://tenant.us.auth0.com */
  OIDC_ISSUER?: string;
  OIDC_CLIENT_ID?: string;
  OIDC_CLIENT_SECRET?: string;
  /** Optional API audience for Auth0 */
  OIDC_AUDIENCE?: string;
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
