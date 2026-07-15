"use client";

import { useState, useEffect } from "react";
import { useLocale } from "@/lib/i18n/client";

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
  const [locale, setLocale, d] = useLocale();

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
          <div className="flex items-center gap-3">
            <a href="/" className="text-sm text-muted hover:text-foreground transition-colors">{d.nav.home}</a>
            <button onClick={() => setLocale(locale === "en" ? "es" : "en")}
              className="px-3 py-1.5 rounded-lg bg-card border border-border text-sm font-medium text-muted hover:text-foreground transition-colors">
              {locale === "en" ? "ES" : "EN"}
            </button>
          </div>
        </div>
      </nav>

      <main className="flex-1 max-w-4xl mx-auto px-4 py-12 w-full">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold">{d.nav.myTorrents}</h1>
          <a href="/#create" className="px-5 py-2.5 rounded-xl bg-primary text-white text-sm font-medium hover:bg-primary-hover transition-colors">+ {d.torrent.create}</a>
        </div>

        {loading ? (
          <div className="bg-card border border-border rounded-xl p-8 text-center">
            <p className="text-muted">...</p>
          </div>
        ) : torrents.length === 0 ? (
          <div className="bg-card border border-border rounded-xl p-8 text-center">
            <p className="text-muted">{d.torrent.noTorrents}</p>
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
                      <span>{t.clicks > 0 ? `${t.clicks} ${d.torrent.clicks}` : `0 ${d.torrent.clicks}`}</span>
                      <span>{new Date(t.published).toLocaleDateString(locale === "es" ? "es-ES" : "en-US")}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <a href={t.magnetUri} className="px-3 py-1.5 rounded-lg bg-secondary text-sm text-muted hover:text-foreground transition-colors">🧲 {d.torrent.magnetLink}</a>
                    <button onClick={() => { navigator.clipboard.writeText(t.shortUrl); setCopied(t.id); setTimeout(() => setCopied(null), 2000); }}
                      className="px-4 py-1.5 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary-hover transition-colors">
                      {copied === t.id ? d.torrent.copied : d.torrent.copy}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
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
