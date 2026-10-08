import { NextRequest } from "next/server";
import { json, unauthorized } from "@/lib/cf";
import { getSessionActor } from "@/lib/auth";
import { getUnreadNotificationCount } from "@/lib/db";
import { env } from "cloudflare:workers";

export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization")?.replace("Bearer ", "");
  if (!auth) return unauthorized();
  const session = await getSessionActor(env.DB, auth);
  if (!session) return unauthorized();

  const count = await getUnreadNotificationCount(env.DB, session.id);
  return json({ count });
}
