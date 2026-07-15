import { NextRequest } from "next/server";
import { getCloudflareContext, json, activityJson, notFound } from "@/lib/cf";
import { getActorByUsername, getTorrentsByActor, getObjectById } from "@/lib/db";
import { buildOrderedCollection, buildOrderedCollectionPage, actorIRI, objectIRI, buildTorrentNote, buildCreate } from "@/lib/activitypub/utils";
import { PUBLIC_ADDRESS, DEFAULT_CONTEXT } from "@/lib/activitypub/vocab";
import type { APActivity, APTorrent } from "@/lib/types";

export async function GET(request: NextRequest, { params }: { params: Promise<{ username: string }> }) {
  const { env } = getCloudflareContext();
  const { username } = await params;
  const domain = new URL(env.INSTANCE_URL).hostname;

  const actor = await getActorByUsername(env.DB, username, domain);
  if (!actor || !actor.isLocal) return notFound();

  const baseUrl = env.INSTANCE_URL;
  const outboxId = `${actorIRI(baseUrl, username)}/outbox`;
  const page = request.nextUrl.searchParams.get("page");

  const torrents = await getTorrentsByActor(env.DB, actor.id);

  if (page) {
    const items = await Promise.all(
      torrents.slice(0, 20).map(async (t) => {
        if (t.objectId) {
          const obj = await getObjectById(env.DB, t.objectId);
          if (obj) {
            try {
              return JSON.parse(obj.raw) as APActivity;
            } catch {}
          }
        }
        const note = buildTorrentNote(baseUrl, t.id, {
          actorUsername: username,
          name: t.name,
          description: t.description ?? undefined,
          slug: t.slug,
          infoHash: t.infoHash,
          magnetUri: t.magnetUri,
          torrentFileUrl: t.torrentFileUrl ?? undefined,
          size: t.size,
          fileCount: t.fileCount,
          published: t.published,
        });
        return buildCreate(baseUrl, actor.id, note, t.id);
      })
    );

    const pageResponse = buildOrderedCollectionPage(outboxId, items);
    return activityJson(pageResponse);
  }

  const collection = buildOrderedCollection(outboxId, torrents.length);
  return activityJson(collection);
}
