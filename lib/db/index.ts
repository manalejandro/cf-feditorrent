import type { D1Database } from "@/lib/types/env";
import type {
  LocalActor,
  LocalTorrent,
  LocalFollow,
  LocalObject,
  LocalActivity,
  LocalNotification,
} from "@/lib/types";

type Row = Record<string, any>;

function rowToActor(r: Row): LocalActor {
  return {
    id: r.id,
    username: r.username,
    domain: r.domain,
    displayName: r.display_name ?? null,
    summary: r.summary ?? null,
    avatarUrl: r.avatar_url ?? null,
    headerUrl: r.header_url ?? null,
    publicKeyPem: r.public_key_pem,
    privateKeyPem: r.private_key_pem ?? null,
    isLocal: Boolean(r.is_local),
    followersCount: r.followers_count ?? 0,
    followingCount: r.following_count ?? 0,
    torrentsCount: r.torrents_count ?? 0,
    email: r.email ?? null,
    passwordHash: r.password_hash ?? null,
    emailVerified: Boolean(r.email_verified),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    inbox: r.inbox ?? null,
  };
}

function rowToTorrent(r: Row): LocalTorrent {
  return {
    id: r.id,
    slug: r.slug,
    actorId: r.actor_id,
    name: r.name,
    description: r.description ?? null,
    infoHash: r.info_hash,
    magnetUri: r.magnet_uri,
    torrentFileUrl: r.torrent_file_url ?? null,
    size: r.size ?? 0,
    fileCount: r.file_count ?? 0,
    fileType: r.file_type ?? null,
    magnetOnly: Boolean(r.magnet_only),
    clicks: r.clicks ?? 0,
    objectId: r.object_id ?? null,
    published: r.published,
    updatedAt: r.updated_at,
  };
}

function rowToFollow(r: Row): LocalFollow {
  return {
    id: r.id,
    actorId: r.actor_id,
    targetId: r.target_id,
    state: r.state,
    activityId: r.activity_id ?? null,
    createdAt: r.created_at,
  };
}

function rowToObject(r: Row): LocalObject {
  return {
    id: r.id,
    type: r.type,
    actorId: r.actor_id,
    content: r.content ?? null,
    sensitive: Boolean(r.sensitive),
    visibility: r.visibility,
    url: r.url,
    published: r.published,
    updatedAt: r.updated_at,
    local: Boolean(r.is_local),
    raw: r.raw ?? "{}",
  };
}

function rowToNotification(r: Row): LocalNotification {
  return {
    id: r.id,
    type: r.type,
    accountId: r.account_id,
    targetAccountId: r.target_account_id,
    objectId: r.object_id ?? null,
    read: Boolean(r.is_read),
    createdAt: r.created_at,
  };
}

// ── Actors ──────────────────────────────────────────────────────────────────

export async function getActorById(db: D1Database, id: string): Promise<LocalActor | null> {
  const row = await db.prepare("SELECT * FROM actors WHERE id = ?").bind(id).first();
  return row ? rowToActor(row) : null;
}

export async function getActorByUsername(db: D1Database, username: string, domain: string): Promise<LocalActor | null> {
  const row = await db
    .prepare("SELECT * FROM actors WHERE LOWER(username) = LOWER(?) AND domain = ?")
    .bind(username, domain)
    .first();
  return row ? rowToActor(row) : null;
}

export async function getActorByEmail(db: D1Database, email: string): Promise<LocalActor | null> {
  const row = await db.prepare("SELECT * FROM actors WHERE email = ?").bind(email).first();
  return row ? rowToActor(row) : null;
}

export async function searchActors(db: D1Database, query: string, limit = 20): Promise<LocalActor[]> {
  const { results } = await db
    .prepare("SELECT * FROM actors WHERE (LOWER(username) LIKE ? OR LOWER(display_name) LIKE ?) ORDER BY is_local DESC, followers_count DESC LIMIT ?")
    .bind(`%${query.toLowerCase()}%`, `%${query.toLowerCase()}%`, limit)
    .all<Row>();
  return results.map(rowToActor);
}

