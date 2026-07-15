import { signRequest } from "@/lib/activitypub/security";
export { TrackerDO } from "./tracker-do";

const AP_CONTENT_TYPE = "application/activity+json";
const AP_ACCEPT = 'application/activity+json, application/ld+json; profile="https://www.w3.org/ns/activitystreams"';
const PERMANENT_ERRORS = new Set([400, 401, 403, 404, 410, 422]);

interface Env {
  DB: D1Database;
  TORRENTS_KV: KVNamespace;
  FILES: R2Bucket;
  DELIVERY_QUEUE: Queue;
  TRACKER: DurableObjectNamespace;
  ASSETS: Fetcher;
  INSTANCE_URL: string;
  SECRET_KEY: string;
}

interface APDeliveryMessage {
  type: "delivery";
  inboxUrl: string;
  activityJson: string;
  actorId: string;
}

async function deliverOne(
  inboxUrl: string,
  activityJson: string,
  actorId: string,
  env: Env
): Promise<{ ok: boolean; permanent: boolean }> {
  const row = await (env.DB as any).prepare("SELECT private_key_pem FROM actors WHERE id = ? AND is_local = 1").bind(actorId).first() as { private_key_pem: string } | null;
  if (!row?.private_key_pem) return { ok: false, permanent: true };

  const keyId = `${actorId}#main-key`;
  const headers = await signRequest("POST", inboxUrl, activityJson, row.private_key_pem, keyId);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);

  try {
    const res = await fetch(inboxUrl, {
      method: "POST",
      headers: { "Content-Type": AP_CONTENT_TYPE, Accept: AP_ACCEPT, ...headers },
      body: activityJson,
      signal: controller.signal,
    });
    clearTimeout(timer);
    return { ok: res.ok, permanent: PERMANENT_ERRORS.has(res.status) };
  } catch {
    clearTimeout(timer);
    return { ok: false, permanent: false };
  }
}

function hexFromUrl(url: string): string {
  let m = url.match(/[?&]info_hash=([^&]+)/);
  if (!m) return "";
  let raw = m[1];
  let hex = "";
  for (let i = 0; i < raw.length; i++) {
    if (raw[i] === "%" && i + 2 < raw.length) {
      hex += raw.slice(i + 1, i + 3).toLowerCase();
      i += 2;
    } else {
      hex += raw.charCodeAt(i).toString(16).padStart(2, "0");
    }
  }
  if (hex.length !== 40) return "";
  return hex;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/api/tracker/announce") {
      const infoHashHex = hexFromUrl(request.url);
      if (!infoHashHex) {
        return new Response("d14:failure reason32:Missing or invalid info_hashe", { status: 400, headers: { "Content-Type": "text/plain" } });
      }
      const kvEntry = await env.TORRENTS_KV.get(infoHashHex);
      if (!kvEntry) {
        return new Response("d14:failure reason22:Torrent not authorizede", { status: 403, headers: { "Content-Type": "text/plain" } });
      }
      return new Response("d8:intervali30e12:min intervali10e8:completei0e10:incompletei0e5:peers0:e", { headers: { "Content-Type": "text/plain" } });
    }
    // Serve files directly from R2 (bypasses Next.js for large file streaming)
    const fileMatch = url.pathname.match(/^\/api\/files\/([^\/]+)\/(.+)$/);
    if (fileMatch) {
      const infoHash = fileMatch[1];
      const filename = decodeURIComponent(fileMatch[2]);
      const obj = await env.FILES.get(`torrents/${infoHash}/${filename}`);
      if (!obj) {
        return new Response("File not found", { status: 404 });
      }
      const size = obj.size ?? 0;
      const rangeHeader = request.headers.get("range");

      if (rangeHeader) {
        const m = rangeHeader.match(/bytes=(\d+)-(\d*)/);
        if (m) {
          const start = parseInt(m[1]);
          const end = m[2] ? parseInt(m[2]) : size - 1;
          if (start >= size || end >= size) {
            return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
          }
          const chunk = await env.FILES.get(`torrents/${infoHash}/${filename}`, { range: { offset: start, length: end - start + 1 } });
          if (!chunk) {
            return new Response("File chunk not found", { status: 404 });
          }
          return new Response(chunk.body, {
            status: 206,
            headers: {
              "Content-Type": obj.httpMetadata?.contentType || "application/octet-stream",
              "Content-Range": `bytes ${start}-${end}/${size}`,
              "Content-Length": String(end - start + 1),
              "Accept-Ranges": "bytes",
            },
          });
        }
      }

      return new Response(obj.body, {
        headers: {
          "Content-Type": obj.httpMetadata?.contentType || "application/octet-stream",
          "Content-Length": String(size),
          "Accept-Ranges": "bytes",
        },
      });
    }

    const handler = (await import("../.open-next/worker.js")) as any;
    return handler.default.fetch(request, env, ctx);
  },

  async queue(batch: { messages: { body: APDeliveryMessage; ack: () => void; retry: () => void }[] }, env: Env): Promise<void> {
    for (const message of batch.messages) {
      if (!message.body) { message.ack(); continue; }
      const { type, inboxUrl, activityJson, actorId } = message.body;
      if (type !== "delivery") { message.ack(); continue; }
      try {
        const { ok, permanent } = await deliverOne(inboxUrl, activityJson, actorId, env);
        if (ok || permanent) message.ack();
        else message.retry();
      } catch { message.retry(); }
    }
  },
};
