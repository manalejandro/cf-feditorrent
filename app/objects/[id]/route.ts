import { NextRequest, NextResponse } from "next/server";
import { activityJson, notFound } from "@/lib/cf";
import { getObjectById, getTorrentByObjectId } from "@/lib/db";
import { buildTorrentNote, objectIRI } from "@/lib/activitypub/utils";
import { env } from "cloudflare:workers";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[a-zA-Z0-9-]{1,64}$/.test(id)) return notFound("Object not found");

  // Objects are stored under their full IRI (`${INSTANCE_URL}/objects/<uuid>`),
  // but this route receives only the <uuid> segment — reconstruct before lookup
  // (the old code searched by bare uuid and ALWAYS 404'd).
  const obj = await getObjectById(env.DB, objectIRI(env.INSTANCE_URL, id));
  if (!obj) return notFound("Object not found");

  const torrent = await getTorrentByObjectId(env.DB, obj.id);

  const accept = request.headers.get("accept") ?? "";
  if (!accept.includes("application/activity+json") && !accept.includes("application/ld+json")) {
    // Humans land on the torrent page; fall back to the object url.
    if (torrent) return NextResponse.redirect(`${env.INSTANCE_URL}/torrents/${torrent.slug}`);
    if (obj.url) return NextResponse.redirect(obj.url);
    return notFound();
  }

  if (obj.raw && obj.raw !== "{}") {
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
