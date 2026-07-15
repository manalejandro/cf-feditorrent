import { getCloudflareContext } from "@/lib/cf";

function hexFromRawQuery(param: string): string {
  let hex = "";
  for (let i = 0; i < param.length; i++) {
    if (param[i] === "%" && i + 2 < param.length) {
      hex += param.slice(i + 1, i + 3).toLowerCase();
      i += 2;
    } else {
      hex += param.charCodeAt(i).toString(16).padStart(2, "0");
    }
  }
  return hex;
}

export async function GET(request: Request) {
  const { env } = getCloudflareContext();
  const rawUrl = request.url;
  const m = rawUrl.match(/[?&]info_hash=([^&]+)/);

  if (!m) {
    return new Response(
      `Missing info_hash in query\nurl=${rawUrl}`,
      { status: 400, headers: { "Content-Type": "text/plain" } }
    );
  }

  const infoHashHex = hexFromRawQuery(m[1]);
  if (infoHashHex.length !== 40) {
    return new Response(
      `Invalid info_hash (${infoHashHex.length} hex chars)\nraw=${m[1]}\nhex=${infoHashHex}`,
      { status: 400, headers: { "Content-Type": "text/plain" } }
    );
  }

  const kvEntry = await env.TORRENTS_KV.get(infoHashHex);
  if (!kvEntry) {
    return new Response(
      `Torrent not authorized: ${infoHashHex}`,
      { status: 403, headers: { "Content-Type": "text/plain" } }
    );
  }

  return new Response("d8:intervali30e12:min intervali10e8:completei0e10:incompletei0e5:peers0:e", { headers: { "Content-Type": "text/plain" } });
}
