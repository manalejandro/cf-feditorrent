import { NextRequest } from "next/server";
import { json, badRequest } from "@/lib/cf";
import { hashPassword } from "@/lib/auth";
import { getActorByPasswordResetToken, updateActorPassword } from "@/lib/db";
import { sendPasswordResetConfirmation } from "@/lib/email";
import { env } from "cloudflare:workers";

export async function POST(request: NextRequest) {
  try {
    const { token, password } = await request.json() as { token?: string; password?: string };

    if (!token || !password) return badRequest("Token and password are required");
    if (password.length < 8) return badRequest("Password must be at least 8 characters");

    const actor = await getActorByPasswordResetToken(env.DB, token);
    if (!actor) return badRequest("Invalid or expired reset token");

    const passwordHash = await hashPassword(password);
    await updateActorPassword(env.DB, actor.id, passwordHash);

    try {
      if (actor.email) await sendPasswordResetConfirmation(actor.email);
    } catch {
      // best-effort
    }

    return json({ message: "Password has been reset successfully." });
  } catch (err) {
    console.error("[reset-password] Error:", err);
    return json({ error: "Failed to reset password" }, 500);
  }
}
