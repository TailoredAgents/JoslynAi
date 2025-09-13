"use client";
import { useEffect, useState } from "react";

type DailyPoint = { day: string; count: number };
type UsageResp = {
  window: { from: string; to: string };
  totals: {
    agent_runs: number; letters_sent: number; deadlines: number; claims: number; eobs: number;
    notifications: number; events: number; cost_cents: number; tokens: number;
  };
  daily: { agent_runs: DailyPoint[]; letters_sent: DailyPoint[] };
  features: { type: string; count: number }[];
};

export default function AdminUsagePage() {
  const [data, setData] = useState<UsageResp | null>(null);
  const [error, setError] = useState<string | null>(null);
  const from = new Date(Date.now() - 30*24*3600*1000).toISOString().slice(0,10);
  const to = new Date().toISOString().slice(0,10);

  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_ADMIN_API_KEY;
    fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8080"}/admin/usage?from=${from}&to=${to}`, {
      headers: { "x-admin-api-key": key || "" }
    })
      .then(r => r.ok ? r.json() : Promise.reject(r.statusText))
      .then(setData)
      .catch(e => setError(String(e)));
  }, []);

  if (error) return <div className="p-6 text-red-600">Usage error: {error}</div>;
  if (!data) return <div className="p-6">Loading usage…</div>;

  const t = data.totals;
  const currency = (t.cost_cents/100).toLocaleString(undefined, { style: "currency", currency: "USD" });

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-xl font-semibold">Admin • Usage & Cost</h1>
      <div className="text-sm text-gray-500">Window: {String(data.window.from).slice(0,10)} → {String(data.window.to).slice(0,10)}</div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card label="Agent runs" value={t.agent_runs} />
        <Card label="Letters sent" value={t.letters_sent} />
        <Card label="Deadlines" value={t.deadlines} />
        <Card label="Claims" value={t.claims} />
        <Card label="EOBs" value={t.eobs} />
        <Card label="Notifications" value={t.notifications} />
        <Card label="Events" value={t.events} />
        <Card label="Model cost" value={currency} />
      </div>

      <Section title="Daily • Agent runs">
        <TableSeries rows={data.daily.agent_runs} />
      </Section>

      <Section title="Daily • Letters sent">
        <TableSeries rows={data.daily.letters_sent} />
      </Section>

      <Section title="Feature Breakdown (events)">
        <table className="min-w-full text-sm">
          <thead><tr><th className="text-left p-2">Type</th><th className="text-right p-2">Count</th></tr></thead>
          <tbody>
            {data.features.map((f) => (
              <tr key={f.type} className="border-b">
                <td className="p-2">{f.type}</td>
                <td className="p-2 text-right">{f.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
    </div>
  );
}

function Card({label, value}:{label:string; value:string|number}) {
  return (
    <div className="border rounded p-4">
      <div className="text-xs uppercase text-gray-500">{label}</div>
      <div className="text-2xl font-semibold">{value}</div>
    </div>
  );
}
function Section({title, children}:{title:string; children:any}) {
  return (
    <div className="space-y-2">
      <h2 className="font-medium">{title}</h2>
      <div className="border rounded">{children}</div>
    </div>
  );
}
function TableSeries({rows}:{rows:DailyPoint[]}) {
  return (
    <table className="min-w-full text-sm">
      <thead><tr><th className="text-left p-2">Day</th><th className="text-right p-2">Count</th></tr></thead>
      <tbody>
        {rows.map(r => (
          <tr key={r.day} className="border-b">
            <td className="p-2">{r.day}</td>
            <td className="p-2 text-right">{r.count}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

