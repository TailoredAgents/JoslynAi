"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8080";

export default function BriefPage() {
  const params = useParams<{ id: string }>();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const childId = "demo-child";

  useEffect(() => {
    async function run() {
      setLoading(true);
      try {
        const res = await fetch(`${API_BASE}/documents/${params.id}/brief?child_id=${childId}&lang=en`);
        const d = await res.json();
        setData(d);
      } finally {
        setLoading(false);
      }
    }
    run();
  }, [params?.id]);

  if (loading) return <div>Loading brief…</div>;
  if (!data) return <div>Brief not available.</div>;

  // Group citations by document_id
  const byDoc = new Map<string, { doc_name: string; cites: { page: number; quote: string }[] }>();
  for (const c of data.citations || []) {
    const key = c.document_id as string;
    const entry = byDoc.get(key) ?? { doc_name: c.doc_name || "Document", cites: [] as { page: number; quote: string }[] };
    if (!entry.cites.some((x) => x.page === Number(c.page) && x.quote === (c.quote || ""))) {
      entry.cites.push({ page: Number(c.page), quote: c.quote || "" });
    }
    byDoc.set(key, entry);
  }

  function buildQjson(cites: { page: number; quote: string }[]) {
    const trimmed = cites.slice(0, 12);
    try {
      // Prefer Buffer if available (SSR); fallback to btoa on client
      const anyGlobal: any = globalThis as any;
      if (anyGlobal.Buffer) return anyGlobal.Buffer.from(JSON.stringify(trimmed), "utf-8").toString("base64");
      return btoa(unescape(encodeURIComponent(JSON.stringify(trimmed))));
    } catch {
      return "";
    }
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">IEP Brief</h2>
      <p className="text-slate-700 whitespace-pre-wrap">{data.overview}</p>
      {Array.isArray(data.services) && data.services.length > 0 && (
        <div>
          <div className="font-medium">Services</div>
          <ul className="list-disc ml-5">
            {data.services.map((s: string, i: number) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </div>
      )}
      {Array.isArray(data.accommodations) && data.accommodations.length > 0 && (
        <div>
          <div className="font-medium">Accommodations</div>
          <ul className="list-disc ml-5">
            {data.accommodations.map((s: string, i: number) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Citations grouped by document */}
      {byDoc.size > 0 && (
        <section className="mt-6 space-y-4">
          <h2 className="font-medium text-lg">Citations</h2>
          {[...byDoc.entries()].map(([docId, { doc_name, cites }]) => {
            const qjson = buildQjson(cites);
            return (
              <div key={docId} className="border rounded p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="font-semibold">{doc_name}</div>
                  <Link
                    href={`/documents/${docId}/view?qjson=${encodeURIComponent(qjson)}`}
                    target="_blank"
                    className="text-sm text-blue-600 underline"
                  >
                    Open all highlights ({cites.length})
                  </Link>
                </div>
                <ul className="list-disc ml-5 space-y-1">
                  {cites.slice(0, 12).map((c, i) => (
                    <li key={`${c.page}-${i}`}>
                      <span className="text-gray-700">p.{c.page} — </span>
                      <span className="text-gray-600">
                        {c.quote?.slice(0, 140)}
                        {c.quote?.length > 140 ? "…" : ""}
                      </span>{" "}
                      <Link
                        href={`/documents/${docId}/view?page=${c.page}&q=${encodeURIComponent(c.quote || "")}`}
                        target="_blank"
                        className="text-blue-600 underline"
                      >
                        View
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </section>
      )}
    </div>
  );
}
