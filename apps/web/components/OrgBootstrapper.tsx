'use client';

import { useEffect, useRef } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "/api/joslyn";

export default function OrgBootstrapper() {
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    const controller = new AbortController();

    async function bootstrapOrg() {
      try {
        const res = await fetch(`${API_BASE}/orgs/bootstrap`, {
          method: "POST",
          signal: controller.signal,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
        if (!res.ok && res.status !== 401) {
          console.warn("[org-bootstrap] bootstrap request failed", res.status);
        }
      } catch (err) {
        if ((err as any)?.name !== "AbortError") {
          console.warn("[org-bootstrap] bootstrap request failed", err);
        }
      }
    }

    bootstrapOrg();
    return () => controller.abort();
  }, []);

  return null;
}
