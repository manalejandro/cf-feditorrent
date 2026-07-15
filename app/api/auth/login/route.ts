import { NextRequest } from "next/server";
import { getCloudflareContext, json, badRequest, unauthorized } from "@/lib/cf";
import { verifyPassword, createSessionToken } from "@/lib/auth";
import { getActorByUsername, getActorByEmail } from "@/lib/db";

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
    const { username, password, turnstileToken } = await request.json() as { username?: string; password?: string; turnstileToken?: string };

    if (!username || !password) return badRequest("Username and password are required");

    const validTurnstile = await verifyTurnstile(turnstileToken || "", env.TURNSTILE_SECRET_KEY);
    if (!validTurnstile) return badRequest("Captcha verification failed");

    const domain = new URL(env.INSTANCE_URL).hostname;
    let actor = await getActorByUsername(env.DB, username, domain);
    if (!actor) {
      actor = await getActorByEmail(env.DB, username);
    }
    if (!actor) return unauthorized();

    if (!actor.passwordHash) return unauthorized();

    const valid = await verifyPassword(password, actor.passwordHash);
    if (!valid) return unauthorized();

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
