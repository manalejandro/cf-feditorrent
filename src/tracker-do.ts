/**
 * TrackerDO — WebSocket BitTorrent tracker (bittorrent-tracker protocol, the
 * one WebTorrent speaks). One Durable Object per info_hash keeps the swarm.
 *
 * Protocol notes:
 * - Messages are JSON (not bencode); bencode is only used by the HTTP announce
 *   handled in the worker.
 * - `info_hash` arrives as a 40-char hex string from browser clients; raw
 *   percent-encoded binary is also accepted for compatibility.
 * - `interval` is expressed in MILLISECONDS for the WS protocol (30s default in
 *   bittorrent-tracker); using seconds would make clients re-announce in a
 *   tight loop.
 * - WebRTC signaling: a peer sends N `offers`; the tracker forwards each one to
 *   a different random peer of the swarm, which replies with an `answer`
 *   addressed via `to_peer_id`.
 */

import { hexFromRawQuery, isValidInfoHashHex } from "@/lib/torrent/infohash";

interface TrackerEnv {
  DB: D1Database;
  TORRENTS_KV: KVNamespace;
}

interface TrackerMessage {
  action?: string;
  to_peer_id?: string | null;
  info_hash?: string;
  peer_id?: string;
  numwant?: number;
  offers?: { offer?: unknown; offer_id?: unknown }[];
  offer_id?: string;
  answer?: unknown;
  event?: string;
  [key: string]: unknown;
}

interface PeerAttachment {
  peerId: string;
  infoHash: string;
  /** Peers that sent WebRTC offers can seed to new peers. */
  seeder: boolean;
}

const ANNOUNCE_INTERVAL_MS = 30_000;
const MAX_OFFER_DISTRIBUTION = 10;

export class TrackerDO {
  state: DurableObjectState;
  env: TrackerEnv;

  constructor(state: DurableObjectState, env: TrackerEnv) {
    this.state = state;
    this.env = env;
  }

  async fetch(request: Request) {
    const url = new URL(request.url);
    const upgrade = request.headers.get("Upgrade");
    if (upgrade && upgrade.toLowerCase() === "websocket") {
      const infoHashHex = hexFromRawQuery(url.search);
      if (!isValidInfoHashHex(infoHashHex)) {
        return new Response("Missing or invalid info_hash", { status: 400 });
      }
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      this.state.acceptWebSocket(server, [infoHashHex]);
      server.serializeAttachment(null); // not announced yet
      return new Response(null, { status: 101, webSocket: client });
    }

    if (url.pathname.endsWith("/announce")) {
      return this.handleHttpAnnounce(request);
    }

    return new Response("Upgrade required", { status: 426 });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    if (typeof message !== "string") {
      ws.close(4400, "Binary frames not supported");
      return;
    }
    let msg: TrackerMessage;
    try {
      msg = JSON.parse(message) as TrackerMessage;
    } catch {
      ws.send(JSON.stringify({ failure_reason: "Invalid JSON" }));
      return;
    }

    if (msg.action !== "announce") return;

    if (msg.to_peer_id != null) {
      this.forwardAnswer(ws, msg);
    } else {
      await this.handleAnnounce(ws, msg);
    }
  }

  webSocketClose(_ws: WebSocket) {
    // Swarm membership is derived from live sockets (getWebSockets), so there is
    // nothing to clean up explicitly.
  }

  webSocketError(_ws: WebSocket) {}

  /** Durable authorization: torrent row in D1, or a live KV token. */
  private async isAuthorized(infoHashHex: string): Promise<boolean> {
    try {
      const row = await this.env.DB
        .prepare("SELECT 1 FROM torrents WHERE info_hash = ? LIMIT 1")
        .bind(infoHashHex)
        .first();
      if (row) return true;
    } catch { /* fall through to KV */ }
    const kvEntry = await this.env.TORRENTS_KV.get(infoHashHex);
    return kvEntry !== null;
  }

