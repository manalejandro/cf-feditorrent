/**
 * Tracker authorization tokens.
 *
 * A torrent is "authorized" for announcing while its D1 row exists; the KV
 * entry carries an HMAC token used by browser seeders and legacy flows. The
 * secret MUST be configured — the previous "default-insecure-key" fallback made
 * tokens forgeable by anyone with repo access.
 */

import type { KVNamespace } from "@cloudflare/workers-types";

export interface TrackerTokenEnv {
  SECRET_KEY?: string;
  TORRENT_EXPIRY_MINUTES?: string;
}

export class MissingSecretError extends Error {
  constructor() {
    super("SECRET_KEY is not configured");
    this.name = "MissingSecretError";
  }
}

function requireSecret(env: TrackerTokenEnv): string {
  if (!env.SECRET_KEY) throw new MissingSecretError();
  return env.SECRET_KEY;
}

export interface TrackerToken {
  token: string;
  expiresAt: number;
  expiryMinutes: number;
}

export async function createTrackerToken(
  kv: KVNamespace,
  env: TrackerTokenEnv,
  infoHash: string
): Promise<TrackerToken> {
  const secret = requireSecret(env);
  const expiryMinutes = Math.max(1, parseInt(env.TORRENT_EXPIRY_MINUTES || "30", 10) || 30);
  const timestamp = Date.now();
  const data = `${infoHash}-${timestamp}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  const token = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  await kv.put(infoHash, JSON.stringify({ token, timestamp, infoHash }), {
    expirationTtl: expiryMinutes * 60,
  });
  return { token, expiresAt: timestamp + expiryMinutes * 60 * 1000, expiryMinutes };
}

/** Per-actor torrent quota (replaces the old global KV-key count, which any
 *  unauthenticated caller could exhaust to block the whole instance). */
export const SLUG_REGEX = /^[a-zA-Z0-9][a-zA-Z0-9-_]{0,63}$/;

/** Validate a magnet URI: must be a magnet: URI carrying a btih info hash. */
export function isValidMagnetUri(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 4000) return false;
  if (!/^magnet:\?/i.test(value)) return false;
  return /(^|[?&])xt=urn:btih:[0-9a-fA-F]{40}/i.test(value) ||
    /(^|[?&])xt=urn:btih:[a-zA-Z2-7]{32}/i.test(value);
}
