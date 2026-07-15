"use client";

import { useState, useEffect } from "react";

interface Notification {
  id: string;
  type: string;
  accountId: string;
  objectId: string | null;
  read: boolean;
  createdAt: string;
  actor: { id: string; username: string; displayName: string | null; avatarUrl: string | null } | null;
}

const typeLabels: Record<string, string> = {
  follow: "followed you",
  follow_accept: "accepted your follow request",
  follow_reject: "rejected your follow request",
};

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchNotifications = async () => {
    const token = localStorage.getItem("ft_token");
    if (!token) { setLoading(false); return; }
    try {
      const res = await fetch("/api/notifications", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setNotifications(Array.isArray(data) ? data : []);
    } catch { setNotifications([]); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchNotifications(); }, []);

  const markRead = async (id: string) => {
    const token = localStorage.getItem("ft_token");
    if (!token) return;
    try {
      await fetch(`/api/notifications/${id}/read`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, read: true } : n));
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
        <h1 className="text-3xl font-bold mb-6">Notifications</h1>

        {loading ? (
          <div className="bg-card border border-border rounded-xl p-8 text-center">
            <p className="text-muted">Loading...</p>
          </div>
        ) : notifications.length === 0 ? (
          <div className="bg-card border border-border rounded-xl p-8 text-center">
            <p className="text-muted">No notifications yet.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {notifications.map((n) => (
              <div key={n.id}
                onClick={() => !n.read && markRead(n.id)}
                className={`bg-card border rounded-xl p-4 transition-colors cursor-pointer hover:bg-card-hover ${n.read ? "border-border" : "border-primary/30"}`}>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary shrink-0">
                    {(n.actor?.displayName || n.actor?.username || "?")[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm">
                      <strong>{n.actor?.displayName || n.actor?.username || "Unknown"}</strong>{" "}
                      {typeLabels[n.type] || n.type}
                    </p>
                    <p className="text-xs text-muted mt-0.5">
                      {new Date(n.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  {!n.read && <span className="w-2 h-2 rounded-full bg-primary shrink-0" />}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
