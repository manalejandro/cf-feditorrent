import { NextRequest } from "next/server";
import { getCloudflareContext, json, unauthorized, notFound } from "@/lib/cf";
import { getSessionActor } from "@/lib/auth";
import { generateId, buildDelete, activityIRI } from "@/lib/activitypub/utils";
import { getTorrentById, deleteTorrent, getObjectById, deleteObject, createActivity, getFollowerIds, getActorById, updateActorCounts } from "@/lib/db";
import { enqueueDeliveries } from "@/lib/activitypub/queue";
import { collectFollowerInboxes } from "@/lib/activitypub/federation";
import { PUBLIC_ADDRESS } from "@/lib/activitypub/vocab";
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { env } = getCloudflareContext();
  const auth = request.headers.get("authorization")?.replace("Bearer ", "");
  if (!auth) return unauthorized();
  const session = await getSessionActor(env.DB, auth);
  if (!session) return unauthorized();

  const { id } = await params;
  const torrent = await getTorrentById(env.DB, id);
  if (!torrent) return notFound("Torrent not found");
  if (torrent.actorId !== session.id) return unauthorized();

  const baseUrl = env.INSTANCE_URL;

  if (torrent.objectId) {
    const deleteId = generateId();
    const deleteActivity = buildDelete(baseUrl, session.id, torrent.objectId, deleteId);

    await createActivity(env.DB, {
      id: activityIRI(baseUrl, deleteId),
      type: "Delete",
      actorId: session.id,
      objectId: torrent.objectId,
      toList: JSON.stringify([PUBLIC_ADDRESS]),
      ccList: "[]",
      raw: JSON.stringify(deleteActivity),
      isLocal: true,
    });

    try {
      const actor = await getActorById(env.DB, session.id);
      if (actor?.privateKeyPem) {
        const followerIds = await getFollowerIds(env.DB, session.id);
        if (followerIds.length > 0) {
          const fetchActorFn = async (id: string) => getActorById(env.DB, id);
          const inboxes = await collectFollowerInboxes(followerIds, fetchActorFn);
          if (inboxes.length > 0) {
            await enqueueDeliveries(env.DELIVERY_QUEUE, inboxes, JSON.stringify(deleteActivity), session.id);
          }
        }
      }
    } catch (err) {
      console.error("[torrents] Federation error:", err);
    }

    await deleteObject(env.DB, torrent.objectId);
  }

  await deleteTorrent(env.DB, id);

  const actor = await getActorById(env.DB, session.id);
  if (actor) {
    await updateActorCounts(env.DB, session.id, { torrentsCount: Math.max(0, (actor.torrentsCount ?? 0) - 1) });
  }

  return json({ deleted: true });
}
