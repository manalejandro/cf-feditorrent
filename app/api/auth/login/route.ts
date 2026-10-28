import { NextRequest } from "next/server";
import { json, badRequest, unauthorized } from "@/lib/cf";
import { verifyPassword, createSessionToken, needsRehash, hashPassword } from "@/lib/auth";
import { getActorByUsername, getActorByEmail, updateActorPassword } from "@/lib/db";
import { consumeRateLimit, clientIp, tooManyRequests } from "@/lib/ratelimit";
import { env } from "cloudflare:workers";

async function verifyTurnstile(token: string, secret: string): Promise<boolean> {
  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret, response: token }),
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { success?: boolean };
    return data.success === true;
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  try {
    let username: string | undefined;
    let password: string | undefined;
    let turnstileToken: string | undefined;
    try {
      ({ username, password, turnstileToken } = (await request.json()) as {
        username?: string;
        password?: string;
        turnstileToken?: string;
      });
    } catch {
      return badRequest("Invalid JSON body");
    }

    if (!username || !password) return badRequest("Username and password are required");

    // Brute-force protection: per-IP and per-account limits.
    const ip = clientIp(request);
    const rlIp = await consumeRateLimit(env.TORRENTS_KV, `login:ip:${ip}`, 30, 900);
    if (!rlIp.ok) return tooManyRequests(rlIp.retryAfter, "Too many login attempts, try later");
    const rlAccount = await consumeRateLimit(
      env.TORRENTS_KV,
      `login:acct:${username.toLowerCase()}`,
      10,
      3600
    );
    if (!rlAccount.ok) {
      return tooManyRequests(rlAccount.retryAfter, "Too many login attempts for this account");
    }

    if (!env.TURNSTILE_SECRET_KEY) {
      console.error("[login] TURNSTILE_SECRET_KEY is not configured");
      return json({ error: "Login is temporarily unavailable" }, 503);
    }
    const validTurnstile = await verifyTurnstile(turnstileToken || "", env.TURNSTILE_SECRET_KEY);
    if (!validTurnstile) return badRequest("Captcha verification failed");

    const domain = new URL(env.INSTANCE_URL).hostname;
    let actor = await getActorByUsername(env.DB, username, domain);
    if (!actor && username.includes("@")) {
      actor = await getActorByEmail(env.DB, username.toLowerCase());
    }
    // Uniform response for unknown user / bad password / no password.
    if (!actor?.passwordHash) return unauthorized();

    const valid = await verifyPassword(password, actor.passwordHash);
    if (!valid) return unauthorized();

    // Transparently upgrade legacy 100k-iteration hashes to the current work factor.
    if (needsRehash(actor.passwordHash)) {
      try {
        await updateActorPassword(env.DB, actor.id, await hashPassword(password));
      } catch (err) {
        console.error("[login] Rehash failed:", err);
      }
    }

    if (!actor.emailVerified) {
      return json({ error: "Email not verified", code: "EMAIL_NOT_VERIFIED" }, 403);
    }

    const token = await createSessionToken(env.DB, actor.id, actor.id);

    return json({ token, username: actor.username, actorId: actor.id });
  } catch (err) {
    console.error("[login] Error:", err);
    return json({ error: "Login failed" }, 500);
  }
}
