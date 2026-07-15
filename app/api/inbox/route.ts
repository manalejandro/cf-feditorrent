import { NextRequest } from "next/server";
import { getCloudflareContext, json } from "@/lib/cf";
import { verifySignature, extractSigningKeyId } from "@/lib/activitypub/security";
import { processInboxActivity } from "@/lib/activitypub/inbox";
import { getActorById } from "@/lib/db";
import { fetchRemoteObject } from "@/lib/activitypub/federation";
import type { APActivity } from "@/lib/types";

export async function POST(request: NextRequest) {
  const { env } = getCloudflareContext();
  const body = await request.text();
  let activity: APActivity;
  try {
    activity = JSON.parse(body);
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const actorId = typeof activity.actor === "string" ? activity.actor : activity.actor?.id;
  if (!actorId) return json({ error: "Missing actor" }, 400);

  const headers: Record<string, string> = {};
  request.headers.forEach((v, k) => { headers[k.toLowerCase()] = v; });

  let remoteActor = await getActorById(env.DB, actorId);
  if (!remoteActor) {
    const fetched = await fetchRemoteObject(actorId) as any;
    if (fetched?.publicKey?.publicKeyPem) {
      const domain = new URL(fetched.id).hostname;
      await env.DB
        .prepare("INSERT OR REPLACE INTO actors (id, username, domain, display_name, summary, avatar_url, header_url, public_key_pem, inbox, is_local, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, datetime('now'))")
        .bind(fetched.id, fetched.preferredUsername, domain, fetched.name ?? null, fetched.summary ?? null, fetched.icon?.url ?? null, fetched.image?.url ?? null, fetched.publicKey.publicKeyPem, fetched.inbox ?? null)
        .run();
      remoteActor = await getActorById(env.DB, actorId);
    }
  }

  if (!remoteActor) return json({ error: "Could not resolve actor" }, 400);

  const valid = await verifySignature(
    "POST",
    request.url,
    headers,
    remoteActor.publicKeyPem,
    body
  );

  if (!valid) {
    const sigKeyId = extractSigningKeyId(headers);
    let fetchedKeyPem = remoteActor.publicKeyPem;
    if (sigKeyId) {
      try {
        const keyObj = await fetchRemoteObject(sigKeyId) as any;
        if (keyObj?.publicKeyPem) fetchedKeyPem = keyObj.publicKeyPem;
      } catch {}
      const retryValid = await verifySignature("POST", request.url, headers, fetchedKeyPem, body);
      if (!retryValid) return json({ error: "Invalid signature" }, 401);
    } else {
      return json({ error: "Invalid signature" }, 401);
    }
  }

  const allTargets = [
    ...(activity.to || []),
    ...(activity.cc || []),
  ];
  const localActorUrl = allTargets.find((t: string) =>
    typeof t === "string" && t.startsWith(env.INSTANCE_URL + "/users/")
  );
  let recipient = localActorUrl ? await getActorById(env.DB, localActorUrl) : null;

  if (!recipient && activity.type === "Follow") {
    const objectId = typeof activity.object === "string" ? activity.object : (activity.object as any)?.id;
    if (objectId) {
      recipient = await getActorById(env.DB, objectId);
    }
  }

  if (!recipient) {
    const actorId = typeof activity.actor === "string" ? activity.actor : (activity.actor as any)?.id;
    if (actorId && actorId.startsWith(env.INSTANCE_URL + "/users/")) {
      recipient = await getActorById(env.DB, actorId);
    }
  }

  if (recipient?.privateKeyPem) {
    await processInboxActivity(activity, {
      db: env.DB,
      baseUrl: env.INSTANCE_URL,
      recipient: {
        id: recipient.id,
        username: recipient.username,
        privateKeyPem: recipient.privateKeyPem,
      },
    });
  }

  return new Response(null, { status: 202 });
}
