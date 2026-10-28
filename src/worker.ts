import type { MessageBatch } from "@cloudflare/workers-types";
import handler from "vinext/server/fetch-handler";
import { postToInboxSigned, validateOutboundUrl } from "@/lib/activitypub/federation";
import type { APDeliveryMessage } from "@/lib/activitypub/queue";
import { hexFromRawQuery, isValidInfoHashHex } from "@/lib/torrent/infohash";
export { TrackerDO } from "./tracker-do";

/** Permanent HTTP failure codes — don't retry, just ack. */
const PERMANENT_ERRORS = new Set([400, 403, 404, 410, 422]);

/** Workers Queues caps `retry({ delaySeconds })` at 12 hours. */
const MAX_RETRY_DELAY_SECONDS = 43_200;

interface Env {
  DB: D1Database;
  TORRENTS_KV: KVNamespace;
  FILES: R2Bucket;
  DELIVERY_QUEUE: Queue;
  TRACKER: DurableObjectNamespace;
  ASSETS: Fetcher;
  INSTANCE_URL: string;
}

/** `Retry-After` in seconds (both delta-seconds and HTTP-date forms). */
function parseRetryAfter(header: string | null): number | null {
  if (!header) return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(Math.ceil(seconds), MAX_RETRY_DELAY_SECONDS);
  }
  const date = Date.parse(header);
  if (Number.isFinite(date)) {
    return Math.max(0, Math.min(Math.ceil((date - Date.now()) / 1000), MAX_RETRY_DELAY_SECONDS));
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
      // 401 is often transient (clock skew, key rotation on the remote) — retry.
      permanent: PERMANENT_ERRORS.has(res.status),
      status: res.status,
      retryAfter: parseRetryAfter(res.headers.get("Retry-After")) ?? undefined,
    };
  } catch {
    return { ok: false, permanent: false, status: 0 };
  }
}

/** Bencode a tracker failure (BEP-3) with the correct string lengths. */
function bencodeFailure(reason: string): string {
  const reasonBytes = new TextEncoder().encode(reason).length;
  return `d14:failure reason${reasonBytes}:${reason}e`;
}

const TRACKER_CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "X-Content-Type-Options": "nosniff",
};

/**
 * A torrent is announce-authorized while its row exists in D1 (durable) or a
 * KV token is still alive (legacy/magnet-only flow). The KV-only gate used to
 * expire 30 minutes after upload while the R2 file lived forever.
 */
async function isTorrentAuthorized(env: Env, infoHashHex: string): Promise<boolean> {
  const row = await env.DB
    .prepare("SELECT 1 FROM torrents WHERE info_hash = ? LIMIT 1")
    .bind(infoHashHex)
    .first();
  if (row) return true;
  const kvEntry = await env.TORRENTS_KV.get(infoHashHex);
  return kvEntry !== null;
}

/** Strip characters that could break header values or escape the R2 key. */
function sanitizeFilenamePart(name: string): string {
  return (
    name
      .replace(/[\u0000-\u001f\u007f]/g, "")
      .replace(/[\\/]+/g, "_")
      .replace(/^\.+/, "_")
      .slice(0, 200) || "file"
  );
}

