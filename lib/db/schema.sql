CREATE TABLE IF NOT EXISTS actors (
  id              TEXT PRIMARY KEY,
  username        TEXT NOT NULL,
  domain          TEXT NOT NULL,
  display_name    TEXT,
  summary         TEXT,
  avatar_url      TEXT,
  header_url      TEXT,
  public_key_pem  TEXT NOT NULL,
  private_key_pem TEXT,
  is_local        INTEGER NOT NULL DEFAULT 0,
  followers_count INTEGER NOT NULL DEFAULT 0,
  following_count INTEGER NOT NULL DEFAULT 0,
  torrents_count  INTEGER NOT NULL DEFAULT 0,
  email           TEXT UNIQUE,
  password_hash   TEXT,
  email_verified                 INTEGER NOT NULL DEFAULT 0,
  email_verification_token        TEXT,
  email_verification_sent_at      TEXT,
  password_reset_token            TEXT,
  password_reset_expires_at       TEXT,
  inbox                   TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (username, domain)
);

CREATE INDEX IF NOT EXISTS idx_actors_domain ON actors(domain);
CREATE INDEX IF NOT EXISTS idx_actors_is_local ON actors(is_local);
CREATE INDEX IF NOT EXISTS idx_actors_email ON actors(email);

CREATE TABLE IF NOT EXISTS torrents (
  id            TEXT PRIMARY KEY,
  slug          TEXT NOT NULL,
  actor_id      TEXT NOT NULL REFERENCES actors(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  description   TEXT,
  info_hash     TEXT NOT NULL,
  magnet_uri    TEXT NOT NULL,
  torrent_file_url TEXT,
  size          INTEGER NOT NULL DEFAULT 0,
  file_count    INTEGER NOT NULL DEFAULT 0,
  file_type     TEXT,
  magnet_only   INTEGER NOT NULL DEFAULT 0,
  clicks        INTEGER NOT NULL DEFAULT 0,
  object_id     TEXT REFERENCES objects(id) ON DELETE SET NULL,
  published     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_torrents_slug ON torrents(slug);
CREATE INDEX IF NOT EXISTS idx_torrents_actor ON torrents(actor_id);
CREATE INDEX IF NOT EXISTS idx_torrents_info_hash ON torrents(info_hash);
CREATE UNIQUE INDEX IF NOT EXISTS idx_torrents_slug_unique ON torrents(slug);

CREATE TABLE IF NOT EXISTS objects (
  id          TEXT PRIMARY KEY,
  type        TEXT NOT NULL DEFAULT 'Torrent',
  actor_id    TEXT NOT NULL REFERENCES actors(id) ON DELETE CASCADE,
  content     TEXT,
  sensitive   INTEGER NOT NULL DEFAULT 0,
  visibility  TEXT NOT NULL DEFAULT 'public',
  url         TEXT,
  published   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
  is_local    INTEGER NOT NULL DEFAULT 0,
  raw         TEXT NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_objects_actor_id ON objects(actor_id);
CREATE INDEX IF NOT EXISTS idx_objects_published ON objects(published DESC);

CREATE TABLE IF NOT EXISTS follows (
  id          TEXT PRIMARY KEY,
  actor_id    TEXT NOT NULL REFERENCES actors(id) ON DELETE CASCADE,
  target_id   TEXT NOT NULL REFERENCES actors(id) ON DELETE CASCADE,
  state       TEXT NOT NULL DEFAULT 'pending',
  activity_id TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (actor_id, target_id)
);

CREATE INDEX IF NOT EXISTS idx_follows_actor ON follows(actor_id, state);
CREATE INDEX IF NOT EXISTS idx_follows_target ON follows(target_id, state);

CREATE TABLE IF NOT EXISTS activities (
  id          TEXT PRIMARY KEY,
  type        TEXT NOT NULL,
  actor_id    TEXT NOT NULL,
  object_id   TEXT,
  to_list     TEXT NOT NULL DEFAULT '[]',
  cc_list     TEXT NOT NULL DEFAULT '[]',
  raw         TEXT NOT NULL DEFAULT '{}',
  published   TEXT NOT NULL DEFAULT (datetime('now')),
  is_local    INTEGER NOT NULL DEFAULT 0,
  delivered   INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_activities_actor ON activities(actor_id);
CREATE INDEX IF NOT EXISTS idx_activities_type ON activities(type);

CREATE TABLE IF NOT EXISTS notifications (
  id                TEXT PRIMARY KEY,
  type              TEXT NOT NULL,
  account_id        TEXT NOT NULL REFERENCES actors(id) ON DELETE CASCADE,
  target_account_id TEXT NOT NULL REFERENCES actors(id) ON DELETE CASCADE,
  object_id         TEXT,
  is_read           INTEGER NOT NULL DEFAULT 0,
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_notif_target ON notifications(target_account_id, is_read);
CREATE INDEX IF NOT EXISTS idx_notif_created ON notifications(created_at DESC);

CREATE TABLE IF NOT EXISTS delivery_failures (
  id          TEXT PRIMARY KEY,
  activity_id TEXT NOT NULL,
  inbox_url   TEXT NOT NULL,
  attempts    INTEGER NOT NULL DEFAULT 0,
  last_error  TEXT,
  next_retry  TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  id          TEXT PRIMARY KEY,
  actor_id    TEXT NOT NULL REFERENCES actors(id) ON DELETE CASCADE,
  user_id     TEXT NOT NULL,
  token       TEXT NOT NULL UNIQUE,
  expires_at  TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);
CREATE INDEX IF NOT EXISTS idx_sessions_actor ON sessions(actor_id);
