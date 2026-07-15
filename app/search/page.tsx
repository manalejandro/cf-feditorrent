"use client";

import { useState } from "react";
import { useLocale } from "@/lib/i18n/client";

interface ActorResult {
  id: string;
  username: string;
  domain: string;
  displayName: string | null;
  avatarUrl: string | null;
  isLocal: boolean;
  followersCount: number;
  followingCount: number;
  torrentsCount: number;
}

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ActorResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [following, setFollowing] = useState<Record<string, boolean>>({});
  const [followLoading, setFollowLoading] = useState<Record<string, boolean>>({});
  const [locale, setLocale, d] = useLocale();

  const checkFollowState = async (actorId: string, token: string) => {
    try {
      const res = await fetch(`/api/follow?targetId=${encodeURIComponent(actorId)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data: any = await res.json();
      if (data.following) {
        setFollowing((prev) => ({ ...prev, [actorId]: true }));
      }
    } catch { /* ignore */ }
  };

  const search = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setSearched(true);
    setFollowing({});
    try {
      const token = localStorage.getItem("ft_token");
      const res = await fetch(`/api/v1/accounts/search?q=${encodeURIComponent(query)}&limit=20`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json();
      const actors = Array.isArray(data) ? data : [];
      setResults(actors);
      if (token) {
        for (const actor of actors) {
          checkFollowState(actor.id, token);
        }
      }
    } catch { setResults([]); }
    finally { setLoading(false); }
  };

  const handleFollow = async (targetId: string) => {
    const token = localStorage.getItem("ft_token");
    if (!token) return;
    setFollowLoading((prev) => ({ ...prev, [targetId]: true }));
    try {
      const res = await fetch("/api/follow", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ targetId }),
      });
      const data: any = await res.json();
      if (data.following === true || data.message === "Already following") {
        setFollowing((prev) => ({ ...prev, [targetId]: true }));
      }
    } catch { /* ignore */ }
    finally { setFollowLoading((prev) => ({ ...prev, [targetId]: false })); }
  };

  const handleUnfollow = async (targetId: string) => {
    const token = localStorage.getItem("ft_token");
    if (!token) return;
    setFollowLoading((prev) => ({ ...prev, [targetId]: true }));
    try {
      const res = await fetch("/api/unfollow", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ targetId }),
      });
      if (res.ok) {
        setFollowing((prev) => ({ ...prev, [targetId]: false }));
      }
    } catch { /* ignore */ }
    finally { setFollowLoading((prev) => ({ ...prev, [targetId]: false })); }
  };

  return (
    <div className="min-h-screen flex flex-col">
      <nav className="sticky top-0 z-50 backdrop-blur-xl bg-background/80 border-b border-border">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <a href="/" className="flex items-center gap-2.5 group">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-white font-bold text-sm group-hover:scale-105 transition-transform">F</div>
            <span className="font-semibold text-lg">FediTorrent</span>
          </a>
          <div className="flex items-center gap-3">
            <a href="/" className="text-sm text-muted hover:text-foreground transition-colors">{d.nav.home}</a>
            <button onClick={() => setLocale(locale === "en" ? "es" : "en")}
              className="px-3 py-1.5 rounded-lg bg-card border border-border text-sm font-medium text-muted hover:text-foreground transition-colors">
              {locale === "en" ? "ES" : "EN"}
            </button>
          </div>
        </div>
      </nav>

      <main className="flex-1 max-w-2xl mx-auto px-4 py-12 w-full">
        <h1 className="text-3xl font-bold mb-6">{locale === "es" ? "Buscar Personas" : "Find People"}</h1>

        <div className="flex gap-3 mb-8">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && search()}
            placeholder={locale === "es" ? "Busca por usuario o @user@dominio" : "Search by username or @user@domain"}
            className="flex-1 px-4 py-2.5 rounded-xl bg-secondary border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-colors"
          />
          <button onClick={search} disabled={loading}
            className="px-6 py-2.5 rounded-xl bg-primary text-white font-medium hover:bg-primary-hover transition-colors disabled:opacity-50">
            {loading ? "..." : locale === "es" ? "Buscar" : "Search"}
          </button>
        </div>

        {searched && results.length === 0 && (
          <div className="bg-card border border-border rounded-xl p-8 text-center">
            <p className="text-muted">{locale === "es" ? "Sin resultados." : "No results found."}</p>
          </div>
        )}

        <div className="space-y-3">
          {results.map((actor) => {
            const isFollowing = following[actor.id] ?? false;
            const isLoading = followLoading[actor.id] ?? false;
            return (
              <div key={actor.id} className="bg-card border border-border rounded-xl p-4 hover:bg-card-hover transition-colors">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-sm font-bold text-primary shrink-0">
                      {(actor.displayName || actor.username)[0].toUpperCase()}
                    </div>
                    <div>
                      <p className="font-medium">{actor.displayName || actor.username}</p>
                      <p className="text-sm text-muted">@{actor.username}@{actor.domain}</p>
                      <p className="text-xs text-muted mt-0.5">
                        {actor.torrentsCount} {locale === "es" ? "torrents" : "torrents"} · {actor.followersCount} {d.profile.followers.toLowerCase()}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => isFollowing ? handleUnfollow(actor.id) : handleFollow(actor.id)}
                    disabled={isLoading}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 ${
                      isFollowing
                        ? "bg-secondary text-muted border border-border"
                        : "bg-primary text-white hover:bg-primary-hover"
                    }`}>
                    {isLoading ? "..." : isFollowing
                      ? (locale === "es" ? "Siguiendo" : "Following")
                      : (locale === "es" ? "Seguir" : "Follow")}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </main>

      <footer className="border-t border-border py-8">
        <div className="max-w-6xl mx-auto px-4 flex items-center justify-center">
          <button onClick={() => setLocale(locale === "en" ? "es" : "en")} className="text-sm text-muted hover:text-foreground transition-colors">
            {locale === "en" ? "Español" : "English"}
          </button>
        </div>
      </footer>
    </div>
  );
}