export async function getActorByUsernameAndDomain(db: D1Database, username: string, domain: string): Promise<LocalActor | null> {
  const row = await db
    .prepare("SELECT * FROM actors WHERE LOWER(username) = LOWER(?) AND LOWER(domain) = LOWER(?)")
    .bind(username, domain)
    .first();
  return row ? rowToActor(row) : null;
}

export async function createActor(
  db: D1Database,
  actor: {
    id: string;
    username: string;
    domain: string;
    displayName?: string;
    summary?: string;
    publicKeyPem: string;
    privateKeyPem: string;
    email: string;
    passwordHash: string;
  }
): Promise<void> {
  await db
    .prepare(
      "INSERT INTO actors (id, username, domain, display_name, summary, public_key_pem, private_key_pem, email, password_hash, is_local, inbox, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, datetime('now'), datetime('now'))"
    )
    .bind(
      actor.id,
      actor.username,
      actor.domain,
      actor.displayName ?? null,
      actor.summary ?? null,
      actor.publicKeyPem,
      actor.privateKeyPem,
      actor.email,
      actor.passwordHash,
      `${actor.id}/inbox`
    )
    .run();
}

export async function updateActor(
  db: D1Database,
  id: string,
  fields: {
    displayName?: string | null;
    summary?: string | null;
    avatarUrl?: string | null;
    headerUrl?: string | null;
  }
): Promise<void> {
  const { displayName, summary, avatarUrl, headerUrl } = fields;
  await db
    .prepare(
      "UPDATE actors SET display_name = COALESCE(?, display_name), summary = COALESCE(?, summary), avatar_url = COALESCE(?, avatar_url), header_url = COALESCE(?, header_url), updated_at = datetime('now') WHERE id = ?"
    )
    .bind(displayName ?? null, summary ?? null, avatarUrl ?? null, headerUrl ?? null, id)
    .run();
}

export async function updateActorCounts(
  db: D1Database,
  id: string,
  counts: { followersCount?: number; followingCount?: number; torrentsCount?: number }
): Promise<void> {
  const sets: string[] = [];
  const vals: (string | number)[] = [];
  if (counts.followersCount !== undefined) { sets.push("followers_count = ?"); vals.push(counts.followersCount); }
  if (counts.followingCount !== undefined) { sets.push("following_count = ?"); vals.push(counts.followingCount); }
  if (counts.torrentsCount !== undefined) { sets.push("torrents_count = ?"); vals.push(counts.torrentsCount); }
  if (sets.length === 0) return;
  vals.push(id);
  await db
    .prepare(`UPDATE actors SET ${sets.join(", ")}, updated_at = datetime('now') WHERE id = ?`)
    .bind(...vals)
    .run();
}

export async function setEmailVerificationToken(db: D1Database, actorId: string, token: string): Promise<void> {
  await db
    .prepare("UPDATE actors SET email_verification_token = ?, email_verification_sent_at = datetime('now') WHERE id = ?")
    .bind(token, actorId)
    .run();
}

export async function verifyEmailByToken(db: D1Database, token: string): Promise<string | null> {
  const row = await db
    .prepare("SELECT id FROM actors WHERE email_verification_token = ? AND email_verified = 0")
    .bind(token)
    .first() as { id: string } | null;
  if (!row) return null;
  await db
    .prepare("UPDATE actors SET email_verified = 1, email_verification_token = NULL, email_verification_sent_at = NULL, updated_at = datetime('now') WHERE id = ?")
    .bind(row.id)
    .run();
  return row.id;
}

export async function setEmailVerified(db: D1Database, actorId: string): Promise<void> {
  await db
    .prepare("UPDATE actors SET email_verified = 1, email_verification_token = NULL, email_verification_sent_at = NULL, updated_at = datetime('now') WHERE id = ?")
    .bind(actorId)
    .run();
}

export async function isEmailVerified(db: D1Database, actorId: string): Promise<boolean> {
  const row = await db
    .prepare("SELECT email_verified FROM actors WHERE id = ?")
    .bind(actorId)
    .first() as { email_verified: number } | null;
  return row?.email_verified === 1;
}

