import { NextRequest } from "next/server";
import { json, badRequest } from "@/lib/cf";
import { hashPassword } from "@/lib/auth";
import { generateKeyPair } from "@/lib/activitypub/security";
import { actorIRI } from "@/lib/activitypub/utils";
import { getActorByUsername, getActorByEmail, createActor, setEmailVerificationToken } from "@/lib/db";
import { sendVerificationEmail } from "@/lib/email";
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
    let email: string | undefined;
    let password: string | undefined;
    let confirmPassword: string | undefined;
    let turnstileToken: string | undefined;
    try {
      ({ username, email, password, confirmPassword, turnstileToken } = (await request.json()) as {
        username?: string;
        email?: string;
        password?: string;
        confirmPassword?: string;
        turnstileToken?: string;
      });
    } catch {
      return badRequest("Invalid JSON body");
    }

    if (!username || !email || !password || !confirmPassword) {
      return badRequest("All fields are required");
    }

    const rl = await consumeRateLimit(env.TORRENTS_KV, `register:${clientIp(request)}`, 10, 3600);
    if (!rl.ok) return tooManyRequests(rl.retryAfter, "Too many registration attempts");

    if (password.length < 8) return badRequest("Password must be at least 8 characters");
    if (password.length > 1024) return badRequest("Password too long");
    if (password !== confirmPassword) return badRequest("Passwords do not match");

    if (!env.TURNSTILE_SECRET_KEY) {
      console.error("[register] TURNSTILE_SECRET_KEY is not configured");
      return json({ error: "Registration is temporarily unavailable" }, 503);
    }
    const validTurnstile = await verifyTurnstile(turnstileToken || "", env.TURNSTILE_SECRET_KEY);
    if (!validTurnstile) return badRequest("Captcha verification failed");

    const usernameRegex = /^[a-z0-9_]{2,30}$/;
    if (!usernameRegex.test(username)) return badRequest("Username must be 2-30 characters (lowercase, numbers, underscores)");

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const normalizedEmail = email.toLowerCase();
    if (!emailRegex.test(normalizedEmail) || normalizedEmail.length > 254) {
      return badRequest("Invalid email address");
    }

    const domain = new URL(env.INSTANCE_URL).hostname;

    const existingUser = await getActorByUsername(env.DB, username, domain);
    const existingEmail = await getActorByEmail(env.DB, normalizedEmail);
    if (existingUser || existingEmail) {
      // Uniform message: do not reveal whether the username or the email exists.
      return json({ error: "Username or email already in use" }, 409);
    }

    const actorId = actorIRI(env.INSTANCE_URL, username);
    const passwordHash = await hashPassword(password);
    const keys = await generateKeyPair();

    try {
      await createActor(env.DB, {
        id: actorId,
        username,
        domain,
        publicKeyPem: keys.publicKeyPem,
        privateKeyPem: keys.privateKeyPem,
        email: normalizedEmail,
        passwordHash,
      });
    } catch {
      // Race on the UNIQUE indexes (username/domain or email).
      return json({ error: "Username or email already in use" }, 409);
    }

    const verificationToken = crypto.randomUUID();
    await setEmailVerificationToken(env.DB, actorId, verificationToken);

    try {
      await sendVerificationEmail(actorId, normalizedEmail, verificationToken);
    } catch (err) {
      // The account exists but is unverified; the user can request a new link.
      console.error("[register] Verification email failed:", err);
    }

    return json({ verified: false });
  } catch (err) {
    console.error("[register] Error:", err);
    return json({ error: "Registration failed" }, 500);
  }
}
