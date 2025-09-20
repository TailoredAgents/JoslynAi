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
      const contentType = res.headers.get("content-type") || "";
      const rawText = await res.text().catch(() => "");

      if (!res.ok) {
        const preview = rawText ? `: ${rawText.slice(0, 200)}` : "";
        throw new Error(`Bootstrap failed (${res.status})${preview}`);
      }

      let data: any = null;
      try {
        data = contentType.includes("application/json") ? JSON.parse(rawText) : JSON.parse(rawText);
      } catch {
        const preview = rawText ? rawText.slice(0, 200) : "<empty body>";
        throw new Error(`Bootstrap returned non-JSON. Preview: ${preview}`);
      }

      // Accept { child } or a direct child object
      const parsed: any = data && typeof data === "object" ? (data.child || data) : null;
      if (!parsed || typeof parsed !== "object" || !parsed.id) {
        const preview = rawText ? rawText.slice(0, 200) : JSON.stringify(data).slice(0, 200);
        throw new Error(`Bootstrap missing child id. Preview: ${preview}`);
      }

      setChild(parsed as BootstrappedChild);
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
