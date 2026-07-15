import { NextRequest } from "next/server";
import { getCloudflareContext, json, badRequest } from "@/lib/cf";
import { getActorByEmail, setEmailVerificationToken } from "@/lib/db";
import { sendVerificationEmail } from "@/lib/email";

export async function POST(request: NextRequest) {
  try {
    const { env } = getCloudflareContext();
    const { email } = await request.json() as { email?: string };

    if (!email) return badRequest("Email is required");

    const actor = await getActorByEmail(env.DB, email);
    if (actor && !actor.emailVerified) {
      const token = crypto.randomUUID();
      await setEmailVerificationToken(env.DB, actor.id, token);
      try {
        await sendVerificationEmail(actor.id, email, token);
      } catch {
        // best-effort
      }
    }

    return json({ message: "If that email is registered, a new verification link has been sent." });
  } catch (err) {
    console.error("[resend-verification] Error:", err);
    return json({ error: "Failed to process request" }, 500);
  }
}
