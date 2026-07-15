import { DEFAULT_CONTEXT, PUBLIC_ADDRESS } from "./vocab";
import type { APActor, APTorrent, APActivity, APCollection, APCollectionPage } from "@/lib/types";

export function generateId(): string {
  return crypto.randomUUID();
}

export function actorIRI(baseUrl: string, username: string): string {
  return `${baseUrl}/users/${username.toLowerCase()}`;
}

export function objectIRI(baseUrl: string, id: string): string {
  return `${baseUrl}/objects/${id}`;
}

export function activityIRI(baseUrl: string, id: string): string {
  return `${baseUrl}/activities/${id}`;
}

export function inboxIRI(baseUrl: string, username: string): string {
  return `${actorIRI(baseUrl, username)}/inbox`;
}

export function outboxIRI(baseUrl: string, username: string): string {
  return `${actorIRI(baseUrl, username)}/outbox`;
}

export function followersIRI(baseUrl: string, username: string): string {
  return `${actorIRI(baseUrl, username)}/followers`;
}

export function followingIRI(baseUrl: string, username: string): string {
  return `${actorIRI(baseUrl, username)}/following`;
}

export function likedIRI(baseUrl: string, username: string): string {
  return `${actorIRI(baseUrl, username)}/liked`;
}

export function keyIRI(baseUrl: string, username: string): string {
  return `${actorIRI(baseUrl, username)}#main-key`;
}

export function buildActor(
  baseUrl: string,
  username: string,
  options: {
    displayName?: string;
    summary?: string;
    avatarUrl?: string | null;
    headerUrl?: string | null;
    publicKeyPem: string;
    manuallyApprovesFollowers?: boolean;
    discoverable?: boolean;
    followersCount?: number;
    followingCount?: number;
    torrentsCount?: number;
    published?: string;
    fields?: { name: string; value: string }[];
  }
): APActor {
  const id = actorIRI(baseUrl, username);
  return {
    "@context": DEFAULT_CONTEXT,
    id,
    type: "Person",
    preferredUsername: username,
    name: options.displayName ?? username,
    summary: options.summary ?? "",
    url: `${baseUrl}/@${username}`,
    inbox: inboxIRI(baseUrl, username),
    outbox: outboxIRI(baseUrl, username),
    followers: followersIRI(baseUrl, username),
    following: followingIRI(baseUrl, username),
    liked: likedIRI(baseUrl, username),
    publicKey: {
      id: keyIRI(baseUrl, username),
      owner: id,
      publicKeyPem: options.publicKeyPem,
    },
    manuallyApprovesFollowers: options.manuallyApprovesFollowers ?? false,
    discoverable: options.discoverable ?? true,
    published: options.published ?? new Date().toISOString(),
    endpoints: {
      sharedInbox: `${baseUrl}/inbox`,
    },
    ...(options.avatarUrl ? { icon: { type: "Image" as const, url: options.avatarUrl, mediaType: "image/webp" } } : {}),
    ...(options.headerUrl ? { image: { type: "Image" as const, url: options.headerUrl, mediaType: "image/webp" } } : {}),
    ...(options.fields && options.fields.length > 0 ? { attachment: options.fields.map((f) => ({ type: "PropertyValue" as const, name: f.name, value: f.value })) } : {}),
  } as APActor;
}

