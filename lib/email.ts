import { getCloudflareContext } from "@/lib/cf";

function buildHtml(type: string, data: Record<string, string>): string {
  const base = (content: string) => `<!DOCTYPE html><html><body style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:20px"><div style="background:linear-gradient(135deg,#6366f1,#8b5cf6);padding:30px;border-radius:12px 12px 0 0;text-align:center"><h1 style="color:white;margin:0;font-size:24px">FediTorrent</h1></div><div style="background:#fff;border:1px solid #e5e7eb;border-top:0;padding:30px;border-radius:0 0 12px 12px">${content}</div></body></html>`;

  switch (type) {
    case "verification":
      return base(`<h2 style="margin-top:0">Verify your email</h2><p>Click the link below to verify your email address:</p><p style="text-align:center"><a href="${data.link}" style="display:inline-block;padding:12px 24px;background:#6366f1;color:white;text-decoration:none;border-radius:8px;font-weight:bold">Verify Email</a></p><p style="color:#6b7280;font-size:14px">If you didn't create an account, you can safely ignore this email.</p><hr><p style="color:#6b7280;font-size:12px;text-align:center">O <a href="${data.link}" style="color:#6366f1">${data.link}</a></p>`);
    case "password-reset":
      return base(`<h2 style="margin-top:0">Reset your password</h2><p>Click the link below to reset your password. This link expires in 1 hour.</p><p style="text-align:center"><a href="${data.link}" style="display:inline-block;padding:12px 24px;background:#6366f1;color:white;text-decoration:none;border-radius:8px;font-weight:bold">Reset Password</a></p><p style="color:#6b7280;font-size:14px">If you didn't request a password reset, you can safely ignore this email.</p>`);
    case "password-reset-confirm":
      return base(`<h2 style="margin-top:0">Password reset successful</h2><p>Your password has been reset successfully.</p><p>You can now sign in with your new password.</p>`);
    default:
      return base(`<p>${JSON.stringify(data)}</p>`);
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export async function trySend(to: string, subject: string, html: string): Promise<void> {
  try {
    const { env } = getCloudflareContext();
    if (env.EMAIL && env.EMAIL_FROM) {
      await env.EMAIL.send({
        to,
        from: { email: env.EMAIL_FROM!, name: env.EMAIL_FROM_NAME || "FediTorrent" },
        subject,
        html,
      });
    } else {
      console.log(`[email] Would send to ${to}: ${subject}`);
    }
  } catch (err) {
    console.error("[email] Error sending email:", err);
  }
}

export async function sendVerificationEmail(actorId: string, email: string, token: string): Promise<void> {
  const { env } = getCloudflareContext();
  const link = `${env.INSTANCE_URL}/api/auth/verify-email?token=${encodeURIComponent(token)}`;
  await trySend(email, `Verify your ${env.INSTANCE_TITLE} account`, buildHtml("verification", { link }));
}

export async function sendPasswordResetEmail(email: string, token: string): Promise<void> {
  const { env } = getCloudflareContext();
  const link = `${env.INSTANCE_URL}/?reset-token=${encodeURIComponent(token)}`;
  await trySend(email, `Reset your ${env.INSTANCE_TITLE} password`, buildHtml("password-reset", { link }));
}

export async function sendPasswordResetConfirmation(email: string): Promise<void> {
  const { env } = getCloudflareContext();
  await trySend(email, `${env.INSTANCE_TITLE} password reset`, buildHtml("password-reset-confirm", {}));
}
