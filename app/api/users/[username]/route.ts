import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext, activityJson, notFound } from "@/lib/cf";
import { getActorByUsername, getActorById } from "@/lib/db";
import { buildActor } from "@/lib/activitypub/utils";

export async function GET(request: NextRequest, { params }: { params: Promise<{ username: string }> }) {
  const { env } = getCloudflareContext();
  const { username } = await params;
  const domain = new URL(env.INSTANCE_URL).hostname;

  const actor = await getActorByUsername(env.DB, username, domain);
  if (!actor || !actor.isLocal) return notFound("Actor not found");

  const accept = request.headers.get("accept") ?? "";
  if (!accept.includes("application/activity+json") && !accept.includes("application/ld+json")) {
    return NextResponse.redirect(new URL(`/@${username}`, request.url));
  }

  const apActor = buildActor(env.INSTANCE_URL, username, {
    displayName: actor.displayName ?? username,
    summary: actor.summary ?? "",
    avatarUrl: actor.avatarUrl,
    headerUrl: actor.headerUrl,
    publicKeyPem: actor.publicKeyPem,
    followersCount: actor.followersCount,
    followingCount: actor.followingCount,
    torrentsCount: actor.torrentsCount,
    published: actor.createdAt,
    fields: [
      { name: "Torrents", value: String(actor.torrentsCount ?? 0) },
    ],
  });

  return activityJson(apActor);
}
