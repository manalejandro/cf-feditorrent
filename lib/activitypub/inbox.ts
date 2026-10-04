/**
 * Inbox activity processor — handles incoming ActivityPub activities.
 */

import type { D1Database } from "@cloudflare/workers-types";
import type { APActivity, APActor } from "@/lib/types";
import {
  getActorById,
  createFollow,
  updateFollowState,
  deleteFollow,
  updateActorCounts,
  createNotification,
  getFollowByActivityId,
  getFollow,
} from "@/lib/db";
import { buildAccept, generateId } from "./utils";
import { deliverToInbox, fetchRemoteObject } from "./federation";
import { cacheRemoteActor, type LocalSigningKey } from "./signer-key";

interface InboxContext {
  db: D1Database;
  baseUrl: string;
  recipient?: { id: string; username: string; privateKeyPem: string } | null;
  /**
   * The actor that signed the HTTP request (derived from the Signature keyId).
   * Used to reject cross-actor spoofing — see processInboxActivity.
   */
  signingActorId?: string | null;
  signingKey?: LocalSigningKey | null;
}

export async function processInboxActivity(activity: APActivity, ctx: InboxContext): Promise<void> {
  const rawType = activity.type as unknown;
  const type = typeof rawType === "string"
    ? rawType.toLowerCase()
    : Array.isArray(rawType)
      ? String(rawType[rawType.length - 1] ?? "").toLowerCase()
      : "";

  const activityActorId = typeof activity.actor === "string"
    ? activity.actor
    : (activity.actor as { id?: string } | undefined)?.id;

  // Anti-spoofing: the HTTP-signature signer must own the activity's `actor`.
  if (ctx.signingActorId && activityActorId && ctx.signingActorId !== activityActorId) {
    return;
  }

  // Replay protection: record the activity id and skip duplicates. Most
  // handlers are idempotent, but replayed Delete/Undo/Update activities can
  // still corrupt counters or state.
  const dedupActorId = activityActorId ?? ctx.signingActorId;
  if (typeof activity.id === "string" && activity.id && dedupActorId) {
    try {
      const dedup = await ctx.db
        .prepare(
          `INSERT OR IGNORE INTO activities (id, type, actor_id, object_id, to_list, cc_list, raw, is_local, delivered)
           VALUES (?, ?, ?, ?, ?, ?, ?, 0, 1)`
        )
        .bind(
          activity.id,
          type || "unknown",
          dedupActorId,
          typeof activity.object === "string"
            ? activity.object
            : (activity.object as { id?: string } | undefined)?.id ?? null,
          JSON.stringify(activity.to ?? []),
          JSON.stringify(activity.cc ?? []),
          JSON.stringify(activity)
        )
        .run();
      if ((dedup.meta?.changes ?? 0) === 0) return;
    } catch { /* dedup is best-effort — never block processing */ }
  }

  try {
    switch (type) {
      case "follow": await handleFollow(activity, ctx); break;
      case "accept": await handleAccept(activity, ctx); break;
      case "reject": await handleReject(activity, ctx); break;
      case "undo": await handleUndo(activity, ctx); break;
      case "delete": await handleDelete(activity, ctx); break;
      case "update": await handleUpdate(activity, ctx); break;
      default: break;
    }
  } catch (err) {
    console.error(`[inbox] processInboxActivity error for type=${type}: ${err}`);
  }
}

async function handleFollow(activity: APActivity, ctx: InboxContext): Promise<void> {
  if (!ctx.recipient) return;
  const actorId = typeof activity.actor === "string" ? activity.actor : activity.actor.id;
  const targetId = typeof activity.object === "string" ? activity.object : (activity.object as APActor)?.id;
  if (!targetId || targetId !== ctx.recipient.id) return;

  const recipient = await getActorById(ctx.db, ctx.recipient.id);
  if (!recipient) return;

  const followerActor = await ensureActorCached(ctx.db, actorId, ctx.signingKey);
  if (!followerActor) return;

  const existing = await getFollow(ctx.db, actorId, targetId);
  if (!existing) {
    await createFollow(ctx.db, {
      id: generateId(),
      actorId,
      targetId,
      state: "accepted",
      activityId: activity.id,
      createdAt: new Date().toISOString(),
    });
  }

  const acceptId = generateId();
  const acceptActivity = buildAccept(ctx.baseUrl, ctx.recipient.id, activity, acceptId);

  if (!existing) {
    const actor = await getActorById(ctx.db, targetId);
    if (actor) {
      await updateActorCounts(ctx.db, targetId, { followersCount: (actor.followersCount ?? 0) + 1 });
    }
  }

  if (!existing) {
    await createNotification(ctx.db, {
      id: generateId(),
      type: "follow",
      accountId: actorId,
      targetAccountId: targetId,
    });
  }

  const requesterInbox = followerActor.inbox ?? `${followerActor.id.replace(/\/$/, "")}/inbox`;
  if (requesterInbox) {
    await deliverToInbox(requesterInbox, acceptActivity, `${ctx.recipient.id}#main-key`, ctx.recipient.privateKeyPem);
  }
}

