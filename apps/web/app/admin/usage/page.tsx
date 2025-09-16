"use client";
import { useEffect, useMemo, useState } from "react";

type DailyPoint = { day: string; count: number };
type UsageResp = {
  window: { from: string; to: string };
  totals: {
    agent_runs: number;
    letters_sent: number;
    deadlines: number;
    claims: number;
    eobs: number;
    notifications: number;
    events: number;
    cost_cents: number;
    tokens: number;
  };
  daily: { agent_runs: DailyPoint[]; letters_sent: DailyPoint[] };
  features: { type: string; count: number }[];
};

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8080";
const ADMIN_KEY = process.env.NEXT_PUBLIC_ADMIN_API_KEY || "";

export default function AdminUsagePage() {
  const [data, setData] = useState<UsageResp | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [windowKey, setWindowKey] = useState(30);

  const headerKey = useMemo(() => {
    if (typeof window !== "undefined") {
      const stored = window.localStorage.getItem("adminKey");
      if (stored) return stored;
    }
    return ADMIN_KEY;
  }, []);

  useEffect(() => {
    const base = API_BASE;
    const to = new Date();
    const from = new Date(Date.now() - windowKey * 24 * 3600 * 1000);
    setLoading(true);
    setError(null);
    fetch(`${base}/admin/usage?from=${from.toISOString().slice(0, 10)}&to=${to.toISOString().slice(0, 10)}`, {
      headers: headerKey ? { "x-admin-api-key": headerKey } : {}
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.statusText)))
      .then((payload) => {
        setData(payload);
        setLoading(false);
      })
      .catch((err) => {
        setError(String(err));
        setLoading(false);
      });
  }, [headerKey, windowKey]);

  const totals = data?.totals;
  const currency = totals ? (totals.cost_cents / 100).toLocaleString(undefined, { style: "currency", currency: "USD" }) : "$0.00";

  return (
    <div className="mx-auto w-full max-w-6xl space-y-10 py-8">
      <header className="space-y-3">
        <span className="inline-flex items-center rounded-full border border-brand-200 bg-brand-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.3em] text-brand-600">
          Admin insights
        </span>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-3xl font-heading text-slate-900">Usage & cost</h1>
            <p className="text-sm text-slate-600">Understand how teams are engaging Joslyn and where tokens are going.</p>
          </div>
          <select className="rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-500" value={windowKey} onChange={(e) => setWindowKey(Number(e.target.value))}>
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
          </select>
        </div>
        {!headerKey && <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-700">NEXT_PUBLIC_ADMIN_API_KEY not set. Provide one to pull real usage.</div>}
      </header>

      {error && <div className="rounded-3xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}
      {loading && <div className="rounded-3xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500">Loading usage…</div>}

      {data && (
        <>
          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard label="Agent runs" value={totals?.agent_runs ?? 0} />
            <MetricCard label="Letters sent" value={totals?.letters_sent ?? 0} />
            <MetricCard label="Deadlines tracked" value={totals?.deadlines ?? 0} />
            <MetricCard label="Model cost" value={currency} highlight />
          </section>

          <section className="grid gap-6 lg:grid-cols-2">
            <TrendCard title="Daily agent runs" description="Volume of Joslyn AI questions and actions" points={data.daily.agent_runs} color="brand" />
            <TrendCard title="Daily letters sent" description="Automated drafts and sends" points={data.daily.letters_sent} color="emerald" />
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-xl font-heading text-slate-900">Feature engagement</h2>
                <p className="text-sm text-slate-600">Top event types recorded by Joslyn.</p>
              </div>
              <span className="rounded-full border border-brand-200 bg-brand-50 px-4 py-1 text-xs font-semibold text-brand-600">{data.features.length} features</span>
            </div>
            <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Feature</th>
                    <th className="px-4 py-3 text-right">Events</th>
                  </tr>
                </thead>
                <tbody>
                  {data.features.map((f) => (
                    <tr key={f.type} className="border-t border-slate-100">
                      <td className="px-4 py-3 text-sm capitalize text-slate-600">{f.type.replace(/_/g, " ")}</td>
                      <td className="px-4 py-3 text-right text-sm font-semibold text-slate-700">{f.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function MetricCard({ label, value, highlight = false }: { label: string; value: number | string; highlight?: boolean }) {
  return (
    <div className={`rounded-3xl border ${highlight ? "border-brand-200 bg-gradient-to-br from-brand-50 via-white to-white" : "border-slate-200 bg-white"} p-6 shadow-sm`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-2 text-2xl font-heading text-slate-900">{value}</p>
    </div>
  );
}

function TrendCard({ title, description, points, color }: { title: string; description: string; points: DailyPoint[]; color: "brand" | "emerald" }) {
  const max = Math.max(...points.map((p) => p.count), 1);
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <h3 className="text-lg font-heading text-slate-900">{title}</h3>
      <p className="text-xs text-slate-500">{description}</p>
      <ul className="mt-4 space-y-2 text-xs text-slate-500">
        {points.map((point) => (
          <li key={point.day} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3">
            <span className="font-semibold text-slate-600">{new Date(point.day).toLocaleDateString()}</span>
            <div className="relative h-2 overflow-hidden rounded-full bg-slate-200/60">
              <div className={`absolute inset-y-0 left-0 rounded-full ${color === "emerald" ? "bg-emerald-400" : "bg-brand-500"}`} style={{ width: `${(point.count / max) * 100}%` }} />
            </div>
            <span className="text-slate-700">{point.count}</span>
          </li>
        ))}
        {points.length === 0 && <li className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-400">No activity recorded.</li>}
      </ul>
    </div>
  );
}

