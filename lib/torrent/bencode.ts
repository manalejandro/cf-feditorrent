const enc = new TextEncoder();
const dec = new TextDecoder();

export function bencodeParse(data: Uint8Array, offset = 0): { val: any; end: number } {
  const b = data[offset];
  if (b === 0x69) {
    let end = offset + 1;
    while (data[end] !== 0x65) end++;
    return { val: parseInt(dec.decode(data.slice(offset + 1, end))), end: end + 1 };
  }
  if (b >= 0x30 && b <= 0x39) {
    let colon = offset;
    while (data[colon] !== 0x3a) colon++;
    const len = parseInt(dec.decode(data.slice(offset, colon)));
    const start = colon + 1;
    return { val: data.slice(start, start + len), end: start + len };
  }
  if (b === 0x6c) {
    let pos = offset + 1; const arr: any[] = [];
    while (data[pos] !== 0x65) { const r = bencodeParse(data, pos); arr.push(r.val); pos = r.end; }
    return { val: arr, end: pos + 1 };
  }
  if (b === 0x64) {
    let pos = offset + 1; const dict: Record<string, any> = {};
    while (data[pos] !== 0x65) {
      const k = bencodeParse(data, pos); const v = bencodeParse(data, k.end);
      dict[dec.decode(k.val as Uint8Array)] = v.val; pos = v.end;
    }
    return { val: dict, end: pos + 1 };
  }
  throw new Error("Invalid bencode at " + offset);
}

export function bencodeEncode(val: any): Uint8Array {
  const c = (v: any) => bencodeEncode(v) as any;
  if (typeof val === "number") return enc.encode("i" + val + "e");
  if (val instanceof Uint8Array) {
    const prefix = enc.encode(val.length + ":");
    const out = new Uint8Array(prefix.length + val.length);
    out.set(prefix); out.set(val, prefix.length);
    return out;
  }
  if (typeof val === "string") {
    const bytes = enc.encode(val);
    const prefix = enc.encode(bytes.length + ":");
    const out = new Uint8Array(prefix.length + bytes.length);
    out.set(prefix); out.set(bytes, prefix.length);
    return out;
  }
  if (Array.isArray(val)) {
    const parts = [enc.encode("l")];
    for (const v of val) parts.push(c(v));
    parts.push(enc.encode("e"));
    const total = parts.reduce((s, p) => s + p.length, 0);
    const out = new Uint8Array(total); let off = 0;
    for (const p of parts) { out.set(p, off); off += p.length; }
    return out;
  }
  if (typeof val === "object" && val !== null) {
    const keys = Object.keys(val).sort();
    const parts = [enc.encode("d")];
    for (const k of keys) { parts.push(c(k)); parts.push(c(val[k])); }
    parts.push(enc.encode("e"));
    const total = parts.reduce((s, p) => s + p.length, 0);
    const out = new Uint8Array(total); let off = 0;
    for (const p of parts) { out.set(p, off); off += p.length; }
    return out;
  }
  throw new Error("Cannot encode: " + typeof val);
}
