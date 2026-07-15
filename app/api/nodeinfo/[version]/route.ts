import { NextRequest } from "next/server";
import { getCloudflareContext, json, notFound } from "@/lib/cf";

export async function GET(request: NextRequest, { params }: { params: Promise<{ version: string }> }) {
  const { env } = getCloudflareContext();
  const { version } = await params;

  if (version !== "2.0") return notFound();

  const userCount = await env.DB.prepare("SELECT COUNT(*) as count FROM actors WHERE is_local = 1").first() as any;
  const torrentCount = await env.DB.prepare("SELECT COUNT(*) as count FROM torrents").first() as any;
  const localPosts = await env.DB.prepare("SELECT COUNT(*) as count FROM objects WHERE is_local = 1").first() as any;

  return json({
    version: "2.0",
    software: { name: "feditorrent", version: env.INSTANCE_VERSION || "1.0.0", repository: "https://github.com/manalejandro/cf-feditorrent" },
    protocols: ["activitypub"],
    services: { inbound: [], outbound: [] },
    openRegistrations: true,
    usage: {
      users: { total: userCount?.count || 0, activeMonth: userCount?.count || 0, activeHalfyear: userCount?.count || 0 },
      localPosts: localPosts?.count || 0,
      localComments: 0,
    },
    metadata: {
      nodeName: env.INSTANCE_TITLE,
      nodeDescription: env.INSTANCE_DESCRIPTION,
      torrents: torrentCount?.count || 0,
    },
  });
}
