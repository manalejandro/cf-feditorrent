import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext, json, badRequest } from "@/lib/cf";
import { hashPassword, createSessionToken } from "@/lib/auth";
import { generateKeyPair } from "@/lib/activitypub/security";
import { generateId, actorIRI } from "@/lib/activitypub/utils";
import { getActorByUsername, getActorByEmail, createActor, setEmailVerificationToken } from "@/lib/db";
import { sendVerificationEmail } from "@/lib/email";

async function verifyTurnstile(token: string, secret: string): Promise<boolean> {
  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret, response: token }),
    });
    const data: any = await res.json();
    return data.success === true;
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  try {
    const { env } = getCloudflareContext();
    const { username, email, password, confirmPassword, turnstileToken } = await request.json() as { username?: string; email?: string; password?: string; confirmPassword?: string; turnstileToken?: string };

    if (!username || !email || !password || !confirmPassword) {
      return badRequest("All fields are required");
    }

    if (password.length < 8) return badRequest("Password must be at least 8 characters");
    if (password !== confirmPassword) return badRequest("Passwords do not match");

    const validTurnstile = await verifyTurnstile(turnstileToken || "", env.TURNSTILE_SECRET_KEY);
    if (!validTurnstile) return badRequest("Captcha verification failed");

    const usernameRegex = /^[a-z0-9_]{2,30}$/;
    if (!usernameRegex.test(username)) return badRequest("Username must be 2-30 characters (lowercase, numbers, underscores)");

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) return badRequest("Invalid email address");

    const domain = new URL(env.INSTANCE_URL).hostname;

    const existingUser = await getActorByUsername(env.DB, username, domain);
    if (existingUser) return badRequest("Username already taken");

    const existingEmail = await getActorByEmail(env.DB, email);
    if (existingEmail) return badRequest("Email already registered");

    const actorId = actorIRI(env.INSTANCE_URL, username);
    const passwordHash = await hashPassword(password);
    const keys = await generateKeyPair();

    await createActor(env.DB, {
      id: actorId,
      username,
      domain,
      publicKeyPem: keys.publicKeyPem,
      privateKeyPem: keys.privateKeyPem,
      email,
      passwordHash,
    });

    const verificationToken = crypto.randomUUID();
    await setEmailVerificationToken(env.DB, actorId, verificationToken);

    try {
      await sendVerificationEmail(actorId, email, verificationToken);
    } catch {
      // email sending is best-effort
    }

    return json({ verified: false });
  } catch (err) {
    console.error("[register] Error:", err);
    return json({ error: "Registration failed" }, 500);
  }
}
