"use client";

import { useState } from "react";

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

  const search = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setSearched(true);
    try {
      const token = localStorage.getItem("ft_token");
      const res = await fetch(`/api/v1/accounts/search?q=${encodeURIComponent(query)}&limit=20`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json();
      setResults(Array.isArray(data) ? data : []);
    } catch { setResults([]); }
    finally { setLoading(false); }
  };

  const handleFollow = async (targetId: string) => {
    const token = localStorage.getItem("ft_token");
    if (!token) return;
    try {
      await fetch("/api/follow", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ targetId }),
      });
    } catch { /* ignore */ }
  };

  return (
    <div className="min-h-screen flex flex-col">
      <nav className="sticky top-0 z-50 backdrop-blur-xl bg-background/80 border-b border-border">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <a href="/" className="flex items-center gap-2.5 group">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-white font-bold text-sm group-hover:scale-105 transition-transform">F</div>
            <span className="font-semibold text-lg">FediTorrent</span>
          </a>
          <a href="/" className="text-sm text-muted hover:text-foreground transition-colors">Home</a>
        </div>
      </nav>

      <main className="flex-1 max-w-2xl mx-auto px-4 py-12 w-full">
        <h1 className="text-3xl font-bold mb-6">Find People</h1>

        <div className="flex gap-3 mb-8">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && search()}
            placeholder="Search by username or @user@domain"
            className="flex-1 px-4 py-2.5 rounded-xl bg-secondary border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-colors"
          />
          <button onClick={search} disabled={loading}
            className="px-6 py-2.5 rounded-xl bg-primary text-white font-medium hover:bg-primary-hover transition-colors disabled:opacity-50">
            {loading ? "..." : "Search"}
          </button>
        </div>

        {searched && results.length === 0 && (
          <div className="bg-card border border-border rounded-xl p-8 text-center">
            <p className="text-muted">No results found.</p>
          </div>
        )}

        <div className="space-y-3">
          {results.map((actor) => (
            <div key={actor.id} className="bg-card border border-border rounded-xl p-4 hover:bg-card-hover transition-colors">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-sm font-bold text-primary shrink-0">
                    {(actor.displayName || actor.username)[0].toUpperCase()}
                  </div>
                  <div>
                    <p className="font-medium">{actor.displayName || actor.username}</p>
                    <p className="text-sm text-muted">@{actor.username}@{actor.domain}</p>
                    <p className="text-xs text-muted mt-0.5">{actor.torrentsCount} torrents · {actor.followersCount} followers</p>
                  </div>
                </div>
                <button onClick={() => handleFollow(actor.id)}
                  className="px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary-hover transition-colors">
                  Follow
                </button>
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
