import { NextRequest } from "next/server";
import { getCloudflareContext, activityJson, json, notFound } from "@/lib/cf";
import { getTorrentBySlug, getActorById } from "@/lib/db";
import { incrementTorrentClicks } from "@/lib/db";

async function getActor(env: any, torrent: any) {
  try {
    return await getActorById(env.DB, torrent.actorId);
  } catch { return null; }
}

function renderTorrentPage(torrent: any, actor: any, baseUrl: string): string {
  const magnetUri = torrent.magnetUri || "";
  const size = torrent.size || 0;
  const sizeStr = size > 0
    ? size >= 1073741824 ? (size / 1073741824).toFixed(2) + " GB"
      : size >= 1048576 ? (size / 1048576).toFixed(2) + " MB"
        : size >= 1024 ? (size / 1024).toFixed(2) + " KB"
          : size + " B"
    : "Unknown";

  const actorName = actor?.username || "Unknown";
  const fileUrl = torrent.torrentFileUrl || torrent.fileUrl || (torrent.infoHash ? `${baseUrl}/api/files/${torrent.infoHash}/${encodeURIComponent(torrent.name)}` : "");
  const torrentFileUrl = torrent.torrentFileUrl || "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${escapeHtml(torrent.name)} - FediTorrent</title>
<meta name="description" content="${escapeHtml(torrent.description || torrent.name)}"/>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#0a0a0f;color:#e4e4e7;min-height:100vh;display:flex;flex-direction:column}
nav{position:sticky;top:0;z-index:50;backdrop-filter:blur(12px);background:rgba(10,10,15,.8);border-bottom:1px solid #27272a}
.nav-inner{max-width:1200px;margin:0 auto;padding:0 1rem;height:64px;display:flex;align-items:center;justify-content:space-between}
.logo{display:flex;align-items:center;gap:10px;text-decoration:none;color:#e4e4e7}
.logo-icon{width:32px;height:32px;border-radius:8px;background:#8b5cf6;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:14px}
.logo-text{font-weight:600;font-size:18px}
main{flex:1;max-width:720px;margin:0 auto;padding:2rem 1rem;width:100%}
.card{background:#18181b;border:1px solid #27272a;border-radius:16px;padding:2rem}
.header{display:flex;align-items:flex-start;justify-content:space-between;gap:1rem;flex-wrap:wrap}
.header h1{font-size:1.5rem;font-weight:700;line-height:1.3}
.actions{display:flex;gap:8px;flex-wrap:wrap}
.btn{display:inline-flex;align-items:center;gap:6px;padding:10px 16px;border-radius:8px;font-size:14px;font-weight:500;text-decoration:none;transition:all .2s;border:none;cursor:pointer}
.btn-primary{background:#8b5cf6;color:#fff}
.btn-primary:hover{background:#7c3aed}
.btn-secondary{background:#27272a;color:#e4e4e7}
.btn-secondary:hover{background:#3f3f46}
.desc{margin-top:1rem;color:#a1a1aa;line-height:1.6}
.meta{margin-top:1.5rem;display:grid;grid-template-columns:1fr 1fr;gap:1rem}
.meta-item{}
.meta-label{font-size:12px;color:#71717a}
.meta-value{font-size:14px;font-weight:500;margin-top:2px;word-break:break-all}
.meta-value.code{font-family:'SF Mono',Monaco,monospace;font-size:12px}
.download-box{margin-top:1.5rem;padding:1rem;border-radius:8px;background:rgba(139,92,246,.1);border:1px solid rgba(139,92,246,.2)}
.download-box p{font-size:14px;color:#a78bfa;font-weight:500;margin-bottom:4px}
.download-box a{font-size:13px;font-family:'SF Mono',Monaco,monospace;word-break:break-all;color:#8b5cf6;text-decoration:none}
.download-box a:hover{text-decoration:underline}
.back{margin-top:2rem;text-align:center}
.back a{color:#71717a;font-size:14px;text-decoration:none}
.back a:hover{color:#e4e4e7}
.commands{margin-top:1.5rem}
.commands summary{cursor:pointer;font-size:13px;color:#71717a;padding:8px;border-radius:6px;background:#27272a;list-style:none}
.commands summary:hover{color:#e4e4e7}
.commands pre{background:#18181b;border:1px solid #27272a;border-radius:8px;padding:12px;margin-top:8px;overflow-x:auto;font-size:12px;line-height:1.5}
.commands code{color:#a1a1aa}
.commands .hl{color:#a78bfa}
</style>
</head>
<body>
<nav><div class="nav-inner">
<a href="/" class="logo"><div class="logo-icon">F</div><span class="logo-text">FediTorrent</span></a>
</div></nav>
<main>
<div class="card">
<div class="header">
<h1>${escapeHtml(torrent.name)}</h1>
<div class="actions">
${torrentFileUrl ? `<a href="${escapeHtml(torrentFileUrl)}" class="btn btn-secondary">\u{1F4E5} .torrent</a>` : ""}
<a href="${escapeHtml(magnetUri)}" class="btn btn-primary">\u{1F9F2} Magnet</a>
</div>
</div>
${torrent.description ? `<p class="desc">${escapeHtml(torrent.description)}</p>` : ""}
<div class="meta">
<div class="meta-item">
<p class="meta-label">Posted by</p>
<p class="meta-value">${escapeHtml(actorName)}</p>
</div>
${torrent.infoHash ? `<div class="meta-item">
<p class="meta-label">Info Hash</p>
<p class="meta-value code">${escapeHtml(torrent.infoHash)}</p>
</div>` : ""}
<div class="meta-item">
<p class="meta-label">Size</p>
<p class="meta-value">${sizeStr}</p>
</div>
<div class="meta-item">
<p class="meta-label">Published</p>
<p class="meta-value">${new Date(torrent.published).toLocaleDateString("en-US", {year:"numeric",month:"short",day:"numeric"})}</p>
</div>
</div>
${!torrent.magnetOnly && fileUrl ? `<div class="download-box">
<p>Direct Download</p>
<a href="${escapeHtml(fileUrl)}">${escapeHtml(fileUrl)}</a>
</div>` : ""}
</div>

<details class="commands">
<summary>Download commands for popular clients</summary>
<pre><code><span class="hl"># aria2 (recommended)</span>
aria2c <span class="hl">"${escapeHtml(torrentFileUrl || fileUrl)}"</span>

<span class="hl"># curl</span>
curl -L -o "${escapeHtml(torrent.name)}" <span class="hl">"${escapeHtml(fileUrl)}"</span>

<span class="hl"># wget</span>
wget <span class="hl">"${escapeHtml(fileUrl)}"</span></code></pre>
</details>
</div>
<div class="back"><a href="/">Back to FediTorrent</a></div>
</main>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { env } = getCloudflareContext();
  const { slug } = await params;

  const torrent = await getTorrentBySlug(env.DB, slug);
  if (!torrent) return notFound("Torrent not found");

  const accept = request.headers.get("accept") ?? "";
  if (accept.includes("application/activity+json") || accept.includes("application/ld+json")) {
    const obj = torrent.objectId ? await env.DB.prepare("SELECT * FROM objects WHERE id = ?").bind(torrent.objectId).first() : null;
    if (obj && (obj as any).raw && (obj as any).raw !== "{}") {
      try {
        const parsed = JSON.parse((obj as any).raw);
        return activityJson(parsed);
      } catch {}
    }
  }

  incrementTorrentClicks(env.DB, torrent.id).catch(() => {});

  const actor = await getActorById(env.DB, torrent.actorId);

  // Browser visits get the HTML page directly
  if (accept.includes("text/html") || accept.includes("*/*")) {
    const baseUrl = env.INSTANCE_URL || `${request.nextUrl.protocol}//${request.nextUrl.host}`;
    return new Response(renderTorrentPage(torrent, actor, baseUrl), {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  // API/fetch requests get JSON
  return json({
    ...torrent,
    actorUsername: actor?.username ?? null,
    actorDomain: actor?.domain ?? null,
  });
}
