import { NextRequest } from "next/server";
import { json, badRequest, unauthorized } from "@/lib/cf";
import { getSessionActor } from "@/lib/auth";
import { generateId, objectIRI, activityIRI, buildTorrentNote, buildCreate, followersIRI } from "@/lib/activitypub/utils";
import {
  getTorrentsByActor,
  getTorrentBySlug,
  createTorrent,
  createObject,
  createActivity,
  getFollowerIds,
  getActorById,
  bumpActorCount,
  countTorrentsByActor,
} from "@/lib/db";
import { enqueueDeliveries } from "@/lib/activitypub/queue";
import { collectFollowerInboxes } from "@/lib/activitypub/federation";
import { PUBLIC_ADDRESS } from "@/lib/activitypub/vocab";
import { createTrackerToken, isValidMagnetUri, SLUG_REGEX, MissingSecretError } from "@/lib/torrent/tracker-token";
import { env } from "cloudflare:workers";

export async function GET(request: NextRequest) {
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
  const auth = request.headers.get("authorization")?.replace("Bearer ", "");
  if (!auth) return unauthorized();
  const session = await getSessionActor(env.DB, auth);
  if (!session) return unauthorized();

  try {
    const { name, description, infoHash, magnetUri, torrentFileUrl, size, fileCount, fileType, magnetOnly, slug: customSlug } = (await request.json().catch(() => ({}))) as { name?: string; description?: string; infoHash?: string; magnetUri?: string; torrentFileUrl?: string; size?: number; fileCount?: number; fileType?: string; magnetOnly?: boolean; slug?: string };

    if (!name || !magnetUri) return badRequest("Name and magnet URI are required");
    if (typeof name !== "string" || name.length > 300) return badRequest("Invalid name");
    // A magnet URI is embedded in hrefs and in the /l redirect: refuse any
    // other scheme (javascript:, data:, arbitrary http redirects...).
    if (!isValidMagnetUri(magnetUri)) return badRequest("magnetUri must be a valid magnet: URI with a btih info hash");
    if (description !== undefined && description !== null && (typeof description !== "string" || description.length > 5000)) {
      return badRequest("Invalid description");
    }
    if (infoHash !== undefined && infoHash !== "" && !/^[0-9a-fA-F]{40}$/.test(infoHash)) {
      return badRequest("infoHash must be 40 hex characters");
    }
    if (torrentFileUrl) {
      // Rendered as an href on the SSR torrent page: http(s) only.
      try {
        const parsed = new URL(torrentFileUrl);
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
          return badRequest("torrentFileUrl must be an http(s) URL");
        }
      } catch {
        return badRequest("torrentFileUrl must be a valid URL");
      }
    }
    if (customSlug !== undefined && !SLUG_REGEX.test(customSlug)) {
      return badRequest("Slug must be 1-64 characters (letters, numbers, dash, underscore)");
    }

    const baseUrl = env.INSTANCE_URL;
    const slug = customSlug || generateId().slice(0, 8);
    const mName = name;
    const mMagnetUri = magnetUri;
    const mInfoHash = (infoHash || "").toLowerCase();
    const mDesc = description || null;
    const mTorrentFileUrl = torrentFileUrl || null;
    const mFileType = fileType || null;
    const mSize = Number.isFinite(size) ? Math.max(0, Number(size)) : 0;
    const mFileCount = Number.isFinite(fileCount) ? Math.max(0, Number(fileCount)) : 0;
    const mMagnetOnly = magnetOnly || !mInfoHash;

    const existing = await getTorrentBySlug(env.DB, slug);
    if (existing) return json({ error: "Slug already taken" }, 409);

    // Per-actor quota (the old global KV count let anyone block the instance).
    const MAX_TORRENTS = Math.max(1, parseInt(env.MAX_TORRENTS || "100", 10) || 100);
    const currentCount = await countTorrentsByActor(env.DB, session.id);
    if (currentCount >= MAX_TORRENTS) {
      return json({ error: "Maximum torrent limit reached" }, 429);
    }

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

    try {
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
    } catch {
      // Race on the UNIQUE slug/info_hash indexes.
      return json({ error: "Slug already taken" }, 409);
    }

    // Authorize in tracker KV if info hash is provided
    if (mInfoHash) {
      try {
        await createTrackerToken(env.TORRENTS_KV, env, mInfoHash);
      } catch (err) {
        if (err instanceof MissingSecretError) {
          console.error("[torrents] SECRET_KEY is not configured — tracker tokens disabled");
        } else {
          console.error("[torrents] Tracker token error:", err);
        }
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

    await bumpActorCount(env.DB, session.id, "torrents_count", 1);

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
              JSON.stringify(apCreateActivity),
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
