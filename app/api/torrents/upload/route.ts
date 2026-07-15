import { type NextRequest } from "next/server";
import { getCloudflareContext, json, badRequest, unauthorized } from "@/lib/cf";
import { getSessionActor } from "@/lib/auth";
import { generateId, objectIRI, activityIRI, buildTorrentNote, buildCreate, followersIRI } from "@/lib/activitypub/utils";
import { createTorrent, createObject, createActivity, getActorById, updateActorCounts, getFollowerIds } from "@/lib/db";
import { enqueueDeliveries } from "@/lib/activitypub/queue";
import { collectFollowerInboxes } from "@/lib/activitypub/federation";
import { PUBLIC_ADDRESS } from "@/lib/activitypub/vocab";
import { computeTorrentInfo, buildMagnetUri, buildTorrentFile } from "@/lib/torrent/info";

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB

export async function POST(request: NextRequest) {
  const { env } = getCloudflareContext();
  const auth = request.headers.get("authorization")?.replace("Bearer ", "");
  if (!auth) return unauthorized();
  const session = await getSessionActor(env.DB, auth);
  if (!session) return unauthorized();

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const name = (formData.get("name") as string) || file?.name || "File";
    const description = (formData.get("description") as string) || null;

    if (!file) return badRequest("File is required");
    if (file.size > MAX_FILE_SIZE) return badRequest("File too large (max 100MB)");
    if (file.size === 0) return badRequest("Empty file");

    const fileData = new Uint8Array(await file.arrayBuffer());
    const filename = file.name;

    const { infoHash, pieces, pieceLength } = await computeTorrentInfo(fileData, filename);

    const baseUrl = env.INSTANCE_URL;
    const trackerHttpUrl = `${baseUrl}/api/tracker/announce`;
    const fileUrl = `${baseUrl}/api/files/${infoHash}/${encodeURIComponent(filename)}`;
    const magnetUri = buildMagnetUri(infoHash, filename, trackerHttpUrl, fileUrl);

    // Generate and store .torrent file
    const torrentFileData = buildTorrentFile(trackerHttpUrl, fileUrl, fileData, filename, pieces, pieceLength);
    const torrentFileUrl = `${baseUrl}/api/files/${infoHash}/${encodeURIComponent(filename + ".torrent")}`;

    // Store file in R2
    const r2Key = `torrents/${infoHash}/${filename}`;
    await env.FILES.put(r2Key, fileData, {
      httpMetadata: { contentType: file.type || "application/octet-stream" },
      customMetadata: { filename, infoHash },
    });
    await env.FILES.put(`torrents/${infoHash}/${filename}.torrent`, torrentFileData, {
      httpMetadata: { contentType: "application/x-bittorrent" },
      customMetadata: { filename: `${filename}.torrent`, infoHash },
    });

    // Authorize in tracker KV
    const MAX_TORRENTS = parseInt(env.MAX_TORRENTS || "100");
    const EXPIRY_MINUTES = parseInt(env.TORRENT_EXPIRY_MINUTES || "30");
    const SECRET_KEY = env.SECRET_KEY || "default-insecure-key";
    const list = await env.TORRENTS_KV.list();
    if (list.keys.length >= MAX_TORRENTS) {
      return json({ error: "Maximum torrent limit reached" }, 429);
    }
    const timestamp = Date.now();
    const data = `${infoHash}-${timestamp}`;
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(SECRET_KEY), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
    const token = Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
    await env.TORRENTS_KV.put(infoHash, JSON.stringify({ token, timestamp, infoHash }), { expirationTtl: EXPIRY_MINUTES * 60 });

    // Create D1 records
    const id = generateId();
    const noteId = objectIRI(baseUrl, id);

    const note = buildTorrentNote(baseUrl, id, {
      actorUsername: session.username,
      name,
      description: description ?? undefined,
      slug: id.slice(0, 8),
      infoHash,
      magnetUri,
      torrentFileUrl,
      size: fileData.length,
      fileCount: 1,
      published: new Date().toISOString(),
    });

    await createObject(env.DB, {
      id: noteId,
      type: "Torrent",
      actorId: session.id,
      content: note.content,
      url: fileUrl,
      raw: JSON.stringify(note),
    });

    await createTorrent(env.DB, {
      id,
      slug: id.slice(0, 8),
      actorId: session.id,
      name,
      description: description ?? undefined,
      infoHash,
      magnetUri,
      torrentFileUrl,
      size: fileData.length,
      fileCount: 1,
      magnetOnly: false,
      objectId: noteId,
    });

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
      const act = await getActorById(env.DB, session.id);
      if (act?.privateKeyPem) {
        const followerIds = await getFollowerIds(env.DB, session.id);
        if (followerIds.length > 0) {
          const fetchActorFn = async (id: string) => getActorById(env.DB, id);
          const inboxes = await collectFollowerInboxes(followerIds, fetchActorFn);
          if (inboxes.length > 0) {
            await enqueueDeliveries(env.DELIVERY_QUEUE, inboxes, JSON.stringify(apCreateActivity), session.id);
          }
        }
      }
    } catch { /* federation is best-effort */ }

    return json({
      id,
      slug: id.slice(0, 8),
      name,
      infoHash,
      magnetUri,
      fileUrl,
      torrentFileUrl,
      size: fileData.length,
      fileCount: 1,
      magnetOnly: false,
      shortUrl: `${baseUrl}/torrents/${id.slice(0, 8)}`,
      published: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[upload] Error:", err);
    return json({ error: "Upload failed" }, 500);
  }
}
