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
      const res = await fetch(`${API_BASE}/children/bootstrap`, { cache: "no-store" });
      if (!res.ok) {
        throw new Error(`Bootstrap failed with status ${res.status}`);
      }
      const data = await res.json();
      setChild(data?.child ?? null);
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