/** RFC 6266 filename* (UTF-8) encoding for Content-Disposition. */
function contentDisposition(filename: string): string {
  const safe = sanitizeFilenamePart(filename);
  const ascii = safe.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(safe)}`;
}

const FILE_SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  // User-uploaded content must never be able to run scripts same-origin.
  "Content-Security-Policy": "default-src 'none'; sandbox",
  "X-Frame-Options": "DENY",
  // WebTorrent webseeds fetch these files cross-origin from the browser.
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Expose-Headers": "Content-Length, Content-Range, Content-Disposition",
};

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // ── BitTorrent tracker (announce) ────────────────────────────────────
    // Browser clients (WebTorrent) open a WebSocket on the same announce URL;
    // native clients use plain HTTP GET. WebSocket traffic is routed to the
    // TrackerDO Durable Object that keeps the swarm state.
    if (url.pathname === "/api/tracker/announce") {
      const upgrade = request.headers.get("Upgrade")?.toLowerCase();
      const infoHashHex = hexFromRawQuery(url.search);

      if (upgrade === "websocket") {
        if (!isValidInfoHashHex(infoHashHex)) {
          return new Response(bencodeFailure("Missing or invalid info_hash"), {
            status: 400,
            headers: { "Content-Type": "text/plain", ...TRACKER_CORS_HEADERS },
          });
        }
        const stub = env.TRACKER.get(env.TRACKER.idFromName(infoHashHex));
        return stub.fetch(request);
      }

      if (!isValidInfoHashHex(infoHashHex)) {
        return new Response(bencodeFailure("Missing or invalid info_hash"), {
          status: 400,
          headers: { "Content-Type": "text/plain", ...TRACKER_CORS_HEADERS },
        });
      }
      if (!(await isTorrentAuthorized(env, infoHashHex))) {
        return new Response(bencodeFailure("Torrent not authorized"), {
          status: 403,
          headers: { "Content-Type": "text/plain", ...TRACKER_CORS_HEADERS },
        });
      }
      // HTTP announce: no peer list (web seeds are advertised via the magnet's
      // `ws=` parameter); P2P peering happens over the WebSocket tracker.
      return new Response(
        "d8:intervali1800e12:min intervali600e8:completei0e10:incompletei0e5:peers0:e",
        { headers: { "Content-Type": "text/plain", ...TRACKER_CORS_HEADERS } }
      );
    }

    // ── Direct file downloads from R2 (bypasses Next.js for streaming) ───
    const fileMatch = url.pathname.match(/^\/api\/files\/([^/]+)\/(.+)$/);
    if (fileMatch) {
      const infoHash = fileMatch[1];
      if (!isValidInfoHashHex(infoHash)) {
        return new Response("File not found", { status: 404, headers: FILE_SECURITY_HEADERS });
      }
      let filename: string;
      try {
        filename = decodeURIComponent(fileMatch[2]);
      } catch {
        return new Response("Bad request", { status: 400, headers: FILE_SECURITY_HEADERS });
      }
      const key = `torrents/${infoHash}/${filename}`;
      const obj = await env.FILES.get(key);
      if (!obj) {
        return new Response("File not found", { status: 404, headers: FILE_SECURITY_HEADERS });
      }
      const size = obj.size ?? 0;
      // User uploads are always downloads: `attachment` + nosniff + a locked-down
      // CSP prevents same-origin stored XSS via text/html or SVG uploads.
      const disposition = contentDisposition(filename);
      // Serve as opaque bytes regardless of what the uploader declared.
      const contentType = "application/octet-stream";
      const baseHeaders = { ...FILE_SECURITY_HEADERS, "Content-Disposition": disposition };
      const rangeHeader = request.headers.get("range");

      if (rangeHeader) {
        const m = rangeHeader.match(/^bytes=(\d*)-(\d*)$/);
        if (m && (m[1] || m[2])) {
          let start: number;
          let end: number;
          if (m[1]) {
            start = parseInt(m[1], 10);
            end = m[2] ? parseInt(m[2], 10) : size - 1;
          } else {
            // Suffix range: last N bytes.
            start = Math.max(0, size - parseInt(m[2], 10));
            end = size - 1;
          }
          if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= size) {
            return new Response(null, {
              status: 416,
              headers: { ...baseHeaders, "Content-Range": `bytes */${size}` },
            });
          }
          end = Math.min(end, size - 1);
          const chunk = await env.FILES.get(key, { range: { offset: start, length: end - start + 1 } });
          if (!chunk) {
            return new Response("File chunk not found", { status: 404, headers: baseHeaders });
          }
          return new Response(chunk.body, {
            status: 206,
            headers: {
              ...baseHeaders,
              "Content-Type": contentType,
              "Content-Range": `bytes ${start}-${end}/${size}`,
              "Content-Length": String(end - start + 1),
              "Accept-Ranges": "bytes",
            },
          });
        }
      }

      return new Response(obj.body, {
        headers: {
          ...baseHeaders,
          "Content-Type": contentType,
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
        else {
          message.retry({
            delaySeconds: Math.min(retryAfter ?? 60 * message.attempts, MAX_RETRY_DELAY_SECONDS),
          });
        }
      } catch {
        message.retry();
      }
    }
  },
};

export default worker;
