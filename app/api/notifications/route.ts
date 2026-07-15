import { NextRequest } from "next/server";
import { getCloudflareContext, json, unauthorized } from "@/lib/cf";
import { getSessionActor } from "@/lib/auth";
import { getNotifications, getActorById } from "@/lib/db";

export async function GET(request: NextRequest) {
  const { env } = getCloudflareContext();
  const auth = request.headers.get("authorization")?.replace("Bearer ", "");
  if (!auth) return unauthorized();
  const session = await getSessionActor(env.DB, auth);
  if (!session) return unauthorized();

  const notifications = await getNotifications(env.DB, session.id);

  const enriched = await Promise.all(
    notifications.map(async (n) => {
      const actor = n.accountId ? await getActorById(env.DB, n.accountId) : null;
      return {
        id: n.id,
        type: n.type,
        accountId: n.accountId,
        objectId: n.objectId,
        read: n.read,
        createdAt: n.createdAt,
        actor: actor ? {
          id: actor.id,
          username: actor.username,
          displayName: actor.displayName,
          avatarUrl: actor.avatarUrl,
        } : null,
      };
    })
  );

  return json(enriched);
}
