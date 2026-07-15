import { NextRequest } from "next/server";
import { getCloudflareContext, json, badRequest, unauthorized } from "@/lib/cf";
import { getSessionActor } from "@/lib/auth";
import { generateId, buildFollow, buildUndo, activityIRI } from "@/lib/activitypub/utils";
import { getActorById, getFollow, deleteFollow, updateActorCounts } from "@/lib/db";
import { deliverToInbox } from "@/lib/activitypub/federation";

export async function POST(request: NextRequest) {
  const { env } = getCloudflareContext();
  const auth = request.headers.get("authorization")?.replace("Bearer ", "");
  if (!auth) return unauthorized();
  const session = await getSessionActor(env.DB, auth);
  if (!session) return unauthorized();

  const { targetId } = await request.json() as { targetId?: string };
  if (!targetId) return badRequest("targetId is required");

  const baseUrl = env.INSTANCE_URL;
  const me = await getActorById(env.DB, session.id);
  if (!me) return unauthorized();

  const follow = await getFollow(env.DB, session.id, targetId);
  if (!follow) return json({ message: "Not following" });

  const followActivity = buildFollow(baseUrl, session.id, targetId, generateId());
  const undoActivity = buildUndo(baseUrl, session.id, followActivity, generateId());

  await deleteFollow(env.DB, session.id, targetId);

  const targetActor = await getActorById(env.DB, targetId);
  if (targetActor) {
    await updateActorCounts(env.DB, session.id, { followingCount: Math.max(0, (me.followingCount ?? 0) - 1) });
    await updateActorCounts(env.DB, targetId, { followersCount: Math.max(0, (targetActor.followersCount ?? 0) - 1) });
  }

  if (targetActor && !targetActor.isLocal) {
    const inbox = targetActor.inbox || `${targetActor.id}/inbox`;
    try {
      await deliverToInbox(inbox, undoActivity, `${session.id}#main-key`, me.privateKeyPem!);
    } catch (err) {
      console.error("[unfollow] Delivery error:", err);
    }
  }

  return json({ message: "Unfollowed", following: false });
}
