import { NextRequest } from "next/server";
import { getCloudflareContext, json, badRequest, unauthorized } from "@/lib/cf";
import { getSessionActor } from "@/lib/auth";
import { generateId, buildFollow, activityIRI } from "@/lib/activitypub/utils";
import { getActorById, getFollow, createFollow, createActivity, getFollowerIds, updateActorCounts } from "@/lib/db";
import { deliverToInbox } from "@/lib/activitypub/federation";
import { fetchRemoteObject } from "@/lib/activitypub/federation";

export async function POST(request: NextRequest) {
  const { env } = getCloudflareContext();
  const auth = request.headers.get("authorization")?.replace("Bearer ", "");
  if (!auth) return unauthorized();
  const session = await getSessionActor(env.DB, auth);
  if (!session) return unauthorized();

  const { targetId } = await request.json() as { targetId?: string };
  if (!targetId) return badRequest("targetId is required");

  if (targetId === session.id) return badRequest("Cannot follow yourself");

  const baseUrl = env.INSTANCE_URL;
  const me = await getActorById(env.DB, session.id);
  if (!me) return unauthorized();

  let targetActor = await getActorById(env.DB, targetId);

  if (!targetActor) {
    const fetched = await fetchRemoteObject(targetId) as any;
    if (!fetched?.publicKey?.publicKeyPem) return badRequest("Could not resolve remote actor");
    const domain = new URL(fetched.id).hostname;
    await env.DB
      .prepare("INSERT OR REPLACE INTO actors (id, username, domain, display_name, summary, avatar_url, header_url, public_key_pem, inbox, is_local, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, datetime('now'))")
      .bind(fetched.id, fetched.preferredUsername, domain, fetched.name ?? null, fetched.summary ?? null, fetched.icon?.url ?? null, fetched.image?.url ?? null, fetched.publicKey.publicKeyPem, fetched.inbox ?? null)
      .run();
    targetActor = await getActorById(env.DB, targetId);
  }

  if (!targetActor) return badRequest("Target actor not found");

  const existing = await getFollow(env.DB, session.id, targetId);
  if (existing) return json({ message: "Already following" });

  const followId = generateId();
  const followActivity = buildFollow(baseUrl, session.id, targetId, followId);

  await createFollow(env.DB, {
    id: followId,
    actorId: session.id,
    targetId,
    state: targetActor.isLocal ? "accepted" : "pending",
    activityId: activityIRI(baseUrl, followId),
  });

  await createActivity(env.DB, {
    id: activityIRI(baseUrl, followId),
    type: "Follow",
    actorId: session.id,
    objectId: targetId,
    toList: JSON.stringify([targetId]),
    ccList: "[]",
    raw: JSON.stringify(followActivity),
    isLocal: true,
  });

  if (targetActor.isLocal) {
    await updateActorCounts(env.DB, session.id, { followingCount: (me.followingCount ?? 0) + 1 });
    await updateActorCounts(env.DB, targetId, { followersCount: (targetActor.followersCount ?? 0) + 1 });
  }

  const inbox = targetActor.inbox || `${targetActor.id}/inbox`;
  try {
    await deliverToInbox(inbox, followActivity, `${session.id}#main-key`, me.privateKeyPem!);
  } catch (err) {
    console.error("[follow] Delivery error:", err);
  }

  return json({ message: "Follow sent", following: true });
}
