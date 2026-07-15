import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext, activityJson, notFound } from "@/lib/cf";
import { getTorrentBySlug } from "@/lib/db";
import { incrementTorrentClicks } from "@/lib/db";

export async function GET(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { env } = getCloudflareContext();
  const { slug } = await params;

  const torrent = await getTorrentBySlug(env.DB, slug);
  if (!torrent) return notFound("Torrent not found");

  const accept = request.headers.get("accept") ?? "";
  if (accept.includes("application/activity+json") || accept.includes("application/ld+json")) {
    const obj = torrent.objectId ? await env.DB.prepare("SELECT * FROM objects WHERE id = ?").bind(torrent.objectId).first() : null;
    if (obj && (obj as any).raw && (obj as any).raw !== "{}") {
      try {
        const parsed = JSON.parse((obj as any).raw);
        return activityJson(parsed);
      } catch {}
    }
  }

  incrementTorrentClicks(env.DB, torrent.id).catch(() => {});

  return NextResponse.redirect(new URL(`/?torrent=${slug}`, request.url));
}
