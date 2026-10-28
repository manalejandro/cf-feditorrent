import { NextRequest, NextResponse } from "next/server";
import { activityJson, notFound } from "@/lib/cf";
import { getActorByUsername } from "@/lib/db";
import { buildActor } from "@/lib/activitypub/utils";
import { env } from "cloudflare:workers";

export async function GET(request: NextRequest, { params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const domain = new URL(env.INSTANCE_URL).hostname;

  const actor = await getActorByUsername(env.DB, username, domain);
  if (!actor || !actor.isLocal) return notFound("Actor not found");

  const accept = request.headers.get("accept") ?? "";
  if (!accept.includes("application/activity+json") && !accept.includes("application/ld+json")) {
    return NextResponse.redirect(new URL(`/@${actor.username}`, request.url));
  }

  const apActor = buildActor(env.INSTANCE_URL, actor.username, {
    displayName: actor.displayName ?? actor.username,
    summary: actor.summary ?? "",
    avatarUrl: actor.avatarUrl,
    headerUrl: actor.headerUrl,
    publicKeyPem: actor.publicKeyPem,
    followersCount: actor.followersCount,
    followingCount: actor.followingCount,
    torrentsCount: actor.torrentsCount,
    // Actor `published` must be xsd:dateTime; SQLite stores "YYYY-MM-DD HH:MM:SS".
    published: toIsoDate(actor.createdAt),
    fields: [
      { name: "Torrents", value: String(actor.torrentsCount ?? 0) },
    ],
  });

  return activityJson(apActor);
}

/** Convert a SQLite datetime string to ISO-8601 (pass through if already ISO). */
function toIsoDate(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  if (value.includes("T")) return value;
  return `${value.replace(" ", "T")}Z`;
}