export async function setPasswordResetToken(db: D1Database, actorId: string): Promise<string> {
  const token = crypto.randomUUID();
  await db
    .prepare("UPDATE actors SET password_reset_token = ?, password_reset_expires_at = datetime('now', '+1 hour') WHERE id = ?")
    .bind(token, actorId)
    .run();
  return token;
}

export async function getActorByPasswordResetToken(db: D1Database, token: string): Promise<LocalActor | null> {
  const row = await db
    .prepare("SELECT * FROM actors WHERE password_reset_token = ? AND password_reset_expires_at > datetime('now')")
    .bind(token)
    .first();
  return row ? rowToActor(row) : null;
}

export async function updateActorPassword(db: D1Database, actorId: string, passwordHash: string): Promise<void> {
  await db
    .prepare("UPDATE actors SET password_hash = ?, password_reset_token = NULL, password_reset_expires_at = NULL, updated_at = datetime('now') WHERE id = ?")
    .bind(passwordHash, actorId)
    .run();
}

export async function clearPasswordResetToken(db: D1Database, actorId: string): Promise<void> {
  await db
    .prepare("UPDATE actors SET password_reset_token = NULL, password_reset_expires_at = NULL WHERE id = ?")
    .bind(actorId)
    .run();
}

// ── Torrents ────────────────────────────────────────────────────────────────

export async function getTorrentsByActor(db: D1Database, actorId: string): Promise<LocalTorrent[]> {
  const { results } = await db
    .prepare("SELECT * FROM torrents WHERE actor_id = ? ORDER BY published DESC")
    .bind(actorId)
    .all<Row>();
  return results.map(rowToTorrent);
}

export async function getTorrentBySlug(db: D1Database, slug: string): Promise<LocalTorrent | null> {
  const row = await db.prepare("SELECT * FROM torrents WHERE slug = ?").bind(slug).first();
  return row ? rowToTorrent(row) : null;
}

export async function getTorrentByInfoHash(db: D1Database, infoHash: string): Promise<LocalTorrent | null> {
  const row = await db.prepare("SELECT * FROM torrents WHERE info_hash = ?").bind(infoHash).first();
  return row ? rowToTorrent(row) : null;
}

export async function createTorrent(
  db: D1Database,
  torrent: {
    id: string;
    slug: string;
    actorId: string;
    name: string;
    description?: string;
    infoHash: string;
    magnetUri: string;
    torrentFileUrl?: string;
    size: number;
    fileCount: number;
    fileType?: string;
    magnetOnly: boolean;
    objectId?: string;
    published?: string;
  }
): Promise<void> {
  await db
    .prepare(
      "INSERT INTO torrents (id, slug, actor_id, name, description, info_hash, magnet_uri, torrent_file_url, size, file_count, file_type, magnet_only, object_id, published, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, datetime('now')), datetime('now'))"
    )
    .bind(
      torrent.id, torrent.slug, torrent.actorId, torrent.name, torrent.description ?? null,
      torrent.infoHash, torrent.magnetUri, torrent.torrentFileUrl ?? null,
      torrent.size, torrent.fileCount, torrent.fileType ?? null,
      torrent.magnetOnly ? 1 : 0, torrent.objectId ?? null, torrent.published ?? null
    )
    .run();
}

export async function incrementTorrentClicks(db: D1Database, torrentId: string): Promise<void> {
  await db
    .prepare("UPDATE torrents SET clicks = clicks + 1 WHERE id = ?")
    .bind(torrentId)
    .run();
}

export async function getTorrentsByActorPaginated(
  db: D1Database,
  actorId: string,
  limit = 20,
  offset = 0
): Promise<LocalTorrent[]> {
  const { results } = await db
    .prepare("SELECT * FROM torrents WHERE actor_id = ? ORDER BY published DESC LIMIT ? OFFSET ?")
    .bind(actorId, limit, offset)
    .all<Row>();
  return results.map(rowToTorrent);
}

export async function getTorrentById(db: D1Database, id: string): Promise<LocalTorrent | null> {
  const row = await db.prepare("SELECT * FROM torrents WHERE id = ?").bind(id).first();
  return row ? rowToTorrent(row) : null;
}

