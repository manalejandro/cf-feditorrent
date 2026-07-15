import { NextRequest } from "next/server";
import { getCloudflareContext, json, badRequest } from "@/lib/cf";

export async function POST(request: NextRequest) {
  const { env } = getCloudflareContext();
  const body = await request.json().catch(() => ({})) as { infoHash?: string };
  const { infoHash } = body;

  if (!infoHash || typeof infoHash !== "string" || !/^[0-9a-f]{40}$/i.test(infoHash)) {
    return badRequest("infoHash requerido (40 hex chars)");
  }

  const MAX_TORRENTS = parseInt(env.MAX_TORRENTS || "100");
  const EXPIRY_MINUTES = parseInt(env.TORRENT_EXPIRY_MINUTES || "30");
  const SECRET_KEY = env.SECRET_KEY || "default-insecure-key";

  const list = await env.TORRENTS_KV.list();
  const currentCount = list.keys.length;

  if (currentCount >= MAX_TORRENTS) {
    return json({ error: "Maximum torrent limit reached", maxTorrents: MAX_TORRENTS, currentTorrents: currentCount }, 429);
  }

  const timestamp = Date.now();
  const data = `${infoHash}-${timestamp}`;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(SECRET_KEY), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  const token = Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
  const expiryMs = EXPIRY_MINUTES * 60 * 1000;
  const expiresAt = timestamp + expiryMs;

  await env.TORRENTS_KV.put(infoHash, JSON.stringify({ token, timestamp, infoHash }), { expirationTtl: EXPIRY_MINUTES * 60 });

  return json({ token, expires: expiresAt, expiryMinutes: EXPIRY_MINUTES, currentTorrents: currentCount + 1, maxTorrents: MAX_TORRENTS });
}
