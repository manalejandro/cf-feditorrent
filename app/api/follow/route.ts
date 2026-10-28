import { NextRequest } from "next/server";
import { json, badRequest, unauthorized } from "@/lib/cf";
import { getSessionActor } from "@/lib/auth";
import { generateId, buildFollow, activityIRI } from "@/lib/activitypub/utils";
import {
  getActorById,
  getFollow,
  createFollow,
  deleteFollow,
  createActivity,
  createNotification,
  bumpActorCount,
} from "@/lib/db";
import { deliverToInbox, fetchRemoteObject } from "@/lib/activitypub/federation";
import { cacheRemoteActor, isLocalActorId } from "@/lib/activitypub/signer-key";
import { env } from "cloudflare:workers";
import type { APActor } from "@/lib/types";

export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization")?.replace("Bearer ", "");
  if (!auth) return unauthorized();
  const session = await getSessionActor(env.DB, auth);
  if (!session) return unauthorized();

  const targetId = request.nextUrl.searchParams.get("targetId");
  if (!targetId) return json({ following: false });

  const follow = await getFollow(env.DB, session.id, targetId);
  return json({ following: follow?.state === "accepted" });
}

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
  if (!targetId || typeof targetId !== "string") return badRequest("targetId is required");

  let parsedTarget: URL;
  try {
    parsedTarget = new URL(targetId);
  } catch {
    return badRequest("targetId must be a valid URL");
  }
  if (parsedTarget.protocol !== "https:") return badRequest("targetId must be an https URL");
  if (targetId === session.id) return badRequest("Cannot follow yourself");

  const baseUrl = env.INSTANCE_URL;
  const me = await getActorById(env.DB, session.id);
  if (!me?.privateKeyPem) return unauthorized();

  let targetActor = await getActorById(env.DB, targetId);

  if (!targetActor) {
    // Never fetch (or cache) documents for our own domain: the actor simply
    // does not exist locally.
    if (isLocalActorId(targetId)) return badRequest("Target actor not found");

    const fetched = (await fetchRemoteObject(targetId)) as APActor | null;
    if (!fetched?.publicKey?.publicKeyPem) return badRequest("Could not resolve remote actor");
    // The served document must be the actor we asked for, and must not claim
    // a local id (cacheRemoteActor rejects local ids as a second line).
    if (fetched.id !== targetId) return badRequest("Remote actor id does not match");
    await cacheRemoteActor(env.DB, fetched);
    targetActor = await getActorById(env.DB, targetId);
  }

  if (!targetActor) return badRequest("Target actor not found");

  const existing = await getFollow(env.DB, session.id, targetId);
  if (existing) {
    if (existing.state === "accepted") return json({ message: "Already following", following: true });
    if (existing.state === "pending") return json({ message: "Follow request still pending", following: false });
    // "rejected" (or any other state): allow a fresh attempt by replacing the row.
    await deleteFollow(env.DB, session.id, targetId);
  }

  const followId = generateId();
  const followActivity = buildFollow(baseUrl, session.id, targetId, followId);
  const isLocalTarget = Boolean(targetActor.isLocal);

  await createFollow(env.DB, {
    id: followId,
    actorId: session.id,
    targetId,
    state: isLocalTarget ? "accepted" : "pending",
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

  if (isLocalTarget) {
    // Local follow: accepted immediately — count it and notify the target.
    // No HTTP delivery (a self-fetch would time out and the inbox dedup would
    // drop it anyway). Remote follows stay "pending" and are counted by
    // handleAccept when the remote Accept arrives.
    await bumpActorCount(env.DB, session.id, "following_count", 1);
    await bumpActorCount(env.DB, targetId, "followers_count", 1);
    await createNotification(env.DB, {
      id: generateId(),
      type: "follow",
      accountId: session.id,
      targetAccountId: targetId,
    });
    return json({ message: "Followed", following: true });
  }

  const inbox = targetActor.inbox || `${targetActor.id}/inbox`;
  try {
    await deliverToInbox(inbox, followActivity, `${session.id}#main-key`, me.privateKeyPem);
  } catch (err) {
    console.error("[follow] Delivery error:", err);
    // Keep the pending row: the remote may still have received it, and Undo
    // works either way.
  }

  return json({ message: "Follow sent", following: false });
}