export async function deleteTorrent(db: D1Database, id: string): Promise<void> {
  await db.prepare("DELETE FROM torrents WHERE id = ?").bind(id).run();
}

export async function getAllTorrents(db: D1Database, limit = 50, offset = 0): Promise<LocalTorrent[]> {
  const { results } = await db
    .prepare("SELECT t.*, a.username as actor_username, a.domain as actor_domain FROM torrents t JOIN actors a ON a.id = t.actor_id ORDER BY t.published DESC LIMIT ? OFFSET ?")
    .bind(limit, offset)
    .all<Row>();
  // @ts-expect-error - returning joined results
  return results;
}

// ── Objects ─────────────────────────────────────────────────────────────────

export async function createObject(
  db: D1Database,
  obj: {
    id: string;
    type: string;
    actorId: string;
    content?: string | null;
    sensitive?: boolean;
    visibility?: string;
    url?: string;
    published?: string;
    local?: boolean;
    raw?: string;
  }
): Promise<void> {
  await db
    .prepare("INSERT INTO objects (id, type, actor_id, content, sensitive, visibility, url, published, updated_at, is_local, raw) VALUES (?, ?, ?, ?, ?, ?, ?, COALESCE(?, datetime('now')), datetime('now'), ?, ?)")
    .bind(obj.id, obj.type, obj.actorId, obj.content ?? null, obj.sensitive ? 1 : 0, obj.visibility ?? "public", obj.url ?? null, obj.published ?? null, obj.local !== false ? 1 : 0, obj.raw ?? "{}")
    .run();
}

export async function getObjectById(db: D1Database, id: string): Promise<LocalObject | null> {
  const row = await db.prepare("SELECT * FROM objects WHERE id = ?").bind(id).first();
  return row ? rowToObject(row) : null;
}

export async function deleteObject(db: D1Database, id: string): Promise<void> {
  await db.prepare("DELETE FROM objects WHERE id = ?").bind(id).run();
}

// ── Follows ─────────────────────────────────────────────────────────────────

export async function getFollow(db: D1Database, actorId: string, targetId: string): Promise<LocalFollow | null> {
  const row = await db
    .prepare("SELECT * FROM follows WHERE actor_id = ? AND target_id = ?")
    .bind(actorId, targetId)
    .first();
  return row ? rowToFollow(row) : null;
}

export async function getFollowByActivityId(db: D1Database, activityId: string): Promise<LocalFollow | null> {
  const row = await db
    .prepare("SELECT * FROM follows WHERE activity_id = ?")
    .bind(activityId)
    .first();
  return row ? rowToFollow(row) : null;
}

