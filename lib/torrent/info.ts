import { bencodeEncode } from "./bencode";

const PIECE_LENGTH = 1_048_576; // 1MB

async function sha1Bytes(data: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-1", data as any));
}

export async function computeTorrentInfo(
  fileData: Uint8Array,
  filename: string
): Promise<{ infoHash: string; pieces: Uint8Array; pieceLength: number }> {
  const pieceHashes: Uint8Array[] = [];
  for (let offset = 0; offset < fileData.length; offset += PIECE_LENGTH) {
    const piece = fileData.slice(offset, offset + PIECE_LENGTH);
    pieceHashes.push(await sha1Bytes(piece));
  }
  const pieces = new Uint8Array(pieceHashes.length * 20);
  for (let i = 0; i < pieceHashes.length; i++) {
    pieces.set(pieceHashes[i], i * 20);
  }
  const infoDict: Record<string, any> = {
    name: filename,
    length: fileData.length,
    "piece length": PIECE_LENGTH,
    pieces,
  };
  const infoBencoded = bencodeEncode(infoDict);
  const infoHashBytes = await sha1Bytes(infoBencoded);
  const infoHash = Array.from(infoHashBytes).map((b) => b.toString(16).padStart(2, "0")).join("");
  return { infoHash, pieces, pieceLength: PIECE_LENGTH };
}

export function buildMagnetUri(infoHash: string, name: string, trackerUrl?: string, webseedUrl?: string): string {
  let uri = `magnet:?xt=urn:btih:${infoHash}&dn=${encodeURIComponent(name)}`;
  if (trackerUrl) uri += `&tr=${encodeURIComponent(trackerUrl)}`;
  if (webseedUrl) uri += `&ws=${encodeURIComponent(webseedUrl)}`;
  return uri;
}

export function buildTorrentFile(
  announceUrl: string,
  fileUrl: string,
  fileData: Uint8Array,
  filename: string,
  pieces: Uint8Array,
  pieceLength: number
): Uint8Array {
  const torrent: Record<string, any> = {
    announce: announceUrl,
    "url-list": [fileUrl],
    info: {
      name: filename,
      length: fileData.length,
      "piece length": pieceLength,
      pieces,
    },
  };
  return bencodeEncode(torrent);
}
