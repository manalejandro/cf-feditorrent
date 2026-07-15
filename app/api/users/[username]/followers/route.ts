import { NextRequest } from "next/server";
import { getCloudflareContext, activityJson, notFound } from "@/lib/cf";
import { getActorByUsername, getFollowerIds } from "@/lib/db";
import { buildOrderedCollection, buildOrderedCollectionPage, actorIRI } from "@/lib/activitypub/utils";

export async function GET(request: NextRequest, { params }: { params: Promise<{ username: string }> }) {
  const { env } = getCloudflareContext();
  const { username } = await params;
  const domain = new URL(env.INSTANCE_URL).hostname;

  const actor = await getActorByUsername(env.DB, username, domain);
  if (!actor || !actor.isLocal) return notFound();

  const baseUrl = env.INSTANCE_URL;
  const followersId = `${actorIRI(baseUrl, username)}/followers`;
  const page = request.nextUrl.searchParams.get("page");

  const followerIds = await getFollowerIds(env.DB, actor.id);

  if (page) {
    const items = followerIds.slice(0, 20);
    return activityJson(buildOrderedCollectionPage(followersId, items));
  }

  return activityJson(buildOrderedCollection(followersId, followerIds.length));
}