export async function createFollow(
  db: D1Database,
  follow: {
    id: string;
    actorId: string;
    targetId: string;
    state: string;
    activityId?: string;
    createdAt?: string;
  }
): Promise<void> {
  await db
    .prepare("INSERT INTO follows (id, actor_id, target_id, state, activity_id, created_at) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(follow.id, follow.actorId, follow.targetId, follow.state, follow.activityId ?? null, follow.createdAt ?? new Date().toISOString())
    .run();
}

export async function updateFollowState(db: D1Database, id: string, state: string): Promise<void> {
  await db.prepare("UPDATE follows SET state = ? WHERE id = ?").bind(state, id).run();
}

export async function deleteFollow(db: D1Database, actorId: string, targetId: string): Promise<void> {
  await db.prepare("DELETE FROM follows WHERE actor_id = ? AND target_id = ?").bind(actorId, targetId).run();
}

export async function getFollowers(db: D1Database, targetId: string): Promise<LocalActor[]> {
  const { results } = await db
    .prepare("SELECT a.* FROM actors a JOIN follows f ON f.actor_id = a.id WHERE f.target_id = ? AND f.state = 'accepted'")
    .bind(targetId)
    .all<Row>();
  return results.map(rowToActor);
}

export async function getFollowing(db: D1Database, actorId: string): Promise<LocalActor[]> {
  const { results } = await db
    .prepare("SELECT a.* FROM actors a JOIN follows f ON f.target_id = a.id WHERE f.actor_id = ? AND f.state = 'accepted'")
    .bind(actorId)
    .all<Row>();
  return results.map(rowToActor);
}

export async function getFollowerIds(db: D1Database, targetId: string): Promise<string[]> {
  const { results } = await db
    .prepare("SELECT actor_id FROM follows WHERE target_id = ? AND state = 'accepted'")
    .bind(targetId)
    .all<{ actor_id: string }>();
  return results.map((r) => r.actor_id);
}

export async function getPendingFollowsForTarget(db: D1Database, targetId: string): Promise<LocalFollow[]> {
  const { results } = await db
    .prepare("SELECT * FROM follows WHERE target_id = ? AND state = 'pending'")
    .bind(targetId)
    .all<Row>();
  return results.map(rowToFollow);
}

export async function getPendingFollowCount(db: D1Database, targetId: string): Promise<number> {
  const row = await db
    .prepare("SELECT COUNT(*) as count FROM follows WHERE target_id = ? AND state = 'pending'")
    .bind(targetId)
    .first() as { count: number } | null;
  return row?.count ?? 0;
}

// ── Activities ──────────────────────────────────────────────────────────────

export async function getActivitiesByActor(
  db: D1Database,
  actorId: string,
  limit = 20,
  offset = 0
): Promise<LocalActivity[]> {
  const { results } = await db
    .prepare("SELECT * FROM activities WHERE actor_id = ? ORDER BY published DESC LIMIT ? OFFSET ?")
    .bind(actorId, limit, offset)
    .all<Row>();
  return results.map((r: Row) => ({
    id: r.id,
    type: r.type,
    actorId: r.actor_id,
    objectId: r.object_id ?? null,
    toList: r.to_list,
    ccList: r.cc_list,
    raw: r.raw,
    published: r.published,
    isLocal: Boolean(r.is_local),
    delivered: Boolean(r.delivered),
  }));
}

export async function createActivity(
  db: D1Database,
  act: {
    id: string;
    type: string;
    actorId: string;
    objectId?: string;
    toList: string;
    ccList: string;
    raw: string;
    isLocal?: boolean;
  }
): Promise<void> {
  await db
    .prepare(
      "INSERT INTO activities (id, type, actor_id, object_id, to_list, cc_list, raw, published, is_local) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), ?)"
    )
    .bind(act.id, act.type, act.actorId, act.objectId ?? null, act.toList, act.ccList, act.raw, act.isLocal ? 1 : 0)
    .run();
}

// ── Notifications ───────────────────────────────────────────────────────────

export async function getNotifications(
  db: D1Database,
  targetAccountId: string,
  limit = 30,
  offset = 0
): Promise<LocalNotification[]> {
  const { results } = await db
    .prepare("SELECT * FROM notifications WHERE target_account_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?")
    .bind(targetAccountId, limit, offset)
    .all<Row>();
  return results.map(rowToNotification);
}

export async function createNotification(
  db: D1Database,
  notif: {
    id: string;
    type: string;
    accountId: string;
    targetAccountId: string;
    objectId?: string | null;
    read?: boolean;
    createdAt?: string;
  }
): Promise<void> {
  await db
    .prepare(
      "INSERT INTO notifications (id, type, account_id, target_account_id, object_id, is_read, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
    )
    .bind(notif.id, notif.type, notif.accountId, notif.targetAccountId, notif.objectId ?? null, notif.read ? 1 : 0, notif.createdAt ?? new Date().toISOString())
    .run();
}

export async function markNotificationRead(db: D1Database, id: string): Promise<void> {
  await db.prepare("UPDATE notifications SET is_read = 1 WHERE id = ?").bind(id).run();
}

export async function getUnreadNotificationCount(db: D1Database, targetAccountId: string): Promise<number> {
  const row = await db
    .prepare("SELECT COUNT(*) as count FROM notifications WHERE target_account_id = ? AND is_read = 0")
    .bind(targetAccountId)
    .first() as { count: number } | null;
  return row?.count ?? 0;
}
