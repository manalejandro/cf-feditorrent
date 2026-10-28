import { NextRequest } from "next/server";
import { json, badRequest } from "@/lib/cf";
import { getActorByEmail, setEmailVerificationToken } from "@/lib/db";
import { sendVerificationEmail } from "@/lib/email";
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
    const rlEmail = await consumeRateLimit(env.TORRENTS_KV, `resend:${normalizedEmail}`, 3, 3600);
    if (!rlEmail.ok) return tooManyRequests(rlEmail.retryAfter, "Too many requests, try later");
    const rlIp = await consumeRateLimit(env.TORRENTS_KV, `resend:ip:${clientIp(request)}`, 10, 3600);
    if (!rlIp.ok) return tooManyRequests(rlIp.retryAfter, "Too many requests, try later");

    const actor = await getActorByEmail(env.DB, normalizedEmail);
    if (actor && !actor.emailVerified) {
      const token = crypto.randomUUID();
      await setEmailVerificationToken(env.DB, actor.id, token);
      try {
        await sendVerificationEmail(actor.id, normalizedEmail, token);
      } catch (err) {
        console.error("[resend-verification] Email send failed:", err);
      }
    }

    return json({ message: "If that email is registered, a new verification link has been sent." });
  } catch (err) {
    console.error("[resend-verification] Error:", err);
    return json({ error: "Failed to process request" }, 500);
  }
}
