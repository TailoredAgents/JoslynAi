"use client";
import { useEffect, useMemo, useState } from "react";

type Rule = {
  id: string;
  jurisdiction: string;
  kind: string;
  delta_days: number;
  description?: string | null;
  source_url?: string | null;
  active: boolean;
};

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8080";
const ADMIN_KEY = process.env.NEXT_PUBLIC_ADMIN_API_KEY || "";

export default function AdminRulesPage() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true); setError(null);
    try {
      const res = await fetch(`${API_BASE}/admin/rules`, {
        headers: ADMIN_KEY ? { "x-admin-api-key": ADMIN_KEY } : {},
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setRules(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function save(r: Rule) {
    setSaving(r.id); setError(null);
    try {
      const res = await fetch(`${API_BASE}/admin/rules/${r.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(ADMIN_KEY ? { "x-admin-api-key": ADMIN_KEY } : {}),
        },
        body: JSON.stringify({
          delta_days: Number(r.delta_days) || 0,
          description: r.description || null,
          source_url: r.source_url || null,
          active: !!r.active,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await load();
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setSaving(null);
    }
  }

  function update(id: string, patch: Partial<Rule>) {
    setRules((rows) => rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Admin: Timeline Rules</h2>
      {!ADMIN_KEY && (
        <div className="text-sm text-amber-700">Warning: NEXT_PUBLIC_ADMIN_API_KEY not set; requests may be unauthorized.</div>
      )}
      {error && <div className="text-sm text-red-600">Error: {error}</div>}

      <div className="overflow-x-auto border rounded">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left border-b bg-gray-50">
              <th className="p-2">Jurisdiction</th>
              <th className="p-2">Kind</th>
              <th className="p-2">Delta (days)</th>
              <th className="p-2">Description</th>
              <th className="p-2">Source URL</th>
              <th className="p-2">Active</th>
              <th className="p-2 w-24">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td className="p-3" colSpan={7}>Loading…</td></tr>
            ) : rules.length === 0 ? (
              <tr><td className="p-3" colSpan={7}>No rules found.</td></tr>
            ) : (
              rules.map((r) => (
                <tr key={r.id} className="border-b align-top">
                  <td className="p-2 whitespace-nowrap">{r.jurisdiction}</td>
                  <td className="p-2 whitespace-nowrap">{r.kind}</td>
                  <td className="p-2 w-28">
                    <input
                      type="number"
                      className="border rounded px-2 py-1 w-24"
                      value={r.delta_days}
                      onChange={(e) => update(r.id, { delta_days: Number(e.target.value) })}
                    />
                  </td>
                  <td className="p-2">
                    <textarea
                      className="border rounded px-2 py-1 w-full h-16"
                      value={r.description || ""}
                      onChange={(e) => update(r.id, { description: e.target.value })}
                    />
                  </td>
                  <td className="p-2 w-64">
                    <input
                      className="border rounded px-2 py-1 w-full"
                      placeholder="https://…"
                      value={r.source_url || ""}
                      onChange={(e) => update(r.id, { source_url: e.target.value })}
                    />
                  </td>
                  <td className="p-2 w-16 text-center">
                    <input
                      type="checkbox"
                      checked={!!r.active}
                      onChange={(e) => update(r.id, { active: e.target.checked })}
                    />
                  </td>
                  <td className="p-2">
                    <button
                      className="bg-sky-600 text-white rounded px-3 py-1 disabled:opacity-60"
                      onClick={() => save(r)}
                      disabled={saving === r.id}
                    >
                      {saving === r.id ? "Saving…" : "Save"}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

