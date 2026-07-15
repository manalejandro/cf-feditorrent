import type { APActivity, APActor } from "@/lib/types";
import { getActorById, createFollow, updateFollowState, deleteFollow, updateActorCounts, createNotification, getFollowByActivityId, getFollow } from "@/lib/db";
import { buildAccept, generateId } from "./utils";
import { deliverToInbox, fetchRemoteObject } from "./federation";

interface InboxContext {
  db: any;
  baseUrl: string;
  recipient?: { id: string; username: string; privateKeyPem: string } | null;
  signingKey?: { id: string; privateKeyPem: string } | null;
}

export async function processInboxActivity(activity: APActivity, ctx: InboxContext): Promise<void> {
  const type = (activity.type ?? "").toLowerCase();
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

  const followerActor = await ensureActorCached(ctx.db, actorId);
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
  if (row && row.state === "pending") {
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
}

async function handleReject(activity: APActivity, ctx: InboxContext): Promise<void> {
  const obj = activity.object as APActivity | undefined;
  if (!obj) return;
  const followActivityId = typeof obj === "string" ? obj : obj.id;
  const row = await getFollowByActivityId(ctx.db, followActivityId);
  if (row) {
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
}

async function handleUndo(activity: APActivity, ctx: InboxContext): Promise<void> {
  const obj = activity.object as APActivity | undefined;
  if (!obj || typeof obj !== "object") return;
  const actorId = typeof activity.actor === "string" ? activity.actor : activity.actor.id;
  const innerType = (obj.type ?? "").toLowerCase();
  if (innerType === "follow") {
    const targetId = typeof obj.object === "string" ? obj.object : (obj.object as APActor)?.id;
    if (targetId) {
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
  if (["Person", "Service"].includes(obj.type)) {
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

async function updateActorFields(db: any, actorId: string, fields: { displayName?: string | null; summary?: string | null; avatarUrl?: string | null; headerUrl?: string | null }): Promise<void> {
  const { displayName, summary, avatarUrl, headerUrl } = fields;
  await db
    .prepare("UPDATE actors SET display_name = COALESCE(?, display_name), summary = COALESCE(?, summary), avatar_url = COALESCE(?, avatar_url), header_url = COALESCE(?, header_url), updated_at = datetime('now') WHERE id = ?")
    .bind(displayName ?? null, summary ?? null, avatarUrl ?? null, headerUrl ?? null, actorId)
    .run();
}

async function ensureActorCached(db: any, actorId: string): Promise<APActor | null> {
  let actor = await getActorById(db, actorId);
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
    const fetched = await fetchRemoteObject(actorId) as APActor | null;
    if (fetched?.publicKey?.publicKeyPem) {
      const domain = new URL(fetched.id).hostname;
      await db
        .prepare("INSERT OR REPLACE INTO actors (id, username, domain, display_name, summary, avatar_url, header_url, public_key_pem, inbox, is_local, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, datetime('now'))")
        .bind(fetched.id, fetched.preferredUsername, domain, fetched.name ?? null, fetched.summary ?? null, fetched.icon?.url ?? null, fetched.image?.url ?? null, fetched.publicKey.publicKeyPem, fetched.inbox ?? null)
        .run();
      return fetched;
    }
  } catch { /* ignore */ }
  return null;
}