async function handleAccept(activity: APActivity, ctx: InboxContext): Promise<void> {
  const obj = activity.object as APActivity | undefined;
  if (!obj) return;
  const followActivityId = typeof obj === "string" ? obj : obj.id;
  const row = await getFollowByActivityId(ctx.db, followActivityId);
  if (!row || row.state !== "pending") return;
  // Only the followed actor may accept the follow.
  const actorId = typeof activity.actor === "string" ? activity.actor : activity.actor.id;
  if (actorId !== row.targetId) return;

  await updateFollowState(ctx.db, row.id, "accepted");
  const follower = await getActorById(ctx.db, row.actorId);
  if (follower?.isLocal) {
    await updateActorCounts(ctx.db, row.actorId, { followingCount: (follower.followingCount ?? 0) + 1 });
  }
  const followed = await getActorById(ctx.db, row.targetId);
  if (followed) {
    await updateActorCounts(ctx.db, row.targetId, { followersCount: (followed.followersCount ?? 0) + 1 });
  }
  if (follower?.isLocal) {
    await createNotification(ctx.db, {
      id: generateId(),
      type: "follow_accept",
      accountId: row.targetId,
      targetAccountId: row.actorId,
    });
  }
}

async function handleReject(activity: APActivity, ctx: InboxContext): Promise<void> {
  const obj = activity.object as APActivity | undefined;
  if (!obj) return;
  const followActivityId = typeof obj === "string" ? obj : obj.id;
  const row = await getFollowByActivityId(ctx.db, followActivityId);
  if (!row) return;
  // Only the followed actor may reject the follow.
  const actorId = typeof activity.actor === "string" ? activity.actor : activity.actor.id;
  if (actorId !== row.targetId) return;

  await updateFollowState(ctx.db, row.id, "rejected");
  const follower = await getActorById(ctx.db, row.actorId);
  if (follower?.isLocal) {
    await createNotification(ctx.db, {
      id: generateId(),
      type: "follow_reject",
      accountId: row.targetId,
      targetAccountId: row.actorId,
    });
  }
}

async function handleUndo(activity: APActivity, ctx: InboxContext): Promise<void> {
  const obj = activity.object as APActivity | undefined;
  if (!obj || typeof obj !== "object") return;
  const actorId = typeof activity.actor === "string" ? activity.actor : activity.actor.id;
  const innerType = (obj.type ?? "").toLowerCase();
  if (innerType === "follow") {
    const targetId = typeof obj.object === "string" ? obj.object : (obj.object as APActor)?.id;
    if (targetId) {
      const follow = await getFollow(ctx.db, actorId, targetId);
      if (!follow) return;
      await deleteFollow(ctx.db, actorId, targetId);
      const target = await getActorById(ctx.db, targetId);
      if (target) {
        await updateActorCounts(ctx.db, targetId, { followersCount: Math.max(0, (target.followersCount ?? 0) - 1) });
      }
    }
  }
}

async function handleDelete(activity: APActivity, ctx: InboxContext): Promise<void> {
  const actorId = typeof activity.actor === "string" ? activity.actor : activity.actor.id;
  const objectId = typeof activity.object === "string" ? activity.object : (activity.object as { id: string })?.id;
  if (!objectId) return;
  // Only the author may delete their own object.
  const obj = await ctx.db
    .prepare("SELECT id FROM objects WHERE id = ? AND actor_id = ?")
    .bind(objectId, actorId)
    .first() as { id: string } | null;
  if (obj) {
    await ctx.db.prepare("DELETE FROM objects WHERE id = ?").bind(objectId).run();
  }
}

async function handleUpdate(activity: APActivity, ctx: InboxContext): Promise<void> {
  const obj = activity.object as APActor | undefined;
  if (!obj || typeof obj !== "object") return;
  if (["Person", "Service", "Application", "Group", "Organization"].includes(obj.type)) {
    const actorId = typeof activity.actor === "string" ? activity.actor : (activity.actor as APActor).id;
    if (obj.id !== actorId) return;
    await updateActorFields(ctx.db, obj.id, {
      displayName: obj.name ?? null,
      summary: obj.summary ?? null,
      avatarUrl: obj.icon?.url ?? null,
      headerUrl: obj.image?.url ?? null,
    });
  }
}

async function updateActorFields(
  db: D1Database,
  actorId: string,
  fields: { displayName?: string | null; summary?: string | null; avatarUrl?: string | null; headerUrl?: string | null }
): Promise<void> {
  const { displayName, summary, avatarUrl, headerUrl } = fields;
  await db
    .prepare("UPDATE actors SET display_name = COALESCE(?, display_name), summary = COALESCE(?, summary), avatar_url = COALESCE(?, avatar_url), header_url = COALESCE(?, header_url), updated_at = datetime('now') WHERE id = ?")
    .bind(displayName ?? null, summary ?? null, avatarUrl ?? null, headerUrl ?? null, actorId)
    .run();
}

async function ensureActorCached(
  db: D1Database,
  actorId: string,
  signingKey?: LocalSigningKey | null
): Promise<APActor | null> {
  const actor = await getActorById(db, actorId);
  if (actor) {
    return {
      id: actor.id,
      type: "Person",
      preferredUsername: actor.username,
      inbox: actor.inbox ?? `${actor.id}/inbox`,
      outbox: `${actor.id}/outbox`,
      followers: `${actor.id}/followers`,
      following: `${actor.id}/following`,
      publicKey: { id: `${actor.id}#main-key`, owner: actor.id, publicKeyPem: actor.publicKeyPem },
      endpoints: { sharedInbox: `${new URL(actor.id).origin}/inbox` },
    } as APActor;
  }
  try {
    const fetched = (await fetchRemoteObject(
      actorId,
      signingKey ? `${signingKey.id}#main-key` : undefined,
      signingKey?.privateKeyPem
    )) as APActor | null;
    if (fetched?.publicKey?.publicKeyPem) {
      await cacheRemoteActor(db, fetched);
      return fetched;
    }
  } catch { /* ignore */ }
  return null;
}
