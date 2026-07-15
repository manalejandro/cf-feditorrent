import { NextRequest } from "next/server";
import { getCloudflareContext, json, badRequest } from "@/lib/cf";

export async function GET(request: NextRequest) {
  const { env } = getCloudflareContext();
  const infoHash = request.nextUrl.searchParams.get("infoHash");
  const token = request.nextUrl.searchParams.get("token");

  if (!infoHash) return badRequest("infoHash requerido");

  const raw = await env.TORRENTS_KV.get(infoHash);
  if (!raw) return json({ valid: false, infoHash });

  const torrentData = JSON.parse(raw);
  const EXPIRY_MINUTES = parseInt(env.TORRENT_EXPIRY_MINUTES || "30");
  const now = Date.now();
  const isExpired = now - torrentData.timestamp > EXPIRY_MINUTES * 60 * 1000;

  if (isExpired) {
    await env.TORRENTS_KV.delete(infoHash);
    return json({ valid: false, infoHash });
  }

  let isValid = true;
  if (token) {
    isValid = torrentData.token === token;
  }

  return json({ valid: isValid, infoHash });
}
