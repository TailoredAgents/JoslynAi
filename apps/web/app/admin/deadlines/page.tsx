"use client";
import { useEffect, useMemo, useState } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8080";
const ADMIN_KEY = process.env.NEXT_PUBLIC_ADMIN_API_KEY || "";

export default function AdminDeadlinesPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [childId, setChildId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  async function load() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (childId) params.set("child_id", childId);
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      const res = await fetch(`${API_BASE}/admin/deadlines?${params.toString()}`, {
        headers: ADMIN_KEY ? { "x-admin-api-key": ADMIN_KEY } : {},
      });
      const data = await res.json();
      setRows(Array.isArray(data) ? data : []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Admin: Deadlines</h2>
      {!ADMIN_KEY && (
        <div className="text-sm text-amber-700">Warning: NEXT_PUBLIC_ADMIN_API_KEY not set; requests may be unauthorized.</div>
      )}
      <div className="flex gap-2 items-end">
        <div>
          <label className="block text-sm">Child ID</label>
          <input className="border rounded px-2 py-1" value={childId} onChange={(e) => setChildId(e.target.value)} />
        </div>
        <div>
          <label className="block text-sm">From</label>
          <input type="date" className="border rounded px-2 py-1" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div>
          <label className="block text-sm">To</label>
          <input type="date" className="border rounded px-2 py-1" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <button className="bg-sky-500 text-white px-3 py-1 rounded" onClick={load}>Apply</button>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left border-b">
              <th className="py-2 pr-4">Due Date</th>
              <th className="py-2 pr-4">Kind</th>
              <th className="py-2 pr-4">Child</th>
              <th className="py-2 pr-4">Jurisdiction</th>
              <th className="py-2 pr-4">Source Doc</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td className="py-2" colSpan={5}>Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td className="py-2" colSpan={5}>No deadlines found.</td></tr>
            ) : rows.map((r) => (
              <tr key={r.id} className="border-b">
                <td className="py-2 pr-4">{new Date(r.due_date).toLocaleString()}</td>
                <td className="py-2 pr-4">{r.kind}</td>
                <td className="py-2 pr-4">{r.child_name || r.child_id}</td>
                <td className="py-2 pr-4">{r.jurisdiction}</td>
                <td className="py-2 pr-4">{r.source_doc_id || ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

