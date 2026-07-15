import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext, activityJson, notFound } from "@/lib/cf";
import { getObjectById, getTorrentById } from "@/lib/db";
import { buildTorrentNote, actorIRI } from "@/lib/activitypub/utils";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { env } = getCloudflareContext();
  const { id } = await params;

  const obj = await getObjectById(env.DB, id);
  if (!obj) return notFound("Object not found");

  const accept = request.headers.get("accept") ?? "";
  if (!accept.includes("application/activity+json") && !accept.includes("application/ld+json")) {
    const url = obj.url;
    if (url) return NextResponse.redirect(url);
    return notFound();
  }

  const torrent = await getTorrentById(env.DB, obj.url?.split("/").pop() ?? "");

  if (torrent && obj.raw && obj.raw !== "{}") {
    try {
      const parsed = JSON.parse(obj.raw);
      return activityJson(parsed);
    } catch {}
  }

  const actorUsername = obj.actorId.split("/").pop() || "unknown";
  const slug = torrent?.slug || id;

  const note = buildTorrentNote(env.INSTANCE_URL, id, {
    actorUsername,
    name: torrent?.name || "Torrent",
    description: torrent?.description ?? undefined,
    slug,
    infoHash: torrent?.infoHash || "",
    magnetUri: torrent?.magnetUri || "",
    torrentFileUrl: torrent?.torrentFileUrl ?? undefined,
    size: torrent?.size || 0,
    fileCount: torrent?.fileCount || 0,
    published: obj.published,
  });

  return activityJson(note);
}
