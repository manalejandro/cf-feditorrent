import { NextRequest } from "next/server";
import { getCloudflareContext, json, badRequest } from "@/lib/cf";
import { getActorByEmail, setPasswordResetToken } from "@/lib/db";
import { sendPasswordResetEmail } from "@/lib/email";

export async function POST(request: NextRequest) {
  try {
    const { env } = getCloudflareContext();
    const { email } = await request.json() as { email?: string };

    if (!email) return badRequest("Email is required");

    const actor = await getActorByEmail(env.DB, email);
    if (actor) {
      const token = await setPasswordResetToken(env.DB, actor.id);
      try {
        await sendPasswordResetEmail(email, token);
      } catch {
        // best-effort
      }
    }

    return json({ message: "If that email is registered, a password reset link has been sent." });
  } catch (err) {
    console.error("[forgot-password] Error:", err);
    return json({ error: "Failed to process request" }, 500);
  }
}
