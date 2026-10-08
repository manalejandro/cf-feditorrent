import { NextRequest } from "next/server";
import { json } from "@/lib/cf";
import { extractSigningKeyId } from "@/lib/activitypub/security";
import { purgeGoneSignerData, verifyIncomingSignature } from "@/lib/activitypub/signer-key";
import { processInboxActivity } from "@/lib/activitypub/inbox";
import { getActorById } from "@/lib/db";
import type { APActivity } from "@/lib/types";
import { env } from "cloudflare:workers";

// 1 MB is far above any legitimate AP activity we accept.
const MAX_BODY_BYTES = 1_000_000;

// POST /inbox — Shared inbox for federation delivery
export async function POST(request: NextRequest) {
  const baseUrl = env.INSTANCE_URL;

  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return json({ error: "Could not read request body" }, 400);
  }
  if (rawBody.length > MAX_BODY_BYTES) {
    return json({ error: "Payload too large" }, 413);
  }

  let activity: APActivity;
  try {
    activity = JSON.parse(rawBody);
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const actorId = typeof activity.actor === "string" ? activity.actor : activity.actor?.id;
  if (!actorId) return json({ error: "Missing actor" }, 400);

  const headers: Record<string, string> = {};
  request.headers.forEach((v, k) => { headers[k.toLowerCase()] = v; });

  const sigKeyId = extractSigningKeyId(headers);
  const signingActorId = sigKeyId ? sigKeyId.replace(/#.*$/, "") : actorId;

  // Local signing key used by the activity handlers for outbound fetches.
  let signingKey: { id: string; privateKeyPem: string } | undefined;
  try {
    const localRow = await env.DB
      .prepare("SELECT id, private_key_pem FROM actors WHERE is_local = 1 AND private_key_pem IS NOT NULL LIMIT 1")
      .first<{ id: string; private_key_pem: string }>();
    if (localRow?.private_key_pem) {
      signingKey = { id: localRow.id, privateKeyPem: localRow.private_key_pem };
    }
  } catch { /* ignore */ }

  const check = await verifyIncomingSignature(env.DB, {
    method: "POST",
    url: `${baseUrl}/inbox`,
    headers,
    body: rawBody,
    signingKeyId: sigKeyId ?? `${actorId}#main-key`,
    signingKey,
  });
  if (!check.ok) {
    const activityType = typeof activity.type === "string" ? activity.type.toLowerCase() : "";
    const activityObject = activity.object;
    const activityObjectId = typeof activityObject === "string" ? activityObject : (activityObject as { id?: string } | undefined)?.id ?? "";

    // An unverifiable `Delete` from an account the origin reports as gone can
    // only remove data (or nothing at all), so treat it as a delivered no-op.
    if (check.reason === "gone" && activityType === "delete") {
      const purged = await purgeGoneSignerData(env.DB, check, signingActorId);
      if (purged) console.warn(`[inbox] purged cached copy of gone actor ${signingActorId}`);
      return json({ status: "accepted" }, 202);
    }

    // A `Delete` whose signer key cannot be fetched right now can still be a
    // no-op when neither the signer nor the target object is cached.
    if (check.reason === "no-key" && activityType === "delete" && activityObjectId) {
      const [signer, target] = await Promise.all([
        getActorById(env.DB, signingActorId).catch(() => null),
        env.DB.prepare("SELECT id FROM objects WHERE id = ?").bind(activityObjectId).first().catch(() => null),
      ]);
      if (!signer && !target) return json({ status: "accepted" }, 202);
    }

    const detail = check.status ? ` (HTTP ${check.status})` : "";
    console.warn(
      `[inbox] ${check.reason} for ${signingActorId}${detail} type=${activityType || "?"}` +
      `${activityObjectId ? ` object=${activityObjectId}` : ""}`
    );
    return check.reason === "no-key"
      ? json({ error: "Cannot verify signature: no public key" }, 503)
      : json({ error: "Invalid HTTP signature" }, 401);
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
    const objectId = typeof activity.object === "string" ? activity.object : (activity.object as { id?: string })?.id;
    if (objectId) {
      recipient = await getActorById(env.DB, objectId);
    }
  }

  if (!recipient) {
    if (actorId.startsWith(env.INSTANCE_URL + "/users/")) {
      recipient = await getActorById(env.DB, actorId);
    }
  }

  try {
    await processInboxActivity(activity, {
      db: env.DB,
      baseUrl,
      signingActorId,
      signingKey,
      ...(recipient?.privateKeyPem
        ? { recipient: { id: recipient.id, username: recipient.username, privateKeyPem: recipient.privateKeyPem } }
        : {}),
    });
  } catch {
    // Still return 202 so the remote server does not keep retrying.
  }

  return new Response(null, { status: 202 });
}
