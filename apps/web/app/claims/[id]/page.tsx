"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8080";

export default function ClaimPage() {
  const params = useParams<{ id: string }>();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function run() {
      setLoading(true);
      try {
        const res = await fetch(`${API_BASE}/claims/${params?.id}/explain`);
        const d = await res.json();
        setData(d);
      } finally {
        setLoading(false);
      }
    }
    if (params?.id) run();
  }, [params?.id]);

  if (loading) return <div>Loading claim…</div>;
  if (!data) return <div>Claim not available.</div>;

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold">Claim</h2>
      <pre className="text-slate-700 whitespace-pre-wrap">{data.explanation}</pre>
      <div className="text-sm text-slate-600">Amounts: {JSON.stringify(data.amounts)}</div>
      {data.denial_reason && <div className="text-sm text-slate-600">Denial reason: {data.denial_reason}</div>}
    </div>
  );
}

