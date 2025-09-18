"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "/api/joslyn";
const ADMIN_KEY = process.env.NEXT_PUBLIC_ADMIN_API_KEY || "";

const kinds = [
  { id: "all", label: "All deadlines" },
  { id: "iep_annual_review", label: "Annual review" },
  { id: "re-evaluation", label: "Re-evaluation" },
  { id: "meeting_response", label: "Meeting response" }
];

type DeadlineRow = {
  id: string;
  due_date: string;
  kind: string;
  child_id: string;
  child_name?: string;
  jurisdiction: string;
  source_doc_id?: string;
};

export default function AdminDeadlinesPage() {
  const [rows, setRows] = useState<DeadlineRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [childId, setChildId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [selectedKind, setSelectedKind] = useState("all");
  const [error, setError] = useState<string | null>(null);

  const headerKey = useMemo(() => {
    if (typeof window !== "undefined") {
      const stored = window.localStorage.getItem("adminKey");
      if (stored) return stored;
    }
    return ADMIN_KEY;
  }, []);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (childId) params.set("child_id", childId);
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      if (selectedKind !== "all") params.set("kind", selectedKind);
      const res = await fetch(`${API_BASE}/admin/deadlines?${params.toString()}`, {
        headers: headerKey ? { "x-admin-api-key": headerKey } : {}
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setRows(Array.isArray(data) ? data : []);
    } catch (err: any) {
      setError(String(err?.message || err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedKind]);

  const summary = useMemo(() => ({
    total: rows.length,
    upcoming: rows.filter((r) => new Date(r.due_date) > new Date()).length,
    pastDue: rows.filter((r) => new Date(r.due_date) < new Date()).length
  }), [rows]);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-10 py-8">
      <header className="space-y-3">
        <span className="inline-flex items-center rounded-full border border-brand-200 bg-brand-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.3em] text-brand-600">
          Admin dashboard
        </span>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-3xl font-heading text-slate-900">Deadlines</h1>
            <p className="text-sm text-slate-600">Monitor timelines across children and jurisdictions. Filter or export to prep for meetings.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {kinds.map((kind) => (
              <button
                key={kind.id}
                onClick={() => setSelectedKind(kind.id)}
                className={`rounded-full border px-4 py-2 text-xs font-semibold transition ${selectedKind === kind.id ? "border-brand-400 bg-brand-50 text-brand-600" : "border-slate-200 text-slate-500 hover:border-brand-200"}`}
              >
                {kind.label}
              </button>
            ))}
          </div>
        </div>
        {!headerKey && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-700">
            NEXT_PUBLIC_ADMIN_API_KEY is not set. Provide an admin key to fetch live data.
          </div>
        )}
      </header>

      <section className="grid gap-4 sm:grid-cols-3">
        <SummaryCard label="Total" value={summary.total} tone="brand" />
        <SummaryCard label="Upcoming" value={summary.upcoming} tone="emerald" />
        <SummaryCard label="Past due" value={summary.pastDue} tone="rose" />
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-end gap-3 text-sm text-slate-600">
          <label className="flex flex-col">
            Child ID
            <input className="mt-1 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm" value={childId} onChange={(e) => setChildId(e.target.value)} />
          </label>
          <label className="flex flex-col">
            From
            <input type="date" className="mt-1 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm" value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="flex flex-col">
            To
            <input type="date" className="mt-1 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm" value={to} onChange={(e) => setTo(e.target.value)} />
          </label>
          <button className="inline-flex items-center rounded-full bg-brand-500 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-brand-600" onClick={load}>
            Apply filters
          </button>
        </div>

        <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Due</th>
                <th className="px-4 py-3">Kind</th>
                <th className="px-4 py-3">Child</th>
                <th className="px-4 py-3">Jurisdiction</th>
                <th className="px-4 py-3">Source doc</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td className="px-4 py-4 text-slate-500" colSpan={5}>Loading deadlines…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td className="px-4 py-4 text-slate-500" colSpan={5}>No deadlines match your filters.</td></tr>
              ) : (
                rows.map((r) => {
                  const due = new Date(r.due_date);
                  const status = due > new Date() ? "upcoming" : "past";
                  return (
                    <tr key={r.id} className="border-t border-slate-100">
                      <td className="px-4 py-3 text-sm text-slate-700">
                        <div className="font-semibold text-slate-800">{due.toLocaleDateString()}</div>
                        <div className="text-xs text-slate-500">{due.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600">{r.kind.replace(/_/g, " ")}</td>
                      <td className="px-4 py-3 text-sm text-slate-600">{r.child_name || r.child_id}</td>
                      <td className="px-4 py-3 text-sm text-slate-600">{r.jurisdiction}</td>
                      <td className="px-4 py-3 text-sm text-brand-600">
                        {r.source_doc_id ? (
                          <Link href={`/documents/${r.source_doc_id}/view`} className="underline">{r.source_doc_id}</Link>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <StatusPill status={status} />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {error && <div className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-700">{error}</div>}
      </section>
    </div>
  );
}

function SummaryCard({ label, value, tone }: { label: string; value: number; tone: "brand" | "emerald" | "rose" }) {
  const base = tone === "emerald" ? "from-emerald-50" : tone === "rose" ? "from-rose-50" : "from-brand-50";
  return (
    <div className={`rounded-3xl border border-slate-200 bg-gradient-to-br ${base} via-white to-white p-6 shadow-sm`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-2 text-2xl font-heading text-slate-900">{value}</p>
    </div>
  );
}

function StatusPill({ status }: { status: "upcoming" | "past" }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${status === "upcoming" ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}>
      {status === "upcoming" ? "Upcoming" : "Past due"}
    </span>
  );
}


