import { NextRequest } from "next/server";
import { json, badRequest, unauthorized } from "@/lib/cf";
import { getSessionActor } from "@/lib/auth";
import { getTorrentByInfoHash } from "@/lib/db";
import { createTrackerToken, MissingSecretError } from "@/lib/torrent/tracker-token";
import { env } from "cloudflare:workers";

/**
 * Issue a tracker token for a torrent the caller owns (browser seeding).
 * Previously unauthenticated: anyone could write arbitrary KV keys and exhaust
 * the instance-wide quota.
 */
export async function POST(request: NextRequest) {
  const auth = request.headers.get("authorization")?.replace("Bearer ", "");
  if (!auth) return unauthorized();
  const session = await getSessionActor(env.DB, auth);
  if (!session) return unauthorized();

  const body = (await request.json().catch(() => ({}))) as { infoHash?: string };
  const { infoHash } = body;

  if (!infoHash || typeof infoHash !== "string" || !/^[0-9a-f]{40}$/i.test(infoHash)) {
    return badRequest("infoHash requerido (40 hex chars)");
  }
  const normalizedHash = infoHash.toLowerCase();

  const torrent = await getTorrentByInfoHash(env.DB, normalizedHash);
  if (!torrent || torrent.actorId !== session.id) {
    return json({ error: "Forbidden" }, 403);
  }

  if (!env.SECRET_KEY) {
    console.error("[tracker/authenticate] SECRET_KEY is not configured");
    return json({ error: "Tracker authentication is temporarily unavailable" }, 503);
  }

  try {
    const { token, expiresAt, expiryMinutes } = await createTrackerToken(
      env.TORRENTS_KV,
      env,
      normalizedHash
    );
    return json({ token, expires: expiresAt, expiryMinutes });
  } catch (err) {
    if (err instanceof MissingSecretError) {
      return json({ error: "Tracker authentication is temporarily unavailable" }, 503);
    }
    console.error("[tracker/authenticate] Error:", err);
    return json({ error: "Failed to authenticate torrent" }, 500);
  }
}
