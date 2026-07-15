import { NextRequest } from "next/server";
import { getCloudflareContext, json } from "@/lib/cf";
import { searchActors, getActorByUsernameAndDomain, getActorById } from "@/lib/db";
import { resolveWebFinger, fetchRemoteObject } from "@/lib/activitypub/federation";

export async function GET(request: NextRequest) {
  const { env } = getCloudflareContext();
  const q = request.nextUrl.searchParams.get("q") || "";
  const limit = parseInt(request.nextUrl.searchParams.get("limit") || "20");
  const resolve = request.nextUrl.searchParams.get("resolve") !== "false";

  if (!q.trim()) return json([]);

  if (q.includes("@") && q.split("@").length >= 2) {
    const normalized = q.startsWith("@") ? q.slice(1) : q;
    const [username, domain] = normalized.split("@");
    if (username && domain) {
      let actor = await getActorByUsernameAndDomain(env.DB, username, domain);
      if (!actor && resolve) {
        const href = await resolveWebFinger(normalized);
        if (href) {
          const fetched = await fetchRemoteObject(href) as any;
          if (fetched?.publicKey?.publicKeyPem) {
            await env.DB
              .prepare("INSERT OR REPLACE INTO actors (id, username, domain, display_name, summary, avatar_url, header_url, public_key_pem, inbox, is_local, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, datetime('now'))")
              .bind(fetched.id, fetched.preferredUsername, domain, fetched.name ?? null, fetched.summary ?? null, fetched.icon?.url ?? null, fetched.image?.url ?? null, fetched.publicKey.publicKeyPem, fetched.inbox ?? null)
              .run();
            actor = await getActorByUsernameAndDomain(env.DB, username, domain);
          }
        }
      }
      if (actor) return json([{
        id: actor.id,
        username: actor.username,
        domain: actor.domain,
        displayName: actor.displayName,
        avatarUrl: actor.avatarUrl,
        isLocal: actor.isLocal,
        followersCount: actor.followersCount,
        followingCount: actor.followingCount,
        torrentsCount: actor.torrentsCount,
      }]);
    }
  }

  const localResults = await searchActors(env.DB, q, limit);
  return json(localResults.map((a) => ({
    id: a.id,
    username: a.username,
    domain: a.domain,
    displayName: a.displayName,
    avatarUrl: a.avatarUrl,
    isLocal: a.isLocal,
    followersCount: a.followersCount,
    followingCount: a.followingCount,
    torrentsCount: a.torrentsCount,
  })));
}
