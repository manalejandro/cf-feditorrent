import { NextRequest } from "next/server";
import { activityJson, notFound } from "@/lib/cf";
import { getActorByUsername, getFollowing } from "@/lib/db";
import { buildOrderedCollection, buildOrderedCollectionPage, actorIRI } from "@/lib/activitypub/utils";
import { env } from "cloudflare:workers";

export async function GET(request: NextRequest, { params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const domain = new URL(env.INSTANCE_URL).hostname;

  const actor = await getActorByUsername(env.DB, username, domain);
  if (!actor || !actor.isLocal) return notFound();

  const baseUrl = env.INSTANCE_URL;
  const followingId = `${actorIRI(baseUrl, username)}/following`;
  const page = request.nextUrl.searchParams.get("page");

  const followingActors = await getFollowing(env.DB, actor.id);
  const followingIds = followingActors.map((a) => a.id);

  if (page) {
    const items = followingIds.slice(0, 20);
    return activityJson(buildOrderedCollectionPage(followingId, items));
  }

  return activityJson(buildOrderedCollection(followingId, followingIds.length));
}
