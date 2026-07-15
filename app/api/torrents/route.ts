import { NextRequest } from "next/server";
import { getCloudflareContext, json, badRequest, unauthorized } from "@/lib/cf";
import { getSessionActor } from "@/lib/auth";
import { generateId, objectIRI, activityIRI, buildTorrentNote, buildCreate, actorIRI, followersIRI } from "@/lib/activitypub/utils";
import { getTorrentsByActor, getTorrentBySlug, createTorrent, createObject, createActivity, getFollowerIds, getActorById, updateActorCounts } from "@/lib/db";
import { enqueueDeliveries } from "@/lib/activitypub/queue";
import { collectFollowerInboxes } from "@/lib/activitypub/federation";
import { PUBLIC_ADDRESS } from "@/lib/activitypub/vocab";

export async function GET(request: NextRequest) {
  const { env } = getCloudflareContext();
  const auth = request.headers.get("authorization")?.replace("Bearer ", "");
  if (!auth) return unauthorized();
  const session = await getSessionActor(env.DB, auth);
  if (!session) return unauthorized();

  const torrents = await getTorrentsByActor(env.DB, session.id);
  const baseUrl = env.INSTANCE_URL;
  return json(torrents.map((t) => ({
    ...t,
    shortUrl: `${baseUrl}/torrents/${t.slug}`,
  })));
}

export async function POST(request: NextRequest) {
  const { env } = getCloudflareContext();
  const auth = request.headers.get("authorization")?.replace("Bearer ", "");
  if (!auth) return unauthorized();
  const session = await getSessionActor(env.DB, auth);
  if (!session) return unauthorized();

  try {
    const { name, description, infoHash, magnetUri, torrentFileUrl, size, fileCount, fileType, magnetOnly, slug: customSlug } = await request.json() as { name?: string; description?: string; infoHash?: string; magnetUri?: string; torrentFileUrl?: string; size?: number; fileCount?: number; fileType?: string; magnetOnly?: boolean; slug?: string };

    if (!name || !magnetUri) return badRequest("Name and magnet URI are required");

    const baseUrl = env.INSTANCE_URL;
    const slug = customSlug || generateId().slice(0, 8);
    const mName = name || "Torrent";
    const mMagnetUri = magnetUri || "";
    const mInfoHash = infoHash || "";
    const mDesc = description || null;
    const mTorrentFileUrl = torrentFileUrl || null;
    const mFileType = fileType || null;
    const mSize = size || 0;
    const mFileCount = fileCount || 0;
    const mMagnetOnly = magnetOnly || !infoHash;

    const existing = await getTorrentBySlug(env.DB, slug);
    if (existing) return badRequest("Slug already taken");

    const id = generateId();
    const noteId = objectIRI(baseUrl, id);

    const note = buildTorrentNote(baseUrl, id, {
      actorUsername: session.username,
      name: mName,
      description: mDesc ?? void 0,
      slug,
      infoHash: mInfoHash,
      magnetUri: mMagnetUri,
      torrentFileUrl: mTorrentFileUrl ?? undefined,
      size: mSize,
      fileCount: mFileCount,
      published: new Date().toISOString(),
    });

    await createObject(env.DB, {
      id: noteId,
      type: "Torrent",
      actorId: session.id,
      content: note.content,
      url: `${baseUrl}/torrents/${slug}`,
      raw: JSON.stringify(note),
    });

    await createTorrent(env.DB, {
      id,
      slug,
      actorId: session.id,
      name: mName,
      description: mDesc == null ? undefined : mDesc,
      infoHash: mInfoHash,
      magnetUri: mMagnetUri,
      torrentFileUrl: mTorrentFileUrl == null ? undefined : mTorrentFileUrl,
      size: mSize,
      fileCount: mFileCount,
      fileType: mFileType ?? undefined,
      magnetOnly: mMagnetOnly,
      objectId: noteId,
    });

    // Authorize in tracker KV if info hash is provided
    if (mInfoHash) {
      const MAX_TORRENTS = parseInt(env.MAX_TORRENTS || "100");
      const EXPIRY_MINUTES = parseInt(env.TORRENT_EXPIRY_MINUTES || "30");
      const SECRET_KEY = env.SECRET_KEY || "default-insecure-key";
      const list = await env.TORRENTS_KV.list();
      if (list.keys.length < MAX_TORRENTS) {
        const timestamp = Date.now();
        const data = `${mInfoHash}-${timestamp}`;
        const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(SECRET_KEY), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
        const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
        const token = Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
        await env.TORRENTS_KV.put(mInfoHash, JSON.stringify({ token, timestamp, infoHash: mInfoHash }), { expirationTtl: EXPIRY_MINUTES * 60 });
      }
    }

    const createId = generateId();
    const apCreateActivity = buildCreate(baseUrl, session.id, note, createId);

    await createActivity(env.DB, {
      id: activityIRI(baseUrl, createId),
      type: "Create",
      actorId: session.id,
      objectId: noteId,
      toList: JSON.stringify([PUBLIC_ADDRESS]),
      ccList: JSON.stringify([followersIRI(baseUrl, session.username)]),
      raw: JSON.stringify(apCreateActivity),
      isLocal: true,
    });

    const actor = await getActorById(env.DB, session.id);
    if (actor) {
      await updateActorCounts(env.DB, session.id, { torrentsCount: (actor.torrentsCount ?? 0) + 1 });
    }

    try {
      const actor = await getActorById(env.DB, session.id);
      if (actor?.privateKeyPem) {
        const followerIds = await getFollowerIds(env.DB, session.id);
        if (followerIds.length > 0) {
          const fetchActorFn = async (id: string) => getActorById(env.DB, id);
          const inboxes = await collectFollowerInboxes(followerIds, fetchActorFn);
          if (inboxes.length > 0) {
            await enqueueDeliveries(env.DELIVERY_QUEUE, inboxes, JSON.stringify(apCreateActivity), session.id);
          }
        }
      }
    } catch (err) {
      console.error("[torrents] Federation error:", err);
    }

    return json({
      id,
      slug,
      name: mName,
      infoHash: mInfoHash,
      magnetUri: mMagnetUri,
      torrentFileUrl: mTorrentFileUrl,
      size: mSize,
      fileCount: mFileCount,
      fileType: mFileType,
      magnetOnly: mMagnetOnly,
      shortUrl: `${baseUrl}/torrents/${slug}`,
      published: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[torrents] Create error:", err);
    return json({ error: "Failed to create torrent" }, 500);
  }
}
