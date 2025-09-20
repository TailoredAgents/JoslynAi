"use client";

import { useCallback, useEffect, useState } from "react";

type BootstrappedChild = {
  id: string;
  slug?: string | null;
  name?: string | null;
};

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "/api/joslyn";

export function useBootstrappedChild() {
  const [child, setChild] = useState<BootstrappedChild | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchChild = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/children/bootstrap`, {
        cache: "no-store",
        // Ensure cookies are sent for session-aware server routes
        credentials: "include",
        headers: { Accept: "application/json" },
      });
      if (!res.ok) {
        let detail = "";
        try { detail = await res.text(); } catch {}
        throw new Error(`Bootstrap failed (${res.status})${detail ? `: ${detail.slice(0,180)}` : ""}`);
      }
      const data = await res.json().catch(() => ({}));
      // Accept { child } or a direct child object for resilience
      const parsed: any = (data && typeof data === "object") ? (data.child || data) : null;
      setChild(parsed && typeof parsed === "object" && parsed.id ? parsed : null);
      setError(null);
    } catch (err: any) {
      setError(err?.message || "Unable to load child context");
      setChild(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchChild();
  }, [fetchChild]);

  return { child, loading, error, refresh: fetchChild };
}
