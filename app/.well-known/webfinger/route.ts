import { NextRequest } from "next/server";
import { getCloudflareContext, json } from "@/lib/cf";
import { getActorByUsernameAndDomain } from "@/lib/db";

export async function GET(request: NextRequest) {
  const { env } = getCloudflareContext();
  const resource = request.nextUrl.searchParams.get("resource");

  if (!resource) return json({ error: "Missing resource" }, 400);

  const domain = new URL(env.INSTANCE_URL).hostname;
  const acctMatch = resource.match(/^acct:(.+)@(.+)$/);
  const urlMatch = resource.match(/^https?:\/\/.+/);

  let username: string | null = null;
  let actorDomain: string | null = null;

  if (acctMatch) {
    username = acctMatch[1];
    actorDomain = acctMatch[2];
  } else if (urlMatch) {
    const url = new URL(resource);
    const userMatch = url.pathname.match(/^\/users\/([^/]+)/);
    if (userMatch) { username = userMatch[1]; actorDomain = url.hostname; }
  }

  if (!username || !actorDomain) return json({ error: "Invalid resource" }, 400);

  const actor = await getActorByUsernameAndDomain(env.DB, username, actorDomain);
  if (!actor) return json({ error: "Not found" }, 404);

  const actorUrl = `${env.INSTANCE_URL}/users/${username.toLowerCase()}`;
  const profileUrl = `${env.INSTANCE_URL}/@${username.toLowerCase()}`;

  return json({
    subject: `acct:${username.toLowerCase()}@${actorDomain}`,
    aliases: [actorUrl, profileUrl],
    links: [
      { rel: "self", type: "application/activity+json", href: actorUrl },
      { rel: "http://webfinger.net/rel/profile-page", type: "text/html", href: profileUrl },
      { rel: "http://ostatus.org/schema/1.0/subscribe", template: `${env.INSTANCE_URL}/authorize-follow?uri={uri}` },
    ],
  });
}
