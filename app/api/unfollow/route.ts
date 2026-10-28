import { NextRequest } from "next/server";
import { json, badRequest, unauthorized } from "@/lib/cf";
import { getSessionActor } from "@/lib/auth";
import { generateId, buildFollow, buildUndo } from "@/lib/activitypub/utils";
import { getActorById, getFollow, deleteFollow, bumpActorCount } from "@/lib/db";
import { deliverToInbox } from "@/lib/activitypub/federation";
import { env } from "cloudflare:workers";

export async function POST(request: NextRequest) {
  const auth = request.headers.get("authorization")?.replace("Bearer ", "");
  if (!auth) return unauthorized();
  const session = await getSessionActor(env.DB, auth);
  if (!session) return unauthorized();

  let targetId: string | undefined;
  try {
    ({ targetId } = (await request.json()) as { targetId?: string });
  } catch {
    return badRequest("Invalid JSON body");
  }
  if (!targetId) return badRequest("targetId is required");

  const baseUrl = env.INSTANCE_URL;
  const me = await getActorById(env.DB, session.id);
  if (!me) return unauthorized();

  const follow = await getFollow(env.DB, session.id, targetId);
  if (!follow) return json({ message: "Not following", following: false });

  const wasAccepted = follow.state === "accepted";

  // The Undo must embed the ORIGINAL Follow activity (same id), otherwise
  // strict implementations discard it. follows.activity_id stores the full
  // IRI `${baseUrl}/activities/<uuid>` — rebuild with the same uuid.
  const originalUuid = follow.activityId
    ? follow.activityId.split("/").pop() || generateId()
    : generateId();
  const followActivity = buildFollow(baseUrl, session.id, targetId, originalUuid);
  const undoActivity = buildUndo(baseUrl, session.id, followActivity, generateId());

  await deleteFollow(env.DB, session.id, targetId);

  if (wasAccepted) {
    await bumpActorCount(env.DB, session.id, "following_count", -1);
    await bumpActorCount(env.DB, targetId, "followers_count", -1);
  }

  const targetActor = await getActorById(env.DB, targetId);
  if (targetActor && !targetActor.isLocal && me.privateKeyPem) {
    const inbox = targetActor.inbox || `${targetActor.id}/inbox`;
    try {
      await deliverToInbox(inbox, undoActivity, `${session.id}#main-key`, me.privateKeyPem);
    } catch (err) {
      console.error("[unfollow] Delivery error:", err);
    }
  }

  return json({ message: "Unfollowed", following: false });
}
