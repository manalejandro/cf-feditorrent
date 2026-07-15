"use client";

import { useState, useEffect } from "react";

export function FollowButton({ targetId, targetUsername }: { targetId: string; targetUsername: string }) {
  const [following, setFollowing] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const username = localStorage.getItem("ft_username");
    if (username === targetUsername) setFollowing(false);
  }, [targetUsername]);

  const toggle = async () => {
    setLoading(true);
    const token = localStorage.getItem("ft_token");
    if (!token) return;
    try {
      const endpoint = following ? "/api/unfollow" : "/api/follow";
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ targetId }),
      });
      if (res.ok) setFollowing(!following);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  };

  const username = typeof window !== "undefined" ? localStorage.getItem("ft_username") : null;
  if (username === targetUsername) return null;

  return (
    <button
      onClick={toggle}
      disabled={loading}
      className={`px-5 py-2 rounded-xl text-sm font-medium transition-all ${
        following
          ? "bg-secondary text-muted border border-border hover:border-error hover:text-error hover:bg-error/5"
          : "bg-primary text-white hover:bg-primary-hover"
      } disabled:opacity-50`}
    >
      {loading ? "..." : following ? "Following" : "Follow"}
    </button>
  );
}
