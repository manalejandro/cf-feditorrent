/**
 * Lightweight KV-backed rate limiter for abuse-prone endpoints (login,
 * password reset emails, remote resolves).
 *
 * KV is eventually consistent, so bursts can slip through right at the
 * boundary — acceptable for abuse mitigation, not for hard quotas.
 */

import type { KVNamespace } from "@cloudflare/workers-types";

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  /** Seconds until the window resets (best effort). */
  retryAfter: number;
}

/**
 * Consume one unit from the `limit` allowed per `windowSeconds` for `key`.
 */
export async function consumeRateLimit(
  kv: KVNamespace,
  key: string,
  limit: number,
  windowSeconds: number
): Promise<RateLimitResult> {
  const kvKey = `rl:${key}`;
  try {
    const raw = await kv.get<{ count: number; resetAt: number }>(kvKey, "json");
    const now = Date.now();
    if (!raw || raw.resetAt <= now) {
      await kv.put(
        kvKey,
        JSON.stringify({ count: 1, resetAt: now + windowSeconds * 1000 }),
        { expirationTtl: Math.max(60, windowSeconds) }
      );
      return { ok: true, remaining: limit - 1, retryAfter: windowSeconds };
    }
    if (raw.count >= limit) {
      return {
        ok: false,
        remaining: 0,
        retryAfter: Math.max(1, Math.ceil((raw.resetAt - now) / 1000)),
      };
    }
    // Keep the original window; bump the counter.
    await kv.put(
      kvKey,
      JSON.stringify({ count: raw.count + 1, resetAt: raw.resetAt }),
      { expirationTtl: Math.max(60, Math.ceil((raw.resetAt - now) / 1000)) }
    );
    return { ok: true, remaining: limit - raw.count - 1, retryAfter: windowSeconds };
  } catch (err) {
    // Fail open on KV errors so an outage does not lock everyone out,
    // but keep a log for observability.
    console.error("[ratelimit] KV error, failing open:", err);
    return { ok: true, remaining: limit, retryAfter: windowSeconds };
  }
}

/** Client IP as seen by Cloudflare (falls back to "unknown"). */
export function clientIp(request: Request): string {
  return (
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  );
}

/** 429 response with a proper Retry-After header. */
export function tooManyRequests(retryAfter: number, message = "Too many requests"): Response {
  return new Response(JSON.stringify({ error: message }), {
    status: 429,
    headers: {
      "Content-Type": "application/json",
      "Retry-After": String(retryAfter),
    },
  });
}
