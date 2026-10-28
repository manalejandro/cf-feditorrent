export type Bencoded = number | string | Uint8Array | Bencoded[] | { [key: string]: Bencoded };

const enc = new TextEncoder();
const dec = new TextDecoder();

/** Cap recursion: hostile files with deep nesting must not blow the stack. */
const MAX_DEPTH = 32;

export function bencodeParse(data: Uint8Array, offset = 0): { val: Bencoded; end: number } {
  return parseAt(data, offset, 0);
}

function parseAt(data: Uint8Array, offset: number, depth: number): { val: Bencoded; end: number } {
  if (depth > MAX_DEPTH) throw new Error("Bencode nesting too deep at " + offset);
  if (offset < 0 || offset >= data.length) throw new Error("Truncated bencode at " + offset);
  const b = data[offset];

  // Integer: i<number>e
  if (b === 0x69) {
    let end = offset + 1;
    while (end < data.length && data[end] !== 0x65) end++;
    if (end >= data.length) throw new Error("Unterminated integer at " + offset);
    const body = dec.decode(data.subarray(offset + 1, end));
    // Strict canonical integer: optional '-', then digits; no garbage.
    if (!/^-?(?:0|[1-9][0-9]*)$/.test(body)) {
      throw new Error("Invalid integer '" + body + "' at " + offset);
    }
    const val = Number(body);
    if (!Number.isSafeInteger(val)) throw new Error("Integer out of range at " + offset);
    return { val, end: end + 1 };
  }

  // String: <length>:<bytes>
  if (b >= 0x30 && b <= 0x39) {
    let colon = offset;
    while (colon < data.length && data[colon] !== 0x3a) colon++;
    if (colon >= data.length) throw new Error("Unterminated string length at " + offset);
    const lenBody = dec.decode(data.subarray(offset, colon));
    if (!/^[0-9]+$/.test(lenBody)) throw new Error("Invalid string length at " + offset);
    const len = Number(lenBody);
    if (!Number.isSafeInteger(len) || len < 0) throw new Error("String length out of range at " + offset);
    const start = colon + 1;
    const end = start + len;
    if (end > data.length) throw new Error("Truncated string at " + offset);
    return { val: data.slice(start, end), end };
  }

  // List: l<items>e
  if (b === 0x6c) {
    let pos = offset + 1;
    const arr: Bencoded[] = [];
    while (pos < data.length && data[pos] !== 0x65) {
      const r = parseAt(data, pos, depth + 1);
      arr.push(r.val);
      pos = r.end;
    }
    if (pos >= data.length) throw new Error("Unterminated list at " + offset);
    return { val: arr, end: pos + 1 };
  }

  // Dictionary: d<key><value>...e
  if (b === 0x64) {
    let pos = offset + 1;
    const dict: Record<string, Bencoded> = {};
    while (pos < data.length && data[pos] !== 0x65) {
      const k = parseAt(data, pos, depth + 1);
      if (!(k.val instanceof Uint8Array)) throw new Error("Non-string dict key at " + pos);
      const v = parseAt(data, k.end, depth + 1);
      dict[dec.decode(k.val)] = v.val;
      pos = v.end;
    }
    if (pos >= data.length) throw new Error("Unterminated dict at " + offset);
    return { val: dict, end: pos + 1 };
  }

  throw new Error("Invalid bencode at " + offset);
}

function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

export function bencodeEncode(val: Bencoded): Uint8Array {
  const c = (v: Bencoded) => bencodeEncode(v);
  if (typeof val === "number") {
    if (!Number.isSafeInteger(val)) throw new Error("Cannot encode non-integer number");
    return enc.encode("i" + val + "e");
  }
  if (val instanceof Uint8Array) {
    return concat([enc.encode(val.length + ":"), val]);
  }
  if (typeof val === "string") {
    const bytes = enc.encode(val);
    return concat([enc.encode(bytes.length + ":"), bytes]);
  }
  if (Array.isArray(val)) {
    const parts: Uint8Array[] = [enc.encode("l")];
    for (const v of val) parts.push(c(v));
    parts.push(enc.encode("e"));
    return concat(parts);
  }
  if (typeof val === "object" && val !== null) {
    // Bencode requires keys sorted by RAW BYTE order (not JS UTF-16 order):
    // encode the keys first and sort the byte representations.
    const entries = Object.keys(val).map((k) => ({ key: k, bytes: enc.encode(k) }));
    entries.sort((a, b) => {
      const len = Math.min(a.bytes.length, b.bytes.length);
      for (let i = 0; i < len; i++) {
        if (a.bytes[i] !== b.bytes[i]) return a.bytes[i] - b.bytes[i];
      }
      return a.bytes.length - b.bytes.length;
    });
    const parts: Uint8Array[] = [enc.encode("d")];
    for (const e of entries) {
      parts.push(concat([enc.encode(e.bytes.length + ":"), e.bytes]));
      parts.push(c(val[e.key]));
    }
    parts.push(enc.encode("e"));
    return concat(parts);
  }
  throw new Error("Cannot encode: " + typeof val);
}
