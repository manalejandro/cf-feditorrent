import { NextRequest } from "next/server";
import { json, unauthorized, notFound } from "@/lib/cf";
import { getSessionActor } from "@/lib/auth";
import { generateId, buildDelete, activityIRI } from "@/lib/activitypub/utils";
import { getTorrentById, deleteTorrent, deleteObject, createActivity, getFollowerIds, getActorById, bumpActorCount } from "@/lib/db";
import { enqueueDeliveries } from "@/lib/activitypub/queue";
import { collectFollowerInboxes } from "@/lib/activitypub/federation";
import { PUBLIC_ADDRESS } from "@/lib/activitypub/vocab";
import { env } from "cloudflare:workers";

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = request.headers.get("authorization")?.replace("Bearer ", "");
  if (!auth) return unauthorized();
  const session = await getSessionActor(env.DB, auth);
  if (!session) return unauthorized();

  const { id } = await params;
  const torrent = await getTorrentById(env.DB, id);
  if (!torrent) return notFound("Torrent not found");
  if (torrent.actorId !== session.id) {
    // 403 (not 401): the caller IS authenticated, just not the owner.
    return json({ error: "Forbidden" }, 403);
  }

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
          const fetchActorFn = async (actorId: string) => getActorById(env.DB, actorId);
          const inboxes = await collectFollowerInboxes(followerIds, fetchActorFn);
          if (inboxes.length > 0) {
            await enqueueDeliveries(
              env.DELIVERY_QUEUE,
              inboxes,
              JSON.stringify(deleteActivity),
              session.id,
              `${actor.id}#main-key`,
              actor.privateKeyPem
            );
          }
        }
      }
    } catch (err) {
      console.error("[torrents] Federation error:", err);
    }

    await deleteObject(env.DB, torrent.objectId);
  }

  await deleteTorrent(env.DB, id);

  // Clean up stored artifacts: R2 files and the tracker KV token. Without this
  // the "deleted" file stayed publicly downloadable and R2 accumulated garbage.
  if (torrent.infoHash && /^[0-9a-f]{40}$/i.test(torrent.infoHash)) {
    try {
      const prefix = `torrents/${torrent.infoHash}/`;
      let cursor: string | undefined;
      do {
        const listed = await env.FILES.list({ prefix, cursor, limit: 1000 });
        const keys = listed.objects.map((o) => o.key);
        if (keys.length > 0) await env.FILES.delete(keys);
        cursor = listed.truncated ? listed.cursor : undefined;
      } while (cursor);
    } catch (err) {
      console.error("[torrents] R2 cleanup error:", err);
    }
    try {
      await env.TORRENTS_KV.delete(torrent.infoHash);
    } catch (err) {
      console.error("[torrents] KV cleanup error:", err);
    }
  }

  await bumpActorCount(env.DB, session.id, "torrents_count", -1);

  return json({ deleted: true });
}
