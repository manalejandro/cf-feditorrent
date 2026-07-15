"use client";

import { useState, useEffect } from "react";

interface Torrent {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  infoHash: string;
  magnetUri: string;
  size: number;
  fileCount: number;
  clicks: number;
  published: string;
  shortUrl: string;
}

export default function TorrentsPage() {
  const [torrents, setTorrents] = useState<Torrent[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    const token = localStorage.getItem("ft_token");
    if (!token) { setLoading(false); return; }
    fetch("/api/torrents", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((data) => { if (Array.isArray(data)) setTorrents(data); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

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

      <main className="flex-1 max-w-4xl mx-auto px-4 py-12 w-full">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold">My Torrents</h1>
          <a href="/#create" className="px-5 py-2.5 rounded-xl bg-primary text-white text-sm font-medium hover:bg-primary-hover transition-colors">+ New Torrent</a>
        </div>

        {loading ? (
          <div className="bg-card border border-border rounded-xl p-8 text-center">
            <p className="text-muted">Loading...</p>
          </div>
        ) : torrents.length === 0 ? (
          <div className="bg-card border border-border rounded-xl p-8 text-center">
            <p className="text-muted">No torrents yet. Share your first one!</p>
          </div>
        ) : (
          <div className="space-y-3">
            {torrents.map((t) => (
              <div key={t.id} className="bg-card border border-border rounded-xl p-5 hover:bg-card-hover transition-colors">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-lg">{t.name}</p>
                    <p className="text-sm text-primary font-mono mt-1">{t.shortUrl}</p>
                    {t.description && <p className="text-sm text-muted mt-1">{t.description}</p>}
                    <div className="flex items-center gap-4 mt-2 text-xs text-muted">
                      <span>{t.clicks} downloads</span>
                      <span>{new Date(t.published).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <a href={t.magnetUri} className="px-3 py-1.5 rounded-lg bg-secondary text-sm text-muted hover:text-foreground transition-colors">🧲 Magnet</a>
                    <button onClick={() => { navigator.clipboard.writeText(t.shortUrl); setCopied(t.id); setTimeout(() => setCopied(null), 2000); }}
                      className="px-4 py-1.5 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary-hover transition-colors">
                      {copied === t.id ? "Copied!" : "Copy"}
                    </button>
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
