import { getCloudflareContext } from "@/lib/cf";
import { getActorByUsername, getTorrentsByActor } from "@/lib/db";
import { notFound } from "next/navigation";
import { FollowButton } from "@/components/FollowButton";
import { dicts, type Locale } from "@/lib/i18n/dict";
import { cookies } from "next/headers";

function formatSize(bytes: number, d: typeof dicts.en): string {
  if (bytes === 0) return "0 " + d.sizeUnits.bytes;
  const k = 1024;
  const sizes = [d.sizeUnits.bytes, d.sizeUnits.kb, d.sizeUnits.mb, d.sizeUnits.gb, d.sizeUnits.tb];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

export async function generateMetadata({ params }: { params: Promise<{ username: string }> }) {
  const { env } = getCloudflareContext();
  const { username } = await params;
  const domain = new URL(env.INSTANCE_URL).hostname;
  const actor = await getActorByUsername(env.DB, username, domain);
  if (!actor) return { title: "Not Found" };
  return {
    title: `${actor.displayName || actor.username} (@${actor.username}) — FediTorrent`,
    description: actor.summary ?? `Torrents by ${actor.username}`,
  };
}

export default async function UserProfile({ params }: { params: Promise<{ username: string }> }) {
  const { env } = getCloudflareContext();
  const { username } = await params;
  const domain = new URL(env.INSTANCE_URL).hostname;
  const actor = await getActorByUsername(env.DB, username, domain);
  if (!actor || !actor.isLocal) return notFound();

  const torrents = await getTorrentsByActor(env.DB, actor.id);

  const cookieStore = await cookies();
  const locale = ((await cookieStore).get("ft_locale")?.value || "en") as Locale;
  const d = dicts[locale];

  return (
    <div className="min-h-screen flex flex-col">
      <nav className="sticky top-0 z-50 backdrop-blur-xl bg-background/80 border-b border-border">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <a href="/" className="flex items-center gap-2.5 group">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-white font-bold text-sm group-hover:scale-105 transition-transform">F</div>
            <span className="font-semibold text-lg">FediTorrent</span>
          </a>
        </div>
      </nav>
      <main className="flex-1 max-w-4xl mx-auto px-4 py-12 w-full">
        <div className="bg-card border border-border rounded-2xl p-8 mb-8">
          <div className="flex items-start gap-6">
            <div className="w-20 h-20 rounded-full bg-primary/20 flex items-center justify-center text-3xl font-bold text-primary shrink-0">
              {(actor.displayName || actor.username)[0].toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-2xl font-bold">{actor.displayName || actor.username}</h1>
                <span className="text-sm text-muted">@{actor.username}@{domain}</span>
              </div>
              {actor.summary && <p className="text-muted mt-2 text-sm whitespace-pre-wrap">{actor.summary}</p>}
              <div className="flex items-center gap-6 mt-4 text-sm text-muted">
                <span><strong className="text-foreground">{torrents.length}</strong> {d.profile.torrents}</span>
                <span><strong className="text-foreground">{actor.followersCount}</strong> {d.profile.followers}</span>
                <span><strong className="text-foreground">{actor.followingCount}</strong> {d.profile.following}</span>
              </div>
              <div className="mt-4">
                <FollowButton targetId={actor.id} targetUsername={actor.username} />
              </div>
            </div>
          </div>
        </div>

        <h2 className="text-xl font-bold mb-4">{d.profile.torrents}</h2>
        {torrents.length === 0 ? (
          <div className="bg-card border border-border rounded-xl p-8 text-center">
            <p className="text-muted">{d.torrent.noTorrents}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {torrents.map((torrent) => (
              <div key={torrent.id} className="bg-card border border-border rounded-xl p-4 hover:bg-card-hover transition-colors">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-medium truncate">{torrent.name}</p>
                      {torrent.magnetOnly && <span className="text-xs px-2 py-0.5 rounded-full bg-secondary text-muted">{d.torrent.magnetOnly}</span>}
                    </div>
                    <p className="text-sm text-primary font-mono mt-1">{env.INSTANCE_URL}/torrents/{torrent.slug}</p>
                    {torrent.description && <p className="text-xs text-muted mt-1 truncate">{torrent.description}</p>}
                    <div className="flex items-center gap-3 mt-2 text-xs text-muted">
                      {torrent.size > 0 && <span>{formatSize(torrent.size, d)}</span>}
                      {torrent.fileCount > 0 && <span>{torrent.fileCount} {d.torrent.files}</span>}
                      <span>{torrent.clicks > 0 ? `${torrent.clicks} ${d.torrent.clicks}` : locale === "es" ? "Sin descargas" : "No downloads"}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <a href={torrent.magnetUri} className="px-3 py-1.5 rounded-lg bg-secondary text-sm text-muted hover:text-foreground transition-colors">🧲</a>
                    <a href={`/torrents/${torrent.slug}`} className="px-3 py-1.5 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary-hover transition-colors">View</a>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
