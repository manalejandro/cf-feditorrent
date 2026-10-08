import { NextRequest } from "next/server";
import { json, unauthorized } from "@/lib/cf";
import { getSessionActor } from "@/lib/auth";
import { markNotificationRead } from "@/lib/db";
import { env } from "cloudflare:workers";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = request.headers.get("authorization")?.replace("Bearer ", "");
  if (!auth) return unauthorized();
  const session = await getSessionActor(env.DB, auth);
  if (!session) return unauthorized();

  const { id } = await params;
  await markNotificationRead(env.DB, id);
  return json({ ok: true });
}
