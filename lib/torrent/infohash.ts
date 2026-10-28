/**
 * info_hash parsing helpers shared by the worker's announce endpoint and the
 * tracker Durable Object.
 *
 * BitTorrent clients send `info_hash` in two forms:
 * - native clients (BEP-3 HTTP announce): the raw 20 bytes, percent-encoded
 *   in the query string (NOT valid UTF-8 — must be decoded byte by byte);
 * - browser clients (WebTorrent / bittorrent-tracker over WebSocket): the
 *   40-char lowercase hex string.
 */

/** Decode a raw query string (`?a=b&c=d`) value for `key` without UTF-8 corruption. */
export function rawQueryParam(search: string, key: string): string | null {
  const m = search.match(new RegExp(`[?&]${key}=([^&]*)`));
  return m ? m[1] : null;
}

/**
 * Extract the 40-char hex info_hash from a raw query string, accepting both
 * hex form and percent-encoded binary form. Returns "" when missing/invalid.
 */
export function hexFromRawQuery(search: string): string {
  const raw = rawQueryParam(search, "info_hash");
  if (raw === null || raw === "") return "";

  // Already hex (WebTorrent over WS)?
  if (/^[0-9a-fA-F]{40}$/.test(raw)) return raw.toLowerCase();

  // Percent-encoded raw bytes (native HTTP announce). '+' means space in
  // query strings, but a real 0x20 byte inside an info_hash must be sent as
  // %20, so treat '+' literally as 0x2b... except legacy clients that send
  // '+' for space; 0x20 in a SHA-1 is possible, so decode '+' as 0x20 too.
  let hex = "";
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (ch === "%" && i + 2 < raw.length) {
      const byte = raw.slice(i + 1, i + 3);
      if (!/^[0-9a-fA-F]{2}$/.test(byte)) return "";
      hex += byte.toLowerCase();
      i += 2;
    } else if (ch === "+") {
      hex += "20";
    } else {
      const code = raw.charCodeAt(i);
      if (code > 0xff) return ""; // not a byte value — malformed
      hex += code.toString(16).padStart(2, "0");
    }
  }
  if (hex.length !== 40) return "";
  return hex;
}

export function isValidInfoHashHex(value: string): value is string {
  return typeof value === "string" && /^[0-9a-f]{40}$/.test(value);
}