export function buildTorrentNote(
  baseUrl: string,
  id: string,
  options: {
    actorUsername: string;
    name: string;
    description?: string;
    slug: string;
    infoHash: string;
    magnetUri: string;
    torrentFileUrl?: string;
    size: number;
    fileCount: number;
    published: string;
  }
): APTorrent {
  const actorId = actorIRI(baseUrl, options.actorUsername);
  const noteId = objectIRI(baseUrl, id);
  const torrentUrl = `${baseUrl}/torrents/${options.slug}`;

  const nameHtml = `<p><strong>${escapeHtml(options.name)}</strong></p>`;
  const magnetHtml = `<p>🧲 <a href="${escapeHtml(options.magnetUri)}">${escapeHtml(options.magnetUri.slice(0, 60))}...</a></p>`;
  const linkHtml = `<p>🔗 <a href="${escapeHtml(torrentUrl)}">${escapeHtml(torrentUrl)}</a></p>`;
  const desc = options.description ? `<p>${escapeHtml(options.description)}</p>` : "";
  const sizeStr = formatSize(options.size);
  const metaHtml = `<p>📦 ${sizeStr} | ${options.fileCount} files | <code>${escapeHtml(options.infoHash.slice(0, 16))}...</code></p>`;
  const torrentFileHtml = options.torrentFileUrl
    ? `<p>📥 <a href="${escapeHtml(options.torrentFileUrl)}">Download .torrent</a></p>`
    : "";
  const content = `${nameHtml}${desc}${magnetHtml}${torrentFileHtml}${metaHtml}${linkHtml}`;

  return {
    "@context": DEFAULT_CONTEXT,
    id: noteId,
    type: "Note",
    attributedTo: actorId,
    content,
    published: options.published,
    to: [PUBLIC_ADDRESS],
    cc: [followersIRI(baseUrl, options.actorUsername)],
    url: torrentUrl,
    tag: [{ type: "Hashtag", name: "#torrent", href: `${baseUrl}/tags/torrent` }],
    torrentInfoHash: options.infoHash,
    torrentMagnetUri: options.magnetUri,
    torrentSize: options.size,
    torrentFileCount: options.fileCount,
    torrentFileUrl: options.torrentFileUrl,
  } as APTorrent;
}

function formatSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function buildCreate(baseUrl: string, actorId: string, note: APTorrent, id: string): APActivity {
  return {
    "@context": DEFAULT_CONTEXT,
    id: activityIRI(baseUrl, id),
    type: "Create",
    actor: actorId,
    published: note.published,
    to: note.to,
    cc: note.cc,
    object: note,
  } as APActivity;
}

export function buildFollow(baseUrl: string, actorId: string, targetId: string, id: string): APActivity {
  return {
    "@context": DEFAULT_CONTEXT,
    id: activityIRI(baseUrl, id),
    type: "Follow",
    actor: actorId,
    object: targetId,
    to: [targetId],
  } as APActivity;
}

export function buildAccept(baseUrl: string, actorId: string, followActivity: APActivity, id: string): APActivity {
  return {
    "@context": DEFAULT_CONTEXT,
    id: activityIRI(baseUrl, id),
    type: "Accept",
    actor: actorId,
    object: followActivity,
    to: [typeof followActivity.actor === "string" ? followActivity.actor : followActivity.actor.id],
  } as APActivity;
}

export function buildDelete(baseUrl: string, actorId: string, objectId: string, id: string): APActivity {
  return {
    "@context": DEFAULT_CONTEXT,
    id: activityIRI(baseUrl, id),
    type: "Delete",
    actor: actorId,
    object: { id: objectId, type: "Tombstone" },
    to: [PUBLIC_ADDRESS],
  } as APActivity;
}

export function buildUndo(baseUrl: string, actorId: string, activity: APActivity, id: string): APActivity {
  return {
    "@context": DEFAULT_CONTEXT,
    id: activityIRI(baseUrl, id),
    type: "Undo",
    actor: actorId,
    object: activity,
    to: activity.to ?? [PUBLIC_ADDRESS],
    cc: activity.cc,
  } as APActivity;
}

export function buildOrderedCollection(id: string, totalItems: number): APCollection {
  return {
    "@context": DEFAULT_CONTEXT,
    id,
    type: "OrderedCollection",
    totalItems,
    first: `${id}?page=true`,
  } as APCollection;
}

export function buildOrderedCollectionPage(
  collectionId: string,
  items: unknown[],
  nextId?: string,
  prevId?: string
): APCollectionPage {
  const page: APCollectionPage = {
    "@context": DEFAULT_CONTEXT,
    id: `${collectionId}?page=true`,
    type: "OrderedCollectionPage",
    partOf: collectionId,
    orderedItems: items as never[],
  };
  if (nextId) page.next = nextId;
  if (prevId) page.prev = prevId;
  return page;
}

export function isPublic(activity: APActivity): boolean {
  return [...(activity.to ?? []), ...(activity.cc ?? [])].includes(PUBLIC_ADDRESS);
}

export function extractDomain(url: string): string {
  return new URL(url).hostname;
}
