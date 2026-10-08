import { NextRequest, NextResponse } from "next/server";

import { getTorrentBySlug, incrementTorrentClicks } from "@/lib/db";
import { env } from "cloudflare:workers";

export async function GET(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const torrent = await getTorrentBySlug(env.DB, slug);
  if (!torrent) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  incrementTorrentClicks(env.DB, torrent.id).catch(() => {});

  return NextResponse.redirect(torrent.magnetUri);
}
