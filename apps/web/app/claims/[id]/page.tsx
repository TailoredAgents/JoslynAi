"use client";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8080";

export default function ClaimPage() {
  const params = useParams<{ id: string }>();
  const claimId = params?.id ? String(params.id) : "";
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!claimId) return;
    setLoading(true);
    setError(null);
    fetch(`${API_BASE}/claims/${claimId}/explain`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.statusText)))
      .then(setData)
      .catch((err) => setError(String(err)))
      .finally(() => setLoading(false));
  }, [claimId]);

  const amountEntries = useMemo(() => Object.entries(data?.amounts || {}).map(([label, value]) => ({ label, value })), [data?.amounts]);

  if (!claimId) return <div className="p-6 text-sm text-slate-500">Loading claim�</div>;
  if (loading) return <div className="p-6 text-sm text-slate-500">Pulling claim details�</div>;
  if (error) return <div className="p-6 text-sm text-red-600">Unable to load claim: {error}</div>;
  if (!data) return <div className="p-6 text-sm text-slate-500">Claim not available.</div>;

  return (
    <div className="mx-auto w-full max-w-5xl space-y-10 py-8">
      <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="space-y-2">
          <span className="inline-flex items-center rounded-full border border-brand-200 bg-brand-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.3em] text-brand-600">
            Claim summary
          </span>
          <h1 className="text-3xl font-heading text-slate-900">Claim #{claimId}</h1>
          <p className="max-w-2xl text-sm text-slate-600">Ally interprets explanation of benefits so you can reconcile reimbursements and spot what needs follow-up.</p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs font-semibold text-brand-600">
          <Link className="rounded-full border border-brand-200 px-4 py-2 transition hover:border-brand-400" href="/claims">View all claims</Link>
          <Link className="rounded-full border border-brand-200 px-4 py-2 transition hover:border-brand-400" href={`/documents/${data?.document_id ?? ""}/view`}>
            View source document
          </Link>
        </div>
      </header>

      <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-6">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Ally explanation</p>
            <p className="mt-3 whitespace-pre-wrap text-sm text-slate-600">{data.explanation || "No explanation was generated."}</p>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Amounts at a glance</p>
            {amountEntries.length === 0 ? (
              <p className="mt-3 text-xs text-slate-500">No amounts listed.</p>
            ) : (
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {amountEntries.map(({ label, value }) => (
                  <div key={label} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <p className="text-xs uppercase tracking-wide text-slate-400">{label.replace(/_/g, " ")}</p>
                    <p className="mt-1 text-sm font-semibold text-slate-700">{formatCurrency(value)}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {data.denial_reason && (
            <div className="rounded-3xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-800">
              <p className="font-heading text-sm uppercase tracking-wide">Denial reason</p>
              <p className="mt-2 text-sm">{data.denial_reason}</p>
            </div>
          )}
        </div>

        <aside className="space-y-5">
          <div className="rounded-3xl border border-brand-100 bg-brand-50/70 p-6 text-xs text-brand-700">
            <p className="font-heading text-sm text-brand-700">Suggested follow-up</p>
            <ul className="mt-3 space-y-2 leading-relaxed">
              <li>� Compare service codes with your IEP minutes.</li>
              <li>� Attach supporting documentation under Documents.</li>
              <li>� Draft a reimbursement inquiry letter if anything looks off.</li>
            </ul>
          </div>
          <div className="rounded-3xl border border-slate-200 bg-white p-6 text-xs text-slate-500">
            <p className="font-heading text-sm text-slate-700">Need a hand?</p>
            <p className="mt-2">Email <Link className="font-semibold text-brand-600" href="mailto:hello@iepally.com">hello@iepally.com</Link> and our team will review this claim with you.</p>
          </div>
        </aside>
      </section>
    </div>
  );
}

function formatCurrency(value: any) {
  if (typeof value === "number") {
    return value.toLocaleString(undefined, { style: "currency", currency: "USD" });
  }
  if (typeof value === "string" && !Number.isNaN(Number(value))) {
    return Number(value).toLocaleString(undefined, { style: "currency", currency: "USD" });
  }
  return String(value);
}
