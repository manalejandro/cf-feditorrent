import { NextRequest } from "next/server";
import { json, badRequest } from "@/lib/cf";
import { getActorByEmail, setPasswordResetToken } from "@/lib/db";
import { sendPasswordResetEmail } from "@/lib/email";
import { consumeRateLimit, clientIp, tooManyRequests } from "@/lib/ratelimit";
import { env } from "cloudflare:workers";

export async function POST(request: NextRequest) {
  try {
    let email: string | undefined;
    try {
      ({ email } = (await request.json()) as { email?: string });
    } catch {
      return badRequest("Invalid JSON body");
    }

    if (!email) return badRequest("Email is required");
    const normalizedEmail = email.toLowerCase();

    // Anti email-bombing: few requests per address and per IP.
    const rlEmail = await consumeRateLimit(env.TORRENTS_KV, `forgot:${normalizedEmail}`, 3, 3600);
    if (!rlEmail.ok) return tooManyRequests(rlEmail.retryAfter, "Too many requests, try later");
    const rlIp = await consumeRateLimit(env.TORRENTS_KV, `forgot:ip:${clientIp(request)}`, 10, 3600);
    if (!rlIp.ok) return tooManyRequests(rlIp.retryAfter, "Too many requests, try later");

    const actor = await getActorByEmail(env.DB, normalizedEmail);
    if (actor) {
      const token = await setPasswordResetToken(env.DB, actor.id);
      try {
        await sendPasswordResetEmail(normalizedEmail, token);
      } catch (err) {
        console.error("[forgot-password] Email send failed:", err);
      }
    }

    // Uniform response: never reveal whether the email is registered.
    return json({ message: "If that email is registered, a password reset link has been sent." });
  } catch (err) {
    console.error("[forgot-password] Error:", err);
    return json({ error: "Failed to process request" }, 500);
  }
}
