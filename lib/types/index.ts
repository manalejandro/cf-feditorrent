export interface APObject {
  "@context"?: string | string[] | Record<string, unknown>;
  id: string;
  type: string;
  [key: string]: unknown;
}

export interface APActor extends APObject {
  type: "Person" | "Service" | "Group" | "Organization" | "Application";
  preferredUsername: string;
  name?: string;
  summary?: string;
  url?: string;
  icon?: APImage;
  image?: APImage;
  inbox: string;
  outbox: string;
  followers: string;
  following: string;
  liked?: string;
  publicKey: APPublicKey;
  endpoints?: { sharedInbox?: string };
  manuallyApprovesFollowers?: boolean;
  discoverable?: boolean;
  published?: string;
  attachment?: APPropertyValue[];
}

export interface APPublicKey {
  id: string;
  owner: string;
  publicKeyPem: string;
}

export interface APImage extends APObject {
  type: "Image";
  mediaType?: string;
  url: string;
}

export interface APTorrent extends APObject {
  type: "Torrent" | "Note";
  attributedTo: string;
  content: string;
  contentMap?: Record<string, string>;
  published: string;
  updated?: string;
  to: string[];
  cc?: string[];
  url?: string;
  sensitive?: boolean;
  summary?: string;
  attachment?: APAttachment[];
  tag?: APTag[];
  torrentInfoHash?: string;
  torrentMagnetUri?: string;
  torrentSize?: number;
  torrentFileCount?: number;
}

export interface APAttachment extends APObject {
  type: "Document" | "Image" | "Video" | "Audio";
  mediaType: string;
  url: string;
  name?: string;
}

export interface APTag {
  type: "Mention" | "Hashtag" | "Emoji";
  href?: string;
  name: string;
  icon?: APImage;
}

export interface APPropertyValue {
  type: "PropertyValue";
  name: string;
  value: string;
}

export interface APCollection extends APObject {
  type: "Collection" | "OrderedCollection";
  totalItems?: number;
  first?: string | APCollectionPage;
  items?: (string | APObject)[];
}

export interface APCollectionPage extends APObject {
  type: "CollectionPage" | "OrderedCollectionPage";
  partOf: string;
  next?: string;
  prev?: string;
  items?: (string | APObject)[];
  orderedItems?: (string | APObject)[];
}

export interface APActivity extends APObject {
  type: string;
  actor: string | APActor;
  object?: string | APObject | APActor | APTorrent;
  target?: string | APObject;
  to?: string[];
  cc?: string[];
  published?: string;
}

export interface LocalActor {
  id: string;
  username: string;
  domain: string;
  displayName: string | null;
  summary: string | null;
  avatarUrl: string | null;
  headerUrl: string | null;
  publicKeyPem: string;
  privateKeyPem: string | null;
  isLocal: boolean;
  followersCount: number;
  followingCount: number;
  torrentsCount: number;
  createdAt: string;
  updatedAt: string;
  email: string | null;
  passwordHash: string | null;
  emailVerified: boolean;
  inbox?: string;
}

export interface LocalTorrent {
  id: string;
  slug: string;
  actorId: string;
  name: string;
  description: string | null;
  infoHash: string;
  magnetUri: string;
  torrentFileUrl: string | null;
  size: number;
  fileCount: number;
  fileType: string | null;
  magnetOnly: boolean;
  clicks: number;
  objectId: string | null;
  published: string;
  updatedAt: string;
}

export interface LocalFollow {
  id: string;
  actorId: string;
  targetId: string;
  state: "pending" | "accepted" | "rejected";
  activityId: string | null;
  createdAt: string;
}

export interface LocalObject {
  id: string;
  type: string;
  actorId: string;
  content: string | null;
  sensitive: boolean;
  visibility: string;
  url: string;
  published: string;
  updatedAt: string;
  local: boolean;
  raw: string;
}

export interface LocalNotification {
  id: string;
  type: string;
  accountId: string;
  targetAccountId: string;
  objectId: string | null;
  read: boolean;
  createdAt: string;
}

export interface LocalActivity {
  id: string;
  type: string;
  actorId: string;
  objectId: string | null;
  toList: string;
  ccList: string;
  raw: string;
  published: string;
  isLocal: boolean;
  delivered: boolean;
}
