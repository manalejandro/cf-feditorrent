import type {
  D1Database,
  KVNamespace,
  Queue,
  Fetcher,
  DurableObjectNamespace,
} from "@cloudflare/workers-types";

export type { D1Database, KVNamespace, Queue, Fetcher, DurableObjectNamespace };

export interface EmailAddress {
  email: string;
  name?: string;
}

export interface EmailMessageBuilder {
  to: string | EmailAddress | (string | EmailAddress)[];
  from: string | EmailAddress;
  subject: string;
  html?: string;
  text?: string;
  cc?: string | EmailAddress | (string | EmailAddress)[];
  bcc?: string | EmailAddress | (string | EmailAddress)[];
  replyTo?: string | EmailAddress;
  headers?: Record<string, string>;
}

export interface EmailSendResult {
  messageId: string;
}

export interface SendEmail {
  send(message: EmailMessageBuilder): Promise<EmailSendResult>;
}

export interface CloudflareEnv {
  DB: D1Database;
  TORRENTS_KV: KVNamespace;
  DELIVERY_QUEUE: Queue;
  TRACKER: DurableObjectNamespace;
  ASSETS: Fetcher;
  INSTANCE_TITLE: string;
  INSTANCE_DESCRIPTION: string;
  INSTANCE_VERSION: string;
  INSTANCE_URL: string;
  NODE_ENV: string;
  TURNSTILE_SITE_KEY: string;
  TURNSTILE_SECRET_KEY: string;
  SECRET_KEY: string;
  MAX_TORRENTS?: string;
  TORRENT_EXPIRY_MINUTES?: string;
  EMAIL?: SendEmail;
  EMAIL_FROM?: string;
  EMAIL_FROM_NAME?: string;
}

declare global {
  interface CloudflareContext {
    env: CloudflareEnv;
    ctx: ExecutionContext;
  }
}