  async handleAnnounce(ws: WebSocket, msg: TrackerMessage) {
    const infoHashHex = normalizeInfoHash(msg.info_hash);
    const peerId = typeof msg.peer_id === "string" ? msg.peer_id : null;

    if (!infoHashHex || !peerId || peerId.length > 64) {
      ws.send(JSON.stringify({ failure_reason: "Missing info_hash or peer_id" }));
      return;
    }

    // Only peers that passed the announce gate may join the swarm; a socket
    // that already announced keeps its membership (attachment).
    const current = ws.deserializeAttachment() as PeerAttachment | null;
    if (!current) {
      if (!(await this.isAuthorized(infoHashHex))) {
        ws.send(JSON.stringify({ failure_reason: "Torrent not authorized" }));
        ws.close(4403, "Torrent not authorized");
        return;
      }
    } else if (current.infoHash !== infoHashHex) {
      ws.send(JSON.stringify({ failure_reason: "info_hash mismatch" }));
      return;
    }

    const offers = Array.isArray(msg.offers) ? msg.offers : [];
    const attachment: PeerAttachment = {
      peerId,
      infoHash: infoHashHex,
      seeder: current?.seeder || offers.length > 0,
    };
    ws.serializeAttachment(attachment);

    const swarm = this.getSwarm(infoHashHex);
    const others = swarm.filter((w: WebSocket) => w !== ws);
    const seeders = swarm.filter((w: WebSocket) => {
      const att = w.deserializeAttachment() as PeerAttachment | null;
      return att?.seeder === true;
    }).length;

    ws.send(JSON.stringify({
      action: "announce",
      info_hash: infoHashHex,
      interval: ANNOUNCE_INTERVAL_MS,
      complete: seeders,
      incomplete: Math.max(0, swarm.length - seeders),
    }));

    // Distribute offers to a random sample of peers (not always the first N,
    // which would starve late joiners), bounded by numwant.
    if (offers.length > 0 && others.length > 0) {
      const numwant = Number.isInteger(msg.numwant)
        ? Math.min(Math.max(msg.numwant as number, 1), MAX_OFFER_DISTRIBUTION)
        : MAX_OFFER_DISTRIBUTION;
      const targets = shuffled(others).slice(0, Math.min(numwant, offers.length));
      targets.forEach((target, i) => {
        const offerObj = offers[i];
        if (!offerObj) return;
        try {
          target.send(JSON.stringify({
            action: "announce",
            info_hash: infoHashHex,
            offer: offerObj.offer,
            offer_id: offerObj.offer_id,
            peer_id: peerId,
          }));
        } catch { /* peer vanished mid-send */ }
      });
    }
  }

  forwardAnswer(ws: WebSocket, msg: TrackerMessage) {
    const toPeerId = msg.to_peer_id;
    if (typeof toPeerId !== "string" || !msg.answer) return;

    // Only peers that completed an authorized announce may signal others.
    const senderAtt = ws.deserializeAttachment() as PeerAttachment | null;
    if (!senderAtt) return;

    const infoHashHex = normalizeInfoHash(msg.info_hash) ?? senderAtt.infoHash;

    for (const peerWs of this.getSwarm(infoHashHex)) {
      const att = peerWs.deserializeAttachment() as PeerAttachment | null;
      if (att && att.peerId === toPeerId) {
        try {
          peerWs.send(JSON.stringify({
            action: "announce",
            info_hash: infoHashHex,
            answer: msg.answer,
            offer_id: msg.offer_id,
            peer_id: senderAtt.peerId,
          }));
        } catch { /* peer vanished mid-send */ }
        break;
      }
    }
  }

  getSwarm(infoHash: string): WebSocket[] {
    return this.state.getWebSockets(infoHash).filter((w: WebSocket) => {
      const att = w.deserializeAttachment() as PeerAttachment | null;
      return att !== null && att.infoHash === infoHash;
    });
  }

  async handleHttpAnnounce(request: Request) {
    const url = new URL(request.url);
    // info_hash is raw binary percent-encoded — never decode it as UTF-8.
    const infoHashHex = hexFromRawQuery(url.search);
    if (!isValidInfoHashHex(infoHashHex)) {
      return bencodeResponse("d14:failure reason28:Missing or invalid info_hashe", 400);
    }

    if (!(await this.isAuthorized(infoHashHex))) {
      return bencodeResponse("d14:failure reason22:Torrent not authorizede", 403);
    }

    const swarm = this.getSwarm(infoHashHex);
    const seeders = swarm.filter((w: WebSocket) => {
      const att = w.deserializeAttachment() as PeerAttachment | null;
      return att?.seeder === true;
    }).length;
    const incomplete = Math.max(0, swarm.length - seeders);

    // BEP-3 HTTP announce: interval in seconds; empty compact peer list (P2P
    // peering happens over the WebSocket tracker).
    return bencodeResponse(
      `d8:intervali1800e12:min intervali600e8:completei${seeders}e10:incompletei${incomplete}e5:peers0:e`,
      200
    );
  }
}

function bencodeResponse(body: string, status: number): Response {
  return new Response(body, {
    status,
    headers: {
      "Content-Type": "text/plain",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

/**
 * Normalize an info_hash coming from a JSON message: browser clients send the
 * 40-char hex string; tolerate raw binary strings too.
 */
function normalizeInfoHash(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0) return null;
  if (/^[0-9a-fA-F]{40}$/.test(value)) return value.toLowerCase();
  if (value.length === 20) {
    let hex = "";
    for (let i = 0; i < value.length; i++) {
      const code = value.charCodeAt(i);
      if (code > 0xff) return null;
      hex += code.toString(16).padStart(2, "0");
    }
    return hex;
  }
  return null;
}

function shuffled<T>(arr: T[]): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
