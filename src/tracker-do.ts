export class TrackerDO {
  state: DurableObjectState;
  env: any;

  constructor(state: DurableObjectState, env: any) {
    this.state = state;
    this.env = env;
  }

  async fetch(request: Request) {
    const upgrade = request.headers.get("Upgrade");
    if (upgrade && upgrade.toLowerCase() === "websocket") {
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      this.state.acceptWebSocket(server);
      return new Response(null, { status: 101, webSocket: client });
    }

    if (new URL(request.url).pathname === "/announce") {
      return this.handleHttpAnnounce(request);
    }

    return new Response("Upgrade required", { status: 426 });
  }

  async webSocketMessage(ws: WebSocket, message: string) {
    let msg: any;
    try {
      msg = JSON.parse(message);
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

  webSocketClose(ws: WebSocket) {}
  webSocketError(ws: WebSocket) {}

  async handleAnnounce(ws: WebSocket, msg: any) {
    const infoHash = msg.info_hash;
    const peerId = msg.peer_id;

    if (!infoHash || !peerId) {
      ws.send(JSON.stringify({ failure_reason: "Missing info_hash or peer_id" }));
      return;
    }

    const infoHashHex = binaryToHex(infoHash);
    const kvEntry = await this.env.TORRENTS_KV.get(infoHashHex);
    if (!kvEntry) {
      ws.send(JSON.stringify({ failure_reason: "Torrent not authorized" }));
      ws.close(4403, "Torrent not authorized");
      return;
    }

    ws.serializeAttachment({ peerId, infoHash });

    const swarm = this.getSwarm(infoHash);
    const others = swarm.filter((w: WebSocket) => w !== ws);

    ws.send(JSON.stringify({
      action: "announce",
      info_hash: infoHash,
      interval: 30,
      complete: swarm.length,
      incomplete: swarm.length,
    }));

    const offers = Array.isArray(msg.offers) ? msg.offers : [];
    offers.forEach((offerObj: any, i: number) => {
      const target = others[i];
      if (!target) return;
      target.send(JSON.stringify({
        action: "announce",
        info_hash: infoHash,
        offer: offerObj.offer,
        offer_id: offerObj.offer_id,
        peer_id: peerId,
      }));
    });
  }

  forwardAnswer(ws: WebSocket, msg: any) {
    const toPeerId = msg.to_peer_id;
    const infoHash = msg.info_hash;
    if (!toPeerId || !infoHash) return;

    const senderAtt = ws.deserializeAttachment();

    for (const peerWs of this.state.getWebSockets()) {
      const att = peerWs.deserializeAttachment();
      if (att && att.infoHash === infoHash && att.peerId === toPeerId) {
        peerWs.send(JSON.stringify({
          action: "announce",
          info_hash: infoHash,
          answer: msg.answer,
          offer_id: msg.offer_id,
          peer_id: senderAtt?.peerId,
        }));
        break;
      }
    }
  }

  getSwarm(infoHash: string): WebSocket[] {
    return this.state.getWebSockets().filter((w: WebSocket) => {
      const att = w.deserializeAttachment();
      return att && att.infoHash === infoHash;
    });
  }

  async handleHttpAnnounce(request: Request) {
    const url = new URL(request.url);
    const infoHash = url.searchParams.get("info_hash");
    if (!infoHash) {
      return new Response("Missing info_hash", { status: 400 });
    }

    const infoHashHex = binaryToHex(infoHash);
    const kvEntry = await this.env.TORRENTS_KV.get(infoHashHex);
    if (!kvEntry) {
      return new Response(
        "d14:failure reason20:Torrent not authorizede",
        { status: 403, headers: { "Content-Type": "text/plain" } }
      );
    }

    const count = this.getSwarm(infoHash).length;
    return new Response(
      `d8:intervali30e12:min intervali10e8:completei${count}e10:incompletei${count}e5:peerslee`,
      { headers: { "Content-Type": "text/plain" } }
    );
  }
}

function binaryToHex(str: string): string {
  return Array.from(str).map((c: string) => c.charCodeAt(0).toString(16).padStart(2, "0")).join("");
}
