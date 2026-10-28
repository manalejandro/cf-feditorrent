import { type NextRequest } from "next/server";
import { json, badRequest, unauthorized } from "@/lib/cf";
import { getSessionActor } from "@/lib/auth";
import { generateId, objectIRI, activityIRI, buildTorrentNote, buildCreate, followersIRI } from "@/lib/activitypub/utils";
import {
  createTorrent,
  createObject,
  createActivity,
  getActorById,
  bumpActorCount,
  getFollowerIds,
  countTorrentsByActor,
} from "@/lib/db";
import { enqueueDeliveries } from "@/lib/activitypub/queue";
import { collectFollowerInboxes } from "@/lib/activitypub/federation";
import { PUBLIC_ADDRESS } from "@/lib/activitypub/vocab";
import { computeTorrentInfo, buildMagnetUri, buildTorrentFile } from "@/lib/torrent/info";
import { createTrackerToken, MissingSecretError } from "@/lib/torrent/tracker-token";
import { env } from "cloudflare:workers";

/**
 * 25 MB: the route holds the file in memory (formData buffer + typed array
 * copy + per-piece slices), and Worker isolates cap at ~128 MB — the previous
 * 100 MB limit OOM'd well before the advertised maximum.
 */
const MAX_FILE_SIZE = 25 * 1024 * 1024;

/** Neutralize path separators, control chars and dot-prefixes in R2 keys. */
function sanitizeFilename(name: string): string {
  const base =
    name
      .replace(/[\u0000-\u001f\u007f]/g, "")
      .split(/[\\/]/)
      .pop() || "file";
  const trimmed = base.replace(/^\.+/, "_").slice(0, 180);
  return trimmed || "file";
}

export async function POST(request: NextRequest) {
  const auth = request.headers.get("authorization")?.replace("Bearer ", "");
  if (!auth) return unauthorized();
  const session = await getSessionActor(env.DB, auth);
  if (!session) return unauthorized();

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const name = ((formData.get("name") as string) || file?.name || "File").slice(0, 300);
    const description = (formData.get("description") as string) || null;

    if (!file) return badRequest("File is required");
    if (file.size > MAX_FILE_SIZE) return badRequest("File too large (max 25MB)");
    if (file.size === 0) return badRequest("Empty file");

    const MAX_TORRENTS = Math.max(1, parseInt(env.MAX_TORRENTS || "100", 10) || 100);
    const currentCount = await countTorrentsByActor(env.DB, session.id);
    if (currentCount >= MAX_TORRENTS) {
      return json({ error: "Maximum torrent limit reached" }, 429);
    }

    const fileData = new Uint8Array(await file.arrayBuffer());
    const filename = sanitizeFilename(file.name);

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

    // Authorize in tracker KV (best-effort: announces are also gated by the
    // D1 torrents row, so a missing SECRET_KEY does not break downloads).
    try {
      await createTrackerToken(env.TORRENTS_KV, env, infoHash);
    } catch (err) {
      if (err instanceof MissingSecretError) {
        console.error("[upload] SECRET_KEY is not configured — tracker tokens disabled");
      } else {
        console.error("[upload] Tracker token error:", err);
      }
    }

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

    try {
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
    } catch (err) {
      console.error("[upload] createTorrent conflict:", err);
      return json({ error: "A torrent with this info hash or slug already exists" }, 409);
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

    await bumpActorCount(env.DB, session.id, "torrents_count", 1);

    try {
      const act = await getActorById(env.DB, session.id);
      if (act?.privateKeyPem) {
        const followerIds = await getFollowerIds(env.DB, session.id);
        if (followerIds.length > 0) {
          const fetchActorFn = async (actorId: string) => getActorById(env.DB, actorId);
          const inboxes = await collectFollowerInboxes(followerIds, fetchActorFn);
          if (inboxes.length > 0) {
            await enqueueDeliveries(
              env.DELIVERY_QUEUE,
              inboxes,
              JSON.stringify(apCreateActivity),
              session.id,
              `${act.id}#main-key`,
              act.privateKeyPem
            );
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
