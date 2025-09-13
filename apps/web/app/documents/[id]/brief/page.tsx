"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

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

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">IEP Brief</h2>
      <p className="text-slate-700 whitespace-pre-wrap">{data.overview}</p>
      {Array.isArray(data.services) && data.services.length > 0 && (
        <div>
          <div className="font-medium">Services</div>
          <ul className="list-disc ml-5">
            {data.services.map((s: string, i: number) => <li key={i}>{s}</li>)}
          </ul>
        </div>
      )}
      {Array.isArray(data.accommodations) && data.accommodations.length > 0 && (
        <div>
          <div className="font-medium">Accommodations</div>
          <ul className="list-disc ml-5">
            {data.accommodations.map((s: string, i: number) => <li key={i}>{s}</li>)}
          </ul>
        </div>
      )}
      {Array.isArray(data.citations) && data.citations.length > 0 && (
        <div>
          <div className="font-medium">Citations</div>
          <ul className="list-disc ml-5 text-slate-600">
            {data.citations.map((c: any, i: number) => (
              <li key={i}>{c.doc_name || c.document_id} p.{c.page}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
