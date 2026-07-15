import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@/lib/cf";
import { getTorrentBySlug, incrementTorrentClicks } from "@/lib/db";

export async function GET(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { env } = getCloudflareContext();
  const { slug } = await params;

  const torrent = await getTorrentBySlug(env.DB, slug);
  if (!torrent) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  incrementTorrentClicks(env.DB, torrent.id).catch(() => {});

  return NextResponse.redirect(torrent.magnetUri);
}
