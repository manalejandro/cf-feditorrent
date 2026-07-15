# FediTorrent

**Federated Torrent Sharing powered by ActivityPub**

Share torrents, magnet links, and WebTorrent files across the fediverse. Built with Next.js 16, Cloudflare D1, Workers Queues, and Durable Objects.

## Features

- **ActivityPub Federation** — Every torrent is an ActivityPub object that federates to your followers
- **Magnet Links** — Share magnet URIs from any torrent
- **WebTorrent** — Upload files for browser-to-browser P2P sharing (seeding from your browser)
- **Built-in Tracker** — WebSocket-based BitTorrent tracker via Cloudflare Durable Objects
- **Bilingual UI** — English and Spanish
- **Secure** — PBKDF2 password hashing, HTTP Signature verification, email verification
- **Mastodon Compatible** — WebFinger, NodeInfo, Mastodon API endpoints

## Tech Stack

- **Framework:** Next.js 16 (React 19)
- **Deployment:** Cloudflare Workers via OpenNext
- **Database:** Cloudflare D1 (SQLite)
- **Queue:** Cloudflare Workers Queues (ActivityPub delivery)
- **Storage:** Cloudflare KV (torrent authentication tokens)
- **Tracker:** Durable Objects (WebSocket BitTorrent tracker)
- **Styling:** Tailwind CSS v4
- **Auth:** PBKDF2 + sessions

## Getting Started

### Prerequisites

- Node.js 20+
- Cloudflare account with D1, KV, Queues, and Durable Objects enabled

### Setup

```bash
# Install dependencies
npm install

# Create D1 database
npx wrangler d1 create cf-feditorrent

# Create KV namespace
npx wrangler kv namespace create TORRENTS_KV

# Create Queue
npx wrangler queues create cf-feditorrent-delivery

# Update wrangler.toml with your IDs:
# - database_id from d1 create output
# - id and preview_id from kv namespace create output

# Run database migrations
npm run db:migrate

# Set secrets
npx wrangler secret put SECRET_KEY
npx wrangler secret put TURNSTILE_SECRET_KEY
```

### Development

```bash
npm run dev
```

### Deploy

```bash
npm run deploy
```

## Project Structure

```
├── app/
│   ├── api/
│   │   ├── auth/          # Register, login, password reset, email verification
│   │   ├── follow/        # Follow/unfollow actors
│   │   ├── inbox/         # Shared ActivityPub inbox
│   │   ├── torrents/      # Torrent CRUD
│   │   ├── tracker/       # WebTorrent tracker authentication
│   │   ├── users/         # Actor profiles, inbox, outbox, followers
│   │   └── v1/ v2/        # Mastodon-compatible API
│   ├── .well-known/       # WebFinger, NodeInfo
│   ├── objects/           # ActivityPub object endpoints
│   ├── torrents/          # Torrent redirect pages
│   ├── users/             # User profile pages
│   └── page.tsx           # Main SPA
├── components/
│   └── FollowButton.tsx
├── lib/
│   ├── activitypub/       # Federation, inbox processing, security, utils
│   ├── db/                # Database schema and access layer
│   ├── i18n/              # English/Spanish dictionary
│   └── types/             # TypeScript interfaces
├── src/
│   ├── tracker-do.ts      # Durable Object BitTorrent tracker
│   └── worker.ts          # Cloudflare Worker + Queue consumer
├── wrangler.toml          # Cloudflare configuration
└── middleware.ts          # CORS, security headers, URL rewrites
```

## API Endpoints

### ActivityPub
- `GET /.well-known/webfinger?resource=acct:user@domain` — WebFinger discovery
- `GET /.well-known/nodeinfo` — NodeInfo discovery
- `GET /nodeinfo/2.0` — NodeInfo payload
- `GET /users/:username` — Actor JSON-LD
- `GET /users/:username/outbox` — Actor outbox
- `GET /users/:username/followers` — Follower collection
- `GET /users/:username/following` — Following collection
- `POST /users/:username/inbox` — Per-actor inbox
- `POST /inbox` — Shared inbox
- `GET /objects/:id` — Torrent object

### Auth
- `POST /api/auth/register` — Create account
- `POST /api/auth/login` — Sign in
- `POST /api/auth/forgot-password` — Request password reset
- `POST /api/auth/reset-password` — Reset password
- `GET /api/auth/verify-email` — Verify email
- `POST /api/auth/resend-verification` — Resend verification

### Torrents
- `GET /api/torrents` — List user's torrents
- `POST /api/torrents` — Create torrent
- `DELETE /api/torrents/:id` — Delete torrent
- `GET /torrents/:slug` — View torrent

### Tracker
- `POST /api/tracker/authenticate` — Authenticate torrent for seeding
- `GET /api/tracker/validate` — Validate torrent token
- `WS /ws` — WebSocket tracker (Durable Object)

### Mastodon API
- `GET /api/v1/instance` — Instance info
- `GET /api/v2/instance` — Extended instance info
- `GET /api/v1/accounts/search?q=query` — Account search

### Social
- `POST /api/follow` — Follow an actor
- `POST /api/unfollow` — Unfollow an actor
- `GET /api/notifications` — List notifications
- `GET /api/notifications/count` — Unread count
- `POST /api/notifications/:id/read` — Mark read

## Download Commands

Each torrent page provides a direct download URL, a `.torrent` file, and a magnet link. Here's how to use them with popular clients:

### aria2 (recommended)

```bash
# Download .torrent file and let aria2 handle everything
aria2c "https://feditorrent.com/api/files/{infoHash}/{filename}.torrent"

# Or download the file directly via HTTP
aria2c -x4 -s4 "https://feditorrent.com/api/files/{infoHash}/{filename}"

# Using a magnet link (requires other peers to be seeding)
aria2c "magnet:?xt=urn:btih:{infoHash}&..."
```

### WebTorrent (browser)

Open the magnet link directly — WebTorrent supports web seeds and will download from the instance automatically.

### qBittorrent / Transmission / Other BitTorrent clients

1. Download the `.torrent` file from the torrent page
2. Open it in your client
3. The client will connect to the tracker and download from available sources

### Direct Download

```bash
# curl
curl -L -o filename "https://feditorrent.com/api/files/{infoHash}/{filename}"

# wget
wget "https://feditorrent.com/api/files/{infoHash}/{filename}"
```

## License

MIT
