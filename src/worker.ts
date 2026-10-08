import type { MessageBatch } from "@cloudflare/workers-types";
import handler from "vinext/server/fetch-handler";
import { postToInboxSigned, validateOutboundUrl } from "@/lib/activitypub/federation";
import type { APDeliveryMessage } from "@/lib/activitypub/queue";
export { TrackerDO } from "./tracker-do";

/** Permanent HTTP failure codes — don't retry, just ack. */
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

/** `Retry-After` in seconds (both delta-seconds and HTTP-date forms). */
function parseRetryAfter(header: string | null): number | null {
  if (!header) return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(Math.ceil(seconds), 86_400);
  const date = Date.parse(header);
  if (Number.isFinite(date)) {
    return Math.max(0, Math.min(Math.ceil((date - Date.now()) / 1000), 86_400));
  }
  return null;
}

async function deliverOne(
  inboxUrl: string,
  activityJson: string,
  actorId: string,
  env: Env
): Promise<{ ok: boolean; permanent: boolean; status: number; retryAfter?: number }> {
  // SSRF guard: inbox URLs originate from remote actor documents / user input.
  const validation = validateOutboundUrl(inboxUrl);
  if (!validation.valid) {
    console.warn(`[worker] Blocked delivery to ${inboxUrl}: ${validation.reason}`);
    return { ok: false, permanent: true, status: 0 };
  }

  const row = await env.DB
    .prepare("SELECT private_key_pem FROM actors WHERE id = ? AND is_local = 1")
    .bind(actorId)
    .first<{ private_key_pem: string }>();
  if (!row?.private_key_pem) return { ok: false, permanent: true, status: 0 };

  const keyId = `${actorId}#main-key`;

  try {
    // Signed POST (safeFetch re-validates redirect hops and bounds the
    // timeout): draft-cavage first, retrying with RFC 9421 on 400/401.
    const res = await postToInboxSigned(inboxUrl, activityJson, keyId, row.private_key_pem, 15_000);
    if (!res) return { ok: false, permanent: true, status: 0 };
    await res.body?.cancel().catch(() => {});
    return {
      ok: res.ok,
      permanent: PERMANENT_ERRORS.has(res.status),
      status: res.status,
      retryAfter: parseRetryAfter(res.headers.get("Retry-After")) ?? undefined,
    };
  } catch {
    return { ok: false, permanent: false, status: 0 };
  }
}

function hexFromUrl(url: string): string {
  const m = url.match(/[?&]info_hash=([^&]+)/);
  if (!m) return "";
  const raw = m[1];
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

const worker = {
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

    return handler.fetch(request, env, ctx);
  },

  async queue(batch: MessageBatch<APDeliveryMessage>, env: Env): Promise<void> {
    for (const message of batch.messages) {
      const body = message.body;
      if (!body) { message.ack(); continue; }
      const { type, inboxUrl, activityJson, actorId } = body;
      if (type !== "delivery") { message.ack(); continue; }
      try {
        const { ok, permanent, retryAfter } = await deliverOne(inboxUrl, activityJson, actorId, env);
        if (ok || permanent) message.ack();
        else message.retry({ delaySeconds: retryAfter ?? Math.min(60 * message.attempts, 3600) });
      } catch {
        message.retry();
      }
    }
  },
};

export default worker;
